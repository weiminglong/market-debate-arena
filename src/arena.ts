// src/arena.ts
import chalk from "chalk";
import { fetchMarkets } from "./market-selector.js";
import { runDebater } from "./debater.js";
import { runJudge } from "./judge.js";
import { computeConsensus } from "./consensus.js";
import { scoreDebate } from "./scorer.js";
import { MOCK_MARKETS, mockDebater, mockJudge } from "./mock.js";
import { getShowcaseConditionIds } from "./showcase.js";
import type { DebateResult, GenerationResult, Market, Playbook } from "./types.js";
import type { AgentRuntime } from "./agent-runner.js";
import { saveGenerationResult } from "./results.js";

const NUM_JUDGES = 3;

async function runSingleDebate(
  market: Market,
  playbook: Playbook,
  verbose: boolean,
  mock: boolean = false,
  agentRuntime: AgentRuntime = "claude"
): Promise<DebateResult> {
  if (verbose) {
    console.log(chalk.cyan(`\n  Debating: "${market.question}"`));
    console.log(chalk.gray(`  Market price: ${market.latestPrice} | Platform: ${market.platform}`));
  }

  // Run YES and NO debaters in parallel
  if (verbose) console.log(chalk.yellow(mock ? "  Running mock debaters..." : "  Starting debaters..."));

  const [yesArgument, noArgument] = mock
    ? [mockDebater("YES", market, playbook), mockDebater("NO", market, playbook)]
    : await Promise.all([
        runDebater("YES", market, playbook, verbose, agentRuntime),
        runDebater("NO", market, playbook, verbose, agentRuntime),
      ]);

  if (verbose) {
    console.log(chalk.green(`  YES claims: ${yesArgument.claims.length}`));
    console.log(chalk.red(`  NO claims: ${noArgument.claims.length}`));
    console.log(chalk.yellow("  Judges deliberating..."));
  }

  // Run judges in parallel
  const votes = mock
    ? Array.from({ length: NUM_JUDGES }, () =>
        mockJudge(market.question, yesArgument, noArgument)
      )
    : await Promise.all(
        Array.from({ length: NUM_JUDGES }, () =>
          runJudge(market.question, yesArgument, noArgument, agentRuntime)
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
  showcase?: boolean;
  verbose: boolean;
  mock?: boolean;
  agentRuntime?: AgentRuntime;
  runId?: string;
}

export async function runGeneration(
  playbook: Playbook,
  options: ArenaOptions
): Promise<GenerationResult> {
  const generation = playbook.generation + 1;
  const runtime = options.agentRuntime || "claude";
  const runId =
    options.runId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  console.log(chalk.bold(`\n=== Generation ${generation} ===`));

  // Fetch markets
  let markets: Market[];
  if (options.mock) {
    markets = MOCK_MARKETS.slice(0, options.marketCount);
  } else {
    try {
      if (options.showcase) {
        const curatedIds = getShowcaseConditionIds(options.marketCount);
        const fetched = await Promise.all(
          curatedIds.map((conditionId) => fetchMarkets({ conditionId }))
        );
        const deduped = new Map<string, Market>();
        for (const market of fetched.flat()) {
          if (market.conditionId) {
            deduped.set(market.conditionId, market);
          }
        }
        markets = Array.from(deduped.values());
      } else {
        markets = await fetchMarkets({
          count: options.marketCount,
          conditionId: options.conditionId,
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("credits exhausted")) {
        console.log(chalk.yellow(`\n  Surf API credits exhausted — falling back to mock markets.`));
        console.log(chalk.gray(`  To use live data, run: surf auth --api-key <key>\n`));
        markets = MOCK_MARKETS.slice(0, options.marketCount);
        options.mock = true;
      } else {
        throw e;
      }
    }
  }

  console.log(`Found ${markets.length} markets to debate.\n`);

  // Run debates sequentially to avoid overwhelming the API
  const debates: DebateResult[] = [];
  for (const market of markets) {
    const result = await runSingleDebate(
      market,
      playbook,
      options.verbose,
      options.mock,
      runtime
    );
    debates.push(result);
  }

  const averageScore =
    Math.round(
      (debates.reduce((sum, d) => sum + d.score, 0) / debates.length) * 1000
    ) / 1000;

  const genResult: GenerationResult = {
    generation,
    debates,
    averageScore,
    playbook: { ...playbook, generation },
    metadata: {
      runId,
      createdAt: new Date().toISOString(),
      runtime,
      mock: Boolean(options.mock),
      showcase: Boolean(options.showcase),
    },
  };
  const filepath = saveGenerationResult(genResult);
  console.log(chalk.gray(`  Results saved: ${filepath}`));
  return genResult;
}
