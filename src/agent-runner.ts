import { runClaude } from "./claude-runner.js";
import { runCursor } from "./cursor-runner.js";

export const SUPPORTED_AGENT_RUNTIMES = ["claude", "cursor"] as const;
export type AgentRuntime = (typeof SUPPORTED_AGENT_RUNTIMES)[number];

interface AgentRunOptions {
  systemPrompt?: string;
  allowBash?: boolean;
  model?: string;
}

interface ExecError extends Error {
  code?: string | number;
  killed?: boolean;
  signal?: string | null;
  stderr?: string;
}

export function parseAgentRuntime(runtime: string | undefined): AgentRuntime {
  if (!runtime) return "claude";

  const normalized = runtime.trim().toLowerCase();
  if (normalized === "claude" || normalized === "cursor") {
    return normalized;
  }

  throw new Error(
    `Unsupported agent runtime "${runtime}". Supported values: ${SUPPORTED_AGENT_RUNTIMES.join(", ")}`
  );
}

export function isTransientExecFailure(e: unknown): boolean {
  const err = e as ExecError;
  if (err?.killed === true || err?.signal === "SIGTERM") return true;
  const code = String(err?.code ?? "");
  return code === "ETIMEDOUT" || code === "ECONNRESET";
}

// execFile errors bury stderr under "Command failed: claude -p <kilobytes of
// prompt>"; surface the actionable part instead.
function wrapAgentError(runtime: AgentRuntime, e: unknown): Error {
  const err = e as ExecError;

  if (String(err?.code) === "ENOENT") {
    const cli = runtime === "cursor" ? "cursor-agent" : "claude";
    return new Error(
      `${cli} CLI not found. Install and authenticate it, or run with --mock (no live agents needed).`
    );
  }

  if (err?.killed === true || err?.signal === "SIGTERM") {
    return new Error(`${runtime} agent timed out`);
  }

  const stderr = err?.stderr?.trim();
  const firstLine = (err?.message || String(e)).split("\n")[0];
  const detail = stderr ? stderr.slice(0, 300) : firstLine.slice(0, 300);
  return new Error(`${runtime} agent failed: ${detail}`);
}

export async function runAgent(
  runtime: AgentRuntime,
  prompt: string,
  options: AgentRunOptions = {}
): Promise<string> {
  const exec = runtime === "cursor" ? runCursor : runClaude;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await exec(prompt, options);
    } catch (e: unknown) {
      lastError = e;
      if (isTransientExecFailure(e) && attempt === 0) {
        continue;
      }
      break;
    }
  }

  throw wrapAgentError(runtime, lastError);
}
