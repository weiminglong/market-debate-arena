import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runGeneration } from "./arena.js";
import { runEvolution } from "./evolution/runner.js";
import { loadPlaybook } from "./evolution/playbook.js";
import { loadAllResults } from "./results.js";
import { parseAgentRuntime } from "./agent-runner.js";
import type { GenerationResult } from "./types.js";

const program = new Command();

program
  .name("crypto-debate-arena")
  .description("Adversarial AI research benchmark on prediction markets")
  .option("-m, --markets <count>", "number of markets to debate", "3")
  .option("-g, --generations <count>", "number of evolution generations", "1")
  .option("--condition-id <id>", "specific Polymarket condition ID")
  .option("-v, --verbose", "show detailed agent activity", false)
  .option("--history", "show evolution history from saved results")
  .option("--mock", "use mock data instead of live APIs", false)
  .option(
    "--agent-runtime <runtime>",
    "agent runtime: claude or cursor (default: claude)"
  )
  .action(async (opts) => {
    if (opts.history) {
      showHistory();
      return;
    }

    let agentRuntime;
    try {
      agentRuntime = parseAgentRuntime(
        opts.agentRuntime || process.env.AGENT_RUNTIME
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(chalk.red(`Error: ${msg}`));
      process.exitCode = 1;
      return;
    }

    console.log(chalk.bold(`
  ╔══════════════════════════════════════════════════╗
  ║           CRYPTO DEBATE ARENA                    ║
  ║   Adversarial AI Research Benchmark              ║
  ║   on Prediction Markets                          ║
  ╚══════════════════════════════════════════════════╝
`));
    if (opts.mock) {
      console.log(chalk.yellow("  Mode: MOCK (simulated data)\n"));
    } else {
      console.log(chalk.green("  Mode: LIVE (real-time crypto data via surf)\n"));
    }
    console.log(chalk.cyan(`  Agent runtime: ${agentRuntime}\n`));

    const arenaOptions = {
      marketCount: parseInt(opts.markets, 10),
      conditionId: opts.conditionId,
      verbose: opts.verbose,
      mock: opts.mock,
      agentRuntime,
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
      debate.score.toFixed(3),
    ]);
  }

  table.push([
    chalk.bold("Aggregate"),
    "",
    "",
    "",
    chalk.bold(result.averageScore.toFixed(3)),
  ]);

  console.log(table.toString());
  console.log("");
}

function showHistory(): void {
  try {
    const raw = readFileSync(
      join(process.cwd(), "strategies", "playbook.json"),
      "utf-8"
    );
    const playbook = JSON.parse(raw);
    console.log(chalk.bold("\nCurrent Playbook:\n"));
    console.log(`Generation: ${playbook.generation || 0}`);
    console.log(
      `Lessons: ${
        (playbook.lessons || []).length > 0
          ? (playbook.lessons as string[]).join("\n  - ")
          : "(none)"
      }`
    );
    console.log(`Tool priority: ${(playbook.toolPriority || []).join(", ")}`);
    console.log(
      `Avoid: ${
        (playbook.avoidPatterns || []).length > 0
          ? (playbook.avoidPatterns as string[]).join("; ")
          : "(none)"
      }`
    );
    console.log("");
  } catch {
    console.log("No playbook found. Run a generation first.");
  }

  const results = loadAllResults();
  if (results.length > 0) {
    console.log(chalk.bold("Generation History:\n"));
    console.log(`${"Gen".padEnd(6)}${"Score".padEnd(10)}Markets`);
    console.log("-".repeat(40));
    for (const r of results) {
      console.log(
        `${String(r.generation).padEnd(6)}${r.averageScore.toFixed(3).padEnd(10)}${r.debates.length}`
      );
    }
    console.log("");
  }
}

program.parse();
