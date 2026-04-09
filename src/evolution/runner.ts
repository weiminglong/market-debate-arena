import chalk from "chalk";
import { runGeneration, type ArenaOptions } from "../arena.js";
import { loadPlaybook, savePlaybook } from "./playbook.js";
import { evolvePlaybook } from "./analyst.js";

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
    const { playbook: newPlaybook, keyMutation } = await evolvePlaybook(
      result,
      playbook
    );

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
  console.log(
    `${"Gen".padEnd(6)}${"Score".padEnd(10)}${"Change".padEnd(12)}Mutation`
  );
  console.log("-".repeat(70));

  for (const row of history) {
    const scoreStr = row.averageScore.toFixed(3).padEnd(10);
    const changeStr = row.improvement.padEnd(12);
    console.log(`${String(row.generation).padEnd(6)}${scoreStr}${changeStr}${row.keyMutation}`);
  }

  console.log("");
}
