import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { runGeneration } from "./arena.js";
import { runEvolution } from "./evolution/runner.js";
import { ensureMockPlaybookIsolation, loadPlaybook } from "./evolution/playbook.js";
import { loadAllResults } from "./results.js";
import { showLatestShowcaseReport } from "./showcase-report.js";
import { parseAgentRuntime } from "./agent-runner.js";
import type { GenerationResult } from "./types.js";

const program = new Command();

function fmt3(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(3)
    : "n/a";
}

program
  .name("crypto-debate-arena")
  .description("Adversarial AI research benchmark on prediction markets")
  .option("-m, --markets <count>", "number of markets to debate", "3")
  .option("-g, --generations <count>", "number of evolution generations", "1")
  .option("--condition-id <id>", "specific Polymarket condition ID")
  .option("--showcase", "use curated showcase markets for a reliable demo", false)
  .option("--showcase-report", "show optimization report for latest saved run")
  .option("-v, --verbose", "show detailed agent activity", false)
  .option("--history", "show evolution history from saved results")
  .option("--mock", "use mock data instead of live APIs", false)
  .option(
    "--agent-runtime <runtime>",
    "agent runtime: claude or cursor (default: claude)"
  )
  .action(async (opts) => {
    if (opts.showcaseReport) {
      showLatestShowcaseReport();
      return;
    }

    if (opts.history) {
      showHistory();
      return;
    }

    if (opts.showcase && opts.conditionId) {
      throw new Error("--showcase cannot be used together with --condition-id.");
    }

    const agentRuntime = parseAgentRuntime(
      opts.agentRuntime || process.env.AGENT_RUNTIME
    );

    ensureMockPlaybookIsolation(Boolean(opts.mock));

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

    const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const arenaOptions = {
      marketCount: parseInt(opts.markets, 10),
      conditionId: opts.conditionId,
      showcase: opts.showcase,
      verbose: opts.verbose,
      mock: opts.mock,
      agentRuntime,
      runId,
    };

    const generations = parseInt(opts.generations, 10);

    if (generations > 1) {
      await runEvolution(generations, arenaOptions);
    } else {
      const playbook = loadPlaybook();
      const result = await runGeneration(playbook, arenaOptions);
      printScorecard(result);
    }
  });

function printScorecard(result: GenerationResult): void {
  console.log(chalk.bold("\n=== Scorecard ===\n"));

  const table = new Table({
    head: ["Market", "Winner", "Votes", "Mkt Price", "Score"],
    colWidths: [40, 8, 12, 11, 8],
    style: { head: ["cyan"] },
  });

  for (const debate of result.debates) {
    const question =
      debate.market.question.length > 38
        ? debate.market.question.slice(0, 35) + "..."
        : debate.market.question;
    const winColor =
      debate.consensus.winner === "YES" ? chalk.green : chalk.red;
    const voteBreakdown = `${debate.consensus.votes.filter((v) => v.winner === "YES").length}-${debate.consensus.votes.filter((v) => v.winner === "NO").length} ${debate.consensus.unanimous ? "(U)" : "(M)"}`;
    table.push([
      question,
      winColor(debate.consensus.winner),
      voteBreakdown,
      debate.market.latestPrice.toFixed(2),
      fmt3(debate.score),
    ]);
  }

  table.push([
    chalk.bold("Aggregate"),
    "",
    "",
    "",
    chalk.bold(fmt3(result.averageScore)),
  ]);

  console.log(table.toString());
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
    console.log(`${"Gen".padEnd(6)}${"Score".padEnd(10)}${"Mode".padEnd(6)}Markets`);
    console.log("-".repeat(40));
    for (const r of results) {
      const mode = r.metadata?.mock ? "mock" : "live";
      console.log(
        `${String(r.generation).padEnd(6)}${fmt3(r.averageScore).padEnd(10)}${mode.padEnd(6)}${Array.isArray(r.debates) ? r.debates.length : 0}`
      );
    }
    console.log("");
  }
}

try {
  await program.parseAsync(process.argv);
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(chalk.red(`\nError: ${msg}`));
  process.exitCode = 1;
}
