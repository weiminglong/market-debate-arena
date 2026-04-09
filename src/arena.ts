// src/arena.ts
import chalk from "chalk";
import { fetchMarkets } from "./market-selector.js";
import { runDebater } from "./debater.js";
import { runJudge } from "./judge.js";
import { computeConsensus } from "./consensus.js";
import { scoreDebate } from "./scorer.js";
import type { DebateResult, GenerationResult, Market, Playbook } from "./types.js";

const NUM_JUDGES = 3;

async function runSingleDebate(
  market: Market,
  playbook: Playbook,
  verbose: boolean
): Promise<DebateResult> {
  if (verbose) {
    console.log(chalk.cyan(`\n  Debating: "${market.question}"`));
    console.log(chalk.gray(`  Market price: ${market.latestPrice} | Platform: ${market.platform}`));
  }

  // Run YES and NO debaters in parallel
  if (verbose) console.log(chalk.yellow("  Starting debaters..."));

  const [yesArgument, noArgument] = await Promise.all([
    runDebater("YES", market, playbook, verbose),
    runDebater("NO", market, playbook, verbose),
  ]);

  if (verbose) {
    console.log(chalk.green(`  YES claims: ${yesArgument.claims.length}`));
    console.log(chalk.red(`  NO claims: ${noArgument.claims.length}`));
    console.log(chalk.yellow("  Judges deliberating..."));
  }

  // Run judges in parallel
  const votes = await Promise.all(
    Array.from({ length: NUM_JUDGES }, () =>
      runJudge(market.question, yesArgument, noArgument)
    )
  );

  const consensus = computeConsensus(votes);
  const score = scoreDebate(consensus.winner, market.latestPrice);

  if (verbose) {
    const winColor = consensus.winner === "YES" ? chalk.green : chalk.red;
    console.log(
      `  Verdict: ${winColor(consensus.winner)} (${consensus.unanimous ? "unanimous" : "majority"}, confidence: ${consensus.averageConfidence})`
    );
    console.log(`  Score: ${chalk.bold(String(score))}`);
  }

  return { market, yesArgument, noArgument, consensus, score };
}

export interface ArenaOptions {
  marketCount: number;
  conditionId?: string;
  verbose: boolean;
}

export async function runGeneration(
  playbook: Playbook,
  options: ArenaOptions
): Promise<GenerationResult> {
  const generation = playbook.generation + 1;
  console.log(chalk.bold(`\n=== Generation ${generation} ===`));

  // Fetch markets
  const markets = await fetchMarkets({
    count: options.marketCount,
    conditionId: options.conditionId,
  });

  console.log(`Found ${markets.length} markets to debate.\n`);

  // Run debates sequentially to avoid overwhelming the API
  const debates: DebateResult[] = [];
  for (const market of markets) {
    const result = await runSingleDebate(market, playbook, options.verbose);
    debates.push(result);
  }

  const averageScore =
    Math.round(
      (debates.reduce((sum, d) => sum + d.score, 0) / debates.length) * 1000
    ) / 1000;

  return {
    generation,
    debates,
    averageScore,
    playbook: { ...playbook, generation },
  };
}
