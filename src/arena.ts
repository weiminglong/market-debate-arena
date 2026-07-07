// src/arena.ts
import chalk from "chalk";
import { fetchMarkets } from "./market-selector.js";
import { runDebater } from "./debater.js";
import { runJudge } from "./judge.js";
import { computeConsensus } from "./consensus.js";
import { scoreDebate } from "./scorer.js";
import { MOCK_MARKETS, mockDebater, mockJudge } from "./mock.js";
import { getShowcaseConditionIds } from "./showcase.js";
import { JUDGING, PRICE_BAND } from "./config.js";
import { startHeartbeat, formatDuration } from "./progress.js";
import { newRunId } from "./util.js";
import { SurfCreditsExhaustedError } from "./tools/surf-runner.js";
import type { DebateResult, GenerationResult, Market, Playbook, Vote } from "./types.js";
import type { AgentRuntime } from "./agent-runner.js";
import { saveGenerationResult } from "./results.js";

// Markets outside the price band (or no longer active) are effectively
// settled: any verdict against a 0.001 market scores ~0.999 and corrupts the
// alignment signal.
function isDebatable(market: Market): boolean {
  const statusOk = !market.status || market.status.toLowerCase() === "active";
  return (
    statusOk &&
    market.latestPrice >= PRICE_BAND.min &&
    market.latestPrice <= PRICE_BAND.max
  );
}

async function runSingleDebate(
  market: Market,
  playbook: Playbook,
  verbose: boolean,
  mock: boolean = false,
  agentRuntime: AgentRuntime = "claude"
): Promise<DebateResult> {
  const started = Date.now();

  // Run YES and NO debaters in parallel
  const stopDebaterHeartbeat = mock
    ? () => {}
    : startHeartbeat("debaters researching");
  let yesArgument;
  let noArgument;
  try {
    [yesArgument, noArgument] = mock
      ? [mockDebater("YES", market, playbook), mockDebater("NO", market, playbook)]
      : await Promise.all([
          runDebater("YES", market, playbook, verbose, agentRuntime),
          runDebater("NO", market, playbook, verbose, agentRuntime),
        ]);
  } finally {
    stopDebaterHeartbeat();
  }

  if (verbose) {
    console.log(chalk.green(`  YES claims: ${yesArgument.claims.length}`));
    console.log(chalk.red(`  NO claims: ${noArgument.claims.length}`));
  }

  // Run judges in parallel; a judge that fails (exec error or unparseable
  // vote) abstains rather than sinking a debate that still has a valid panel.
  const stopJudgeHeartbeat = mock ? () => {} : startHeartbeat("judges deliberating");
  let rawVotes: (Vote | null)[];
  try {
    rawVotes = mock
      ? Array.from({ length: JUDGING.judges }, () =>
          mockJudge(market, yesArgument, noArgument, playbook)
        )
      : await Promise.all(
          Array.from({ length: JUDGING.judges }, () =>
            runJudge(market.question, yesArgument, noArgument, agentRuntime).catch(
              (e: unknown) => {
                const msg = e instanceof Error ? e.message : String(e);
                console.log(chalk.yellow(`  Judge failed (abstaining): ${msg}`));
                return null;
              }
            )
          )
        );
  } finally {
    stopJudgeHeartbeat();
  }

  const votes = rawVotes.filter((v): v is Vote => v !== null);
  if (votes.length < JUDGING.minValidVotes) {
    throw new Error(
      `only ${votes.length}/${JUDGING.judges} judges returned a valid vote`
    );
  }
  if (votes.length < JUDGING.judges) {
    console.log(
      chalk.yellow(`  ${JUDGING.judges - votes.length} judge(s) abstained (unparseable vote)`)
    );
  }

  const consensus = computeConsensus(votes);
  const score = scoreDebate(consensus.winner, market.latestPrice);
  const durationMs = Date.now() - started;

  const winColor = consensus.winner === "YES" ? chalk.green : chalk.red;
  const voteBreakdown = `${votes.filter((v) => v.winner === "YES").length}-${votes.filter((v) => v.winner === "NO").length}`;
  console.log(
    `  Verdict: ${winColor(consensus.winner)} (${voteBreakdown}${consensus.unanimous ? " unanimous" : ""}, ` +
      `confidence ${consensus.averageConfidence}) — Align* ${score} — ${formatDuration(durationMs)}`
  );

  return { market, yesArgument, noArgument, consensus, score, durationMs };
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
// topped up from live crypto discovery when too few survive.
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
      // Credit exhaustion must reach runGeneration's mock fallback — it is
      // not a per-market condition that warnings-and-continuing can fix.
      if (result.reason instanceof SurfCreditsExhaustedError) throw result.reason;
      const msg =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
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
            `${market.status && market.status.toLowerCase() !== "active" ? `status ${market.status}` : `price ${market.latestPrice} outside ${PRICE_BAND.min}-${PRICE_BAND.max}`}`
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
      if (e instanceof SurfCreditsExhaustedError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
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
  const runId = options.runId || newRunId();
  const generationStarted = Date.now();
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
      if (e instanceof SurfCreditsExhaustedError) {
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
  for (let i = 0; i < markets.length; i++) {
    const market = markets[i];
    console.log(
      chalk.cyan(`  Debate ${i + 1}/${markets.length}: "${market.question}"`) +
        chalk.gray(` (price ${market.latestPrice}, ${market.platform})`)
    );
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
      totalDurationMs: Date.now() - generationStarted,
    },
  };
  const filepath = saveGenerationResult(genResult);
  console.log(chalk.gray(`  Results saved: ${filepath}`));
  return genResult;
}
