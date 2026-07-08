import { Command, InvalidArgumentError, Option } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { runGeneration } from "./arena.js";
import { runEvolution } from "./evolution/runner.js";
import { ensureMockPlaybookIsolation, loadPlaybook } from "./evolution/playbook.js";
import { loadAllResults, pruneResults, summarizeRuns } from "./results.js";
import { showLatestShowcaseReport } from "./showcase-report.js";
import { parseAgentRuntime } from "./agent-runner.js";
import { runDoctor, preflightLive } from "./doctor.js";
import { activeConfigOverrides } from "./config.js";
import { formatDuration } from "./progress.js";
import { newRunId } from "./util.js";
import type { GenerationResult } from "./types.js";

const ALIGN_FOOTNOTE =
  "* Align = market-implied probability of the side the panel picked (directional agreement, weighted by market confidence — not distance to the price).";

const EDGE_FOOTNOTE =
  "Edge = model P(YES) − market price (price-blind estimate). Call fires when |edge| clears the threshold; EV = |edge| per $1.";

function fmt3(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(3)
    : "n/a";
}

function positiveInt(label: string, max: number) {
  return (value: string): number => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > max) {
      throw new InvalidArgumentError(`${label} must be an integer between 1 and ${max}.`);
    }
    return n;
  };
}

interface RunFlags {
  markets: number;
  generations: number;
  conditionId?: string;
  showcase?: boolean;
  verbose: boolean;
  mock: boolean;
  agentRuntime?: string;
}

async function runAction(opts: RunFlags): Promise<void> {
  const agentRuntime = parseAgentRuntime(
    opts.agentRuntime || process.env.AGENT_RUNTIME
  );

  ensureMockPlaybookIsolation(Boolean(opts.mock));

  // Fail on missing CLIs in one second, before any credits or minutes are
  // spent. Existence checks only — `arena doctor` does the full pass.
  if (!opts.mock) {
    await preflightLive(agentRuntime);
  }

  console.log(chalk.bold(`
  ╔══════════════════════════════════════════════════╗
  ║           CRYPTO DEBATE ARENA                    ║
  ║   Adversarial AI Research Benchmark              ║
  ║   on Prediction Markets                          ║
  ╚══════════════════════════════════════════════════╝
`));
  if (opts.mock) {
    console.log(chalk.yellow("  Mode: MOCK (simulated data — results are illustrative, not live)\n"));
  } else {
    console.log(chalk.green("  Mode: LIVE (real-time crypto data via surf)\n"));
  }
  if (opts.showcase && !opts.mock) {
    console.log(chalk.magenta("  Showcase mode: curated live market set\n"));
  }
  console.log(chalk.cyan(`  Agent runtime: ${agentRuntime}\n`));
  const overrides = activeConfigOverrides();
  if (overrides.length > 0) {
    console.log(chalk.gray(`  Config overrides: ${overrides.join(", ")}\n`));
  }

  const arenaOptions = {
    marketCount: opts.markets,
    conditionId: opts.conditionId,
    showcase: opts.showcase,
    verbose: opts.verbose,
    mock: opts.mock,
    agentRuntime,
    runId: newRunId(),
  };

  if (opts.generations > 1) {
    await runEvolution(opts.generations, arenaOptions);
  } else {
    const playbook = loadPlaybook();
    const result = await runGeneration(playbook, arenaOptions);
    printScorecard(result);
  }
}

