import { execFile } from "node:child_process";
import { promisify } from "node:util";
import chalk from "chalk";
import type { AgentRuntime } from "./agent-runner.js";

const execFileAsync = promisify(execFile);

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execFileAsync("which", [cmd], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

function checkNodeVersion(): CheckResult {
  const major = Number(process.versions.node.split(".")[0]);
  return {
    name: "node >= 22",
    ok: major >= 22,
    detail: `v${process.versions.node}`,
    fix: "Install Node 22+ (e.g. nvm install 22)",
  };
}

async function checkSurf(): Promise<CheckResult[]> {
  const onPath = await commandExists("surf");
  const checks: CheckResult[] = [
    {
      name: "surf CLI",
      ok: onPath,
      detail: onPath ? "found" : "not on PATH",
      fix: "curl -fsSL https://downloads.asksurf.ai/cli/releases/install.sh | sh",
    },
  ];
  if (onPath) {
    const authFix = "surf auth --api-key <key>  (get a key at https://agents.asksurf.ai)";
    try {
      const { stdout, stderr } = await execFileAsync("surf", ["auth"], { timeout: 10_000 });
      const output = `${stdout}\n${stderr}`.trim();
      // `surf auth` exits 0 even when no key is configured — inspect the text.
      const unauthenticated = /no api key|not authenticated|unauthenticated|not logged in/i.test(
        output
      );
      checks.push({
        name: "surf auth",
        ok: !unauthenticated,
        detail: output.split("\n")[0].slice(0, 60) || "ok",
        fix: unauthenticated ? authFix : undefined,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.split("\n")[0].slice(0, 80) : String(e);
      checks.push({
        name: "surf auth",
        ok: false,
        detail: `auth check failed: ${msg}`,
        fix: authFix,
      });
    }
  }
  return checks;
}

async function checkAgentCli(runtime: AgentRuntime): Promise<CheckResult> {
  const cli = runtime === "cursor" ? "cursor-agent" : "claude";
  const onPath = await commandExists(cli);
  return {
    name: `${cli} CLI (agent runtime: ${runtime})`,
    ok: onPath,
    detail: onPath ? "found" : "not on PATH",
    fix:
      runtime === "cursor"
        ? "Install and authenticate cursor-agent, or use --agent-runtime claude"
        : "Install and authenticate the claude CLI, or run with --mock",
  };
}

/**
 * Full environment check with pass/fail lines and fix commands.
 * Returns true when everything needed for a live run is in place.
 */
export async function runDoctor(runtime: AgentRuntime): Promise<boolean> {
  console.log(chalk.bold("\nEnvironment check\n"));

  const checks: CheckResult[] = [
    checkNodeVersion(),
    ...(await checkSurf()),
    await checkAgentCli(runtime),
  ];

  for (const check of checks) {
    const mark = check.ok ? chalk.green("✔") : chalk.red("✘");
    console.log(`  ${mark} ${check.name} — ${check.detail}`);
    if (!check.ok && check.fix) {
      console.log(chalk.gray(`      fix: ${check.fix}`));
    }
  }

  const allOk = checks.every((c) => c.ok);
  console.log(
    allOk
      ? chalk.green("\nAll checks passed — live runs are ready.\n")
      : chalk.yellow("\nSome checks failed. Mock mode works regardless: npm run demo\n")
  );
  return allOk;
}

/**
 * Existence-only checks (no auth calls, no credits) run before a live run so
 * missing CLIs fail in one second with a clear message instead of one failure
 * at a time mid-run.
 */
export async function preflightLive(runtime: AgentRuntime): Promise<void> {
  const missing: string[] = [];
  if (!(await commandExists("surf"))) missing.push("surf");
  const cli = runtime === "cursor" ? "cursor-agent" : "claude";
  if (!(await commandExists(cli))) missing.push(cli);

  if (missing.length > 0) {
    throw new Error(
      `Missing required CLI(s) for a live run: ${missing.join(", ")}. ` +
        `Run "npm run arena -- doctor" for install steps, or use --mock (fully offline).`
    );
  }
}
