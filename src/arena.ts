// src/arena.ts
import chalk from "chalk";
import { fetchMarkets } from "./market-selector.js";
import { runDebater } from "./debater.js";
import { runJudge } from "./judge.js";
import { computeConsensus, MIN_VALID_VOTES } from "./consensus.js";
import { scoreDebate } from "./scorer.js";
import { MOCK_MARKETS, mockDebater, mockJudge } from "./mock.js";
import { getShowcaseConditionIds } from "./showcase.js";
import type { DebateResult, GenerationResult, Market, Playbook, Vote } from "./types.js";
import type { AgentRuntime } from "./agent-runner.js";
import { saveGenerationResult } from "./results.js";

const NUM_JUDGES = 3;

// Markets outside this price band (or no longer active) are effectively
// settled: any verdict against a 0.001 market scores ~0.999 and corrupts the
// alignment signal.
const MIN_DEBATABLE_PRICE = 0.1;
const MAX_DEBATABLE_PRICE = 0.9;

function isDebatable(market: Market): boolean {
  const statusOk = !market.status || market.status.toLowerCase() === "active";
  return (
    statusOk &&
    market.latestPrice >= MIN_DEBATABLE_PRICE &&
    market.latestPrice <= MAX_DEBATABLE_PRICE
  );
}

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

  // Run judges in parallel; a judge that fails (exec error or unparseable
  // vote) abstains rather than sinking a debate that still has a valid panel.
  const rawVotes = mock
    ? Array.from({ length: NUM_JUDGES }, () =>
        mockJudge(market, yesArgument, noArgument, playbook)
      )
    : await Promise.all(
        Array.from({ length: NUM_JUDGES }, () =>
          runJudge(market.question, yesArgument, noArgument, agentRuntime).catch(
            (e: unknown) => {
              const msg = e instanceof Error ? e.message : String(e);
              console.log(chalk.yellow(`  Judge failed (abstaining): ${msg}`));
              return null;
            }
          )
        )
      );

  const votes = rawVotes.filter((v): v is Vote => v !== null);
  if (votes.length < MIN_VALID_VOTES) {
    throw new Error(
      `only ${votes.length}/${NUM_JUDGES} judges returned a valid vote`
    );
  }
  if (votes.length < NUM_JUDGES && verbose) {
    console.log(chalk.yellow(`  ${NUM_JUDGES - votes.length} judge(s) abstained (unparseable vote)`));
  }

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
  /** Pre-selected market panel; skips fetching. Used to freeze the panel across generations. */
  markets?: Market[];
}

// Curated showcase IDs can expire between rehearsal and stage time, so each is
// fetched independently (one failure must not sink the run), validated, and
// topped up from live discovery when too few survive.
async function fetchShowcaseMarkets(count: number, verbose: boolean): Promise<Market[]> {
  const curatedIds = getShowcaseConditionIds(count);
  const settled = await Promise.allSettled(
    curatedIds.map((conditionId) => fetchMarkets({ conditionId }))
  );

  const deduped = new Map<string, Market>();
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") {
      for (const market of result.value) {
        if (market.conditionId) deduped.set(market.conditionId, market);
      }
    } else {
      const msg =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      // Credit exhaustion must reach runGeneration's mock fallback — it is
      // not a per-market condition that warnings-and-continuing can fix.
      if (msg.includes("credits exhausted")) throw result.reason;
      console.log(
        chalk.yellow(`  Warning: curated market ${curatedIds[i].slice(0, 18)}... fetch failed: ${msg}`)
      );
    }
  });

  const valid: Market[] = [];
  for (const market of deduped.values()) {
    if (isDebatable(market)) {
      valid.push(market);
    } else {
      console.log(
        chalk.yellow(
          `  Warning: skipping curated market "${market.question.slice(0, 50)}" — ` +
            `${market.status && market.status.toLowerCase() !== "active" ? `status ${market.status}` : `price ${market.latestPrice} outside ${MIN_DEBATABLE_PRICE}-${MAX_DEBATABLE_PRICE}`}`
        )
      );
    }
  }

  if (valid.length < count) {
    if (verbose) {
      console.log(chalk.gray(`  Topping up showcase panel from live discovery...`));
    }
    try {
      // Keep the crypto-debate demo on crypto questions when topping up.
      const discovered = await fetchMarkets({ count: count * 2, category: "crypto" });
      const have = new Set(valid.map((m) => m.conditionId));
      for (const market of discovered) {
        if (valid.length >= count) break;
        if (!have.has(market.conditionId) && isDebatable(market)) {
          valid.push(market);
          have.add(market.conditionId);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("credits exhausted")) throw e;
      console.log(chalk.yellow(`  Warning: discovery top-up failed: ${msg}`));
    }
  }

  return valid.slice(0, count);
}

export async function runGeneration(
  playbook: Playbook,
  options: ArenaOptions
): Promise<GenerationResult> {
  const generation = playbook.generation + 1;
  const runtime = options.agentRuntime || "claude";
  const runId =
    options.runId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  // Never mutate the shared options object: a credit-exhaustion fallback in
  // one generation must not silently convert the rest of the run to mock.
  let useMock = Boolean(options.mock);
  console.log(chalk.bold(`\n=== Generation ${generation} ===`));

  // Fetch markets
  let markets: Market[];
  if (options.markets) {
    markets = options.markets;
  } else if (useMock) {
    markets = MOCK_MARKETS.slice(0, options.marketCount);
  } else {
    try {
      if (options.showcase) {
        markets = await fetchShowcaseMarkets(options.marketCount, options.verbose);
      } else {
        markets = await fetchMarkets({
          count: options.marketCount,
          conditionId: options.conditionId,
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("credits exhausted")) {
        console.log(chalk.bgYellow.black("\n  ⚠ SURF CREDITS EXHAUSTED — this generation runs on SIMULATED (mock) data  "));
        console.log(chalk.gray(`  To use live data, run: surf auth --api-key <key>\n`));
        markets = MOCK_MARKETS.slice(0, options.marketCount);
        useMock = true;
      } else {
        throw e;
      }
    }
  }

  if (markets.length === 0) {
    throw new Error(
      "No debatable markets available. Check surf auth / market availability, or run with --mock."
    );
  }

  console.log(`Found ${markets.length} markets to debate.\n`);

  // Run debates sequentially to avoid overwhelming the API; one failed debate
  // is skipped instead of discarding the whole generation.
  const debates: DebateResult[] = [];
  const failures: string[] = [];
  for (const market of markets) {
    try {
      const result = await runSingleDebate(
        market,
        playbook,
        options.verbose,
        useMock,
        runtime
      );
      debates.push(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(msg);
      console.log(
        chalk.yellow(`  Skipping market "${market.question.slice(0, 60)}": ${msg}`)
      );
    }
  }

  if (debates.length === 0) {
    throw new Error(
      `all ${markets.length} debates failed — last error: ${failures[failures.length - 1]}`
    );
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
      mock: useMock,
      showcase: Boolean(options.showcase),
    },
  };
  const filepath = saveGenerationResult(genResult);
  console.log(chalk.gray(`  Results saved: ${filepath}`));
  return genResult;
}