function printScorecard(result: GenerationResult): void {
  console.log(chalk.bold("\n=== Scorecard ===\n"));

  const table = new Table({
    head: ["Market", "Mkt P", "Model P", "Edge", "Call", "Panel"],
    colWidths: [36, 7, 9, 8, 10, 8],
    style: { head: ["cyan"] },
  });

  for (const debate of result.debates) {
    const question =
      debate.market.question.length > 34
        ? debate.market.question.slice(0, 31) + "..."
        : debate.market.question;
    const callColor =
      debate.recommendation === "BUY_YES"
        ? chalk.green
        : debate.recommendation === "BUY_NO"
          ? chalk.red
          : chalk.gray;
    const yes = debate.consensus.votes.filter((v) => v.winner === "YES").length;
    const no = debate.consensus.votes.filter((v) => v.winner === "NO").length;
    const panel = `${yes}-${no}${debate.consensus.unanimous ? "U" : ""}`;
    table.push([
      question,
      debate.market.latestPrice.toFixed(2),
      debate.consensus.modelProbability.toFixed(2),
      (debate.edge >= 0 ? "+" : "") + debate.edge.toFixed(2),
      callColor(debate.recommendation),
      panel,
    ]);
  }

  console.log(table.toString());

  const actionable = result.debates.filter((d) => d.recommendation !== "PASS");
  const meanAbsEdge =
    result.debates.reduce((s, d) => s + Math.abs(d.edge), 0) / result.debates.length;
  console.log(
    chalk.bold(
      `\n  ${actionable.length}/${result.debates.length} actionable ` +
        `(|edge| ≥ threshold) · mean |edge| ${fmt3(meanAbsEdge)} · Align* ${fmt3(result.averageScore)}`
    )
  );
  console.log(chalk.gray(`\n  ${EDGE_FOOTNOTE}`));
  console.log(chalk.gray(`  ${ALIGN_FOOTNOTE}`));
  console.log("");
}

function showHistory(): void {
  const playbook = loadPlaybook();
  console.log(chalk.bold("\nCurrent Playbook:\n"));
  console.log(`Generation: ${playbook.generation}`);
  console.log(
    `Lessons: ${
      playbook.lessons.length > 0 ? playbook.lessons.join("\n  - ") : "(none)"
    }`
  );
  console.log(`Tool priority: ${playbook.toolPriority.join(", ")}`);
  console.log(
    `Avoid: ${
      playbook.avoidPatterns.length > 0
        ? playbook.avoidPatterns.join("; ")
        : "(none)"
    }`
  );
  console.log("");

  const results = loadAllResults();
  if (results.length > 0) {
    console.log(chalk.bold("Generation History:\n"));
    console.log(`${"Gen".padEnd(6)}${"Align*".padEnd(10)}${"Mode".padEnd(6)}Markets`);
    console.log("-".repeat(40));
    for (const r of results) {
      const mode = r.metadata?.mock ? "mock" : "live";
      console.log(
        `${String(r.generation).padEnd(6)}${fmt3(r.averageScore).padEnd(10)}${mode.padEnd(6)}${Array.isArray(r.debates) ? r.debates.length : 0}`
      );
    }
    console.log(chalk.gray(ALIGN_FOOTNOTE));
    console.log("");
  }
}

function showRuns(): void {
  const runs = summarizeRuns();
  if (runs.length === 0) {
    console.log("No saved runs. Start with: npm run demo");
    return;
  }

  const table = new Table({
    head: ["Run", "Started", "Mode", "Runtime", "Gens", "Time"],
    colWidths: [18, 22, 7, 9, 6, 9],
    style: { head: ["cyan"] },
  });
  for (const run of runs) {
    table.push([
      run.runId,
      run.createdAt.replace("T", " ").slice(0, 19) || "?",
      run.mock ? "mock" : "live",
      run.runtime,
      String(run.generations),
      run.totalDurationMs > 0 ? formatDuration(run.totalDurationMs) : "-",
    ]);
  }
  console.log(table.toString());
  console.log(
    chalk.gray(`  ${runs.length} run(s); latest is last. Details: npm run arena -- report\n`)
  );
}

const program = new Command()
  .name("arena")
  .description(
    "Adversarial AI research benchmark on prediction markets.\n" +
      "Agents research crypto questions with live data, debate opposing sides,\n" +
      "and are judged by a consensus panel; strategies evolve across generations."
  );

