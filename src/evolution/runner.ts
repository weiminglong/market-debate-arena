import chalk from "chalk";
import Table from "cli-table3";
import { formatDuration } from "../progress.js";
import { runGeneration, type ArenaOptions } from "../arena.js";
import { appendPlaybookHistory, loadPlaybook, savePlaybook } from "./playbook.js";
import { evolvePlaybook } from "./analyst.js";
import { mockAnalyst } from "../mock.js";
import type { EvolutionHistoryEntry, Playbook } from "../types.js";

// Scores are rounded to 3 decimals; anything below this is not a regression.
const SCORE_EPSILON = 1e-6;

export async function runEvolution(
  generations: number,
  options: ArenaOptions
): Promise<EvolutionHistoryEntry[]> {
  let playbook = loadPlaybook();
  const history: EvolutionHistoryEntry[] = [];
  let previousScore: number | null = null;

  // Accept/reject ratchet: remember the best-scoring playbook so a regressing
  // mutation is rolled back instead of accumulating forever.
  let bestScore = -Infinity;
  let bestPlaybook: Playbook = playbook;

  // The market panel is frozen after the first generation so later scores are
  // measured on the same questions and prices — otherwise the improvement
  // trend compares apples to oranges.
  let runOptions: ArenaOptions = options;

  let failure: Error | null = null;

  for (let i = 0; i < generations; i++) {
    let result;
    try {
      result = await runGeneration(playbook, runOptions);
    } catch (e: unknown) {
      failure = e instanceof Error ? e : new Error(String(e));
      console.error(chalk.red(`\n  Generation failed: ${failure.message}`));
      console.error(chalk.red(`  Stopping evolution; showing progress so far.`));
      break;
    }

    if (!runOptions.markets && result.debates.length > 0) {
      // Freeze the panel in the mode it actually ran in: if generation 1 fell
      // back to mock markets (credits exhausted), later generations must stay
      // mock — not run live agents on fabricated questions labeled LIVE.
      runOptions = {
        ...options,
        mock: result.metadata?.mock ?? options.mock,
        markets: result.debates.map((d) => d.market),
      };
    }

    const reverted =
      Number.isFinite(bestScore) && result.averageScore < bestScore - SCORE_EPSILON;
    if (!reverted) {
      bestScore = result.averageScore;
      bestPlaybook = playbook;
    }
    // Evolve from the best-known playbook: a regressing generation's mutations
    // are discarded, and the analyst learns about the failure via history.
    const basePlaybook = reverted ? bestPlaybook : playbook;

    console.log(chalk.yellow("\n  Analyst evolving strategy..."));
    let newPlaybook: Playbook;
    let keyMutation: string;
    // Decide by the mode the generation actually ran in (a credit-exhaustion
    // fallback flips a live run to mock mid-flight).
    const ranMock = result.metadata?.mock ?? Boolean(options.mock);
    if (ranMock) {
      const mockResult = mockAnalyst(basePlaybook, result.averageScore);
      newPlaybook = {
        generation: result.generation,
        lessons: mockResult.lessons,
        toolPriority: mockResult.toolPriority,
        avoidPatterns: mockResult.avoidPatterns,
      };
      keyMutation = mockResult.keyMutation;
    } else {
      const evolved = await evolvePlaybook(
        result,
        basePlaybook,
        options.agentRuntime || "claude",
        history
      );
      newPlaybook = evolved.playbook;
      keyMutation = evolved.keyMutation;
    }

    const improvement =
      previousScore === null
        ? "baseline"
        : previousScore > 0
          ? `${(((result.averageScore - previousScore) / previousScore) * 100).toFixed(1)}%`
          : `${(result.averageScore - previousScore).toFixed(3)}`;

    history.push({
      generation: result.generation,
      averageScore: result.averageScore,
      improvement,
      keyMutation,
      reverted,
      durationMs: result.metadata?.totalDurationMs,
    });

    console.log(chalk.bold(`\n  Generation ${result.generation} complete:`));
    console.log(`  Align*: ${result.averageScore} (${improvement})`);
    if (reverted) {
      console.log(
        chalk.red(`  Regression vs best (${bestScore.toFixed(3)}) — reverting to best playbook before mutating.`)
      );
    }
    console.log(`  Mutation: ${keyMutation}`);

    if (newPlaybook.lessons.length > 0) {
      console.log(chalk.gray(`  Lessons: ${newPlaybook.lessons.slice(0, 3).join("; ")}${newPlaybook.lessons.length > 3 ? "..." : ""}`));
    }

    playbook = newPlaybook;
    previousScore = result.averageScore;

    // A live run that degraded to mock mid-flight must not overwrite the
    // live-learned strategy state with canned mock mutations.
    const modeDegraded = ranMock !== Boolean(options.mock);
    if (modeDegraded) {
      console.log(
        chalk.yellow("  Mock-fallback generation — leaving persisted playbook untouched.")
      );
    } else {
      savePlaybook(playbook);
      appendPlaybookHistory({
        generation: result.generation,
        averageScore: result.averageScore,
        keyMutation,
        reverted,
        playbook: newPlaybook,
        createdAt: new Date().toISOString(),
      });
    }
  }

  printEvolutionTable(history);
  if (failure) {
    throw new Error(
      `evolution stopped after ${history.length} completed generation(s): ${failure.message}`
    );
  }
  return history;
}

function printEvolutionTable(history: EvolutionHistoryEntry[]): void {
  if (history.length === 0) {
    console.log(chalk.red("\nNo generations completed."));
    return;
  }

  console.log(chalk.bold("\n\n=== Evolution Summary ===\n"));

  const table = new Table({
    head: ["Gen", "Align*", "Change", "Time", "Key Mutation"],
    colWidths: [6, 10, 12, 9, 40],
    style: { head: ["cyan"] },
    wordWrap: true,
  });

  for (const row of history) {
    const changeColor = row.improvement === "baseline"
      ? chalk.gray
      : row.improvement.startsWith("-")
        ? chalk.red
        : chalk.green;
    const change = row.reverted ? `${row.improvement} ⏮` : row.improvement;
    table.push([
      String(row.generation),
      row.averageScore.toFixed(3),
      changeColor(change),
      formatDuration(row.durationMs),
      row.keyMutation,
    ]);
  }

  console.log(table.toString());
  console.log(
    chalk.gray("  * Align = calibration against the live market-implied probability (0-1, higher = closer).")
  );
  if (history.some((h) => h.reverted)) {
    console.log(chalk.gray("  ⏮ = regressed vs best score; playbook mutation rolled back"));
  }
  console.log("");
}
