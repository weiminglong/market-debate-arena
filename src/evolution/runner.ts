import chalk from "chalk";
import Table from "cli-table3";
import { runGeneration, type ArenaOptions } from "../arena.js";
import { loadPlaybook, savePlaybook } from "./playbook.js";
import { evolvePlaybook } from "./analyst.js";
import { mockAnalyst } from "../mock.js";

interface EvolutionSummary {
  generation: number;
  averageScore: number;
  improvement: string;
  keyMutation: string;
}

export async function runEvolution(
  generations: number,
  options: ArenaOptions
): Promise<void> {
  let playbook = loadPlaybook();
  const history: EvolutionSummary[] = [];
  let previousScore = 0;

  for (let i = 0; i < generations; i++) {
    const result = await runGeneration(playbook, options);

    console.log(chalk.yellow("\n  Analyst evolving strategy..."));
    let newPlaybook;
    let keyMutation: string;
    if (options.mock) {
      const mockResult = mockAnalyst(playbook, result.averageScore);
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
        playbook,
        options.agentRuntime || "claude"
      );
      newPlaybook = evolved.playbook;
      keyMutation = evolved.keyMutation;
    }

    const improvement =
      previousScore === 0
        ? "baseline"
        : `${((result.averageScore - previousScore) / previousScore * 100).toFixed(1)}%`;

    history.push({
      generation: result.generation,
      averageScore: result.averageScore,
      improvement,
      keyMutation,
    });

    console.log(chalk.bold(`\n  Generation ${result.generation} complete:`));
    console.log(`  Score: ${result.averageScore} (${improvement})`);
    console.log(`  Mutation: ${keyMutation}`);

    if (newPlaybook.lessons.length > 0) {
      console.log(chalk.gray(`  Lessons: ${newPlaybook.lessons.slice(0, 3).join("; ")}${newPlaybook.lessons.length > 3 ? "..." : ""}`));
    }

    playbook = newPlaybook;
    previousScore = result.averageScore;
    savePlaybook(playbook);
  }

  printEvolutionTable(history);
}

function printEvolutionTable(history: EvolutionSummary[]): void {
  console.log(chalk.bold("\n\n=== Evolution Summary ===\n"));

  const table = new Table({
    head: ["Gen", "Score", "Change", "Key Mutation"],
    colWidths: [6, 10, 10, 48],
    style: { head: ["cyan"] },
  });

  for (const row of history) {
    const changeColor = row.improvement === "baseline"
      ? chalk.gray
      : row.improvement.startsWith("-")
        ? chalk.red
        : chalk.green;
    table.push([
      String(row.generation),
      row.averageScore.toFixed(3),
      changeColor(row.improvement),
      row.keyMutation,
    ]);
  }

  console.log(table.toString());
  console.log("");
}