program
  .command("run", { isDefault: true })
  .description("run debates: a single generation, or evolution with -g <n>")
  .option(
    "-m, --markets <count>",
    "number of markets to debate (1-20)",
    positiveInt("--markets", 20),
    3
  )
  .option(
    "-g, --generations <count>",
    "number of evolution generations (1-50)",
    positiveInt("--generations", 50),
    1
  )
  .option("--condition-id <id>", "specific Polymarket condition ID")
  .addOption(
    new Option("--showcase", "use curated showcase markets for a reliable demo").conflicts(
      "conditionId"
    )
  )
  .option("-v, --verbose", "show detailed agent activity", false)
  .option("--mock", "use simulated data — fully offline, no CLIs or keys needed", false)
  .option("--agent-runtime <runtime>", "agent runtime: claude or cursor (default: claude)")
  .action(runAction);

program
  .command("report")
  .description("optimization report (Align*/RQI trend) for the latest run")
  .action(() => showLatestShowcaseReport());

program
  .command("history")
  .description("current playbook and generation history")
  .action(() => showHistory());

program
  .command("runs")
  .description("list saved runs")
  .action(() => showRuns());

program
  .command("prune")
  .description("delete result files from old runs")
  .option("--keep <n>", "number of most recent runs to keep", positiveInt("--keep", 1000), 5)
  .action((opts: { keep: number }) => {
    const deleted = pruneResults(opts.keep);
    if (deleted.length === 0) {
      console.log(`Nothing to prune (keeping the ${opts.keep} most recent runs).`);
    } else {
      console.log(`Deleted ${deleted.length} result file(s); kept the ${opts.keep} most recent runs.`);
    }
  });

program
  .command("doctor")
  .description("check required CLIs and auth for live runs")
  .option("--agent-runtime <runtime>", "agent runtime to check: claude or cursor")
  .action(async (opts: { agentRuntime?: string }) => {
    const runtime = parseAgentRuntime(opts.agentRuntime || process.env.AGENT_RUNTIME);
    const ok = await runDoctor(runtime);
    if (!ok) process.exitCode = 1;
  });

program.addHelpText(
  "after",
  `
Examples:
  $ npm run demo                        offline 2-minute showcase (no keys needed)
  $ npm run arena -- run --mock -g 3    offline mock evolution
  $ npm run arena -- doctor             check live-run prerequisites
  $ npm run arena -- run -m 3 -v        live: one generation on 3 markets
  $ npm run arena -- run --showcase -g 4  live: curated demo markets, 4 generations
  $ npm run arena -- report             Align*/RQI trend for the latest run
`
);

// `run` being the default command means commander routes typos and removed
// flags into it with misleading errors — intercept those before parsing.
const KNOWN_COMMANDS = new Set(["run", "report", "history", "runs", "prune", "doctor", "help"]);
const RENAMED_FLAGS: Record<string, string> = {
  "--history": "history",
  "--showcase-report": "report",
};

const firstArg = process.argv[2];
const renamedFlag = process.argv.slice(2).find((a) => RENAMED_FLAGS[a]);

if (process.argv.length <= 2) {
  // A bare invocation must orient, not start a live credit-spending run.
  program.outputHelp();
} else if (renamedFlag) {
  console.error(
    chalk.red(
      `Error: '${renamedFlag}' is now a subcommand — use: npm run arena -- ${RENAMED_FLAGS[renamedFlag]}`
    )
  );
  process.exitCode = 1;
} else if (firstArg && !firstArg.startsWith("-") && !KNOWN_COMMANDS.has(firstArg)) {
  console.error(
    chalk.red(
      `Error: unknown command '${firstArg}'. Commands: run, report, history, runs, prune, doctor (see --help).`
    )
  );
  process.exitCode = 1;
} else {
  try {
    await program.parseAsync(process.argv);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(chalk.red(`\nError: ${msg}`));
    process.exitCode = 1;
  }
}

