// src/arena.ts
import chalk from "chalk";
import { fetchMarkets } from "./market-selector.js";
import { runDebater } from "./debater.js";
import { runJudge } from "./judge.js";
import { computeConsensus } from "./consensus.js";
import {
  scoreDebate,
  computeEdge,
  recommendTrade,
  aggregateProbabilities,
  noiseAdjustedThreshold,
} from "./scorer.js";
import { MOCK_MARKETS, mockDebater, mockJudge } from "./mock.js";
import { getShowcaseConditionIds } from "./showcase.js";
import { EDGE, JUDGING, PRICE_BAND } from "./config.js";
import { stripMarketLookupClaims, detectPriceLeak } from "./blind.js";
import { startHeartbeat, formatDuration } from "./progress.js";
import { newRunId } from "./util.js";
import { SurfCreditsExhaustedError } from "./tools/surf-runner.js";
import type { Argument, ConsensusResult, DebateResult, GenerationResult, Market, Playbook, Side, Vote } from "./types.js";
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

// Enforce the price blind in code: remove market-lookup claims (a debater
// querying the market's own quote) and warn on suspected price laundering in
// prose. Mock claims use clean research sources, so this is a no-op for mock.
function blindArgument(
  side: string,
  argument: Argument,
  market: Market,
  mock: boolean
): Argument {
  const { argument: cleaned, removed } = stripMarketLookupClaims(argument);
  if (removed.length > 0) {
    console.log(
      chalk.yellow(
        `  Blind: dropped ${removed.length} market-lookup claim(s) from ${side} before judging`
      )
    );
  }
  if (!mock) {
    const leak = detectPriceLeak(cleaned, market.latestPrice);
    if (leak.suspected) {
      console.log(
        chalk.yellow(`  Blind: possible market-price leak in a ${side} claim — "${leak.snippets[0]}"`)
      );
    }
  }
  return cleaned;
}

interface DebateDraw {
  yesArgument: Argument;
  noArgument: Argument;
  consensus: ConsensusResult;
}

// One independent price-blind draw: debaters → blind → judge panel → consensus.
async function runDebateDraw(
  market: Market,
  playbook: Playbook,
  verbose: boolean,
  mock: boolean,
  agentRuntime: AgentRuntime
): Promise<DebateDraw> {
  const stopDebaterHeartbeat = mock ? () => {} : startHeartbeat("debaters researching");
  let yesArgument: Argument;
  let noArgument: Argument;
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

  // Code-enforced blind: strip any market-lookup claims (and warn on suspected
  // price laundering in prose) before the judges see the arguments, so the
  // quote stays hidden even if a debater ignored the price-blind instruction.
  yesArgument = blindArgument("YES", yesArgument, market, mock);
  noArgument = blindArgument("NO", noArgument, market, mock);

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
    throw new Error(`only ${votes.length}/${JUDGING.judges} judges returned a valid vote`);
  }
  if (votes.length < JUDGING.judges) {
    console.log(
      chalk.yellow(`  ${JUDGING.judges - votes.length} judge(s) abstained (unparseable vote)`)
    );
  }

  return { yesArgument, noArgument, consensus: computeConsensus(votes) };
}

async function runSingleDebate(
  market: Market,
  playbook: Playbook,
  verbose: boolean,
  mock: boolean = false,
  agentRuntime: AgentRuntime = "claude",
  rounds: number = 1
): Promise<DebateResult> {
  const started = Date.now();
  const numRounds = Math.max(1, rounds);

  // Ensemble N independent draws so a single noisy estimate can't masquerade as
  // a signal. The panel's answer is the mean; the between-round SD is the noise.
  // A failed draw is dropped, not fatal — we ensemble the survivors and only
  // give up when every draw fails.
  const draws: DebateDraw[] = [];
  const drawFailures: string[] = [];
  for (let r = 0; r < numRounds; r++) {
    if (numRounds > 1) {
      console.log(chalk.gray(`  Round ${r + 1}/${numRounds}...`));
    }
    try {
      draws.push(await runDebateDraw(market, playbook, verbose, mock, agentRuntime));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      drawFailures.push(msg);
      if (numRounds > 1) console.log(chalk.yellow(`  Round ${r + 1} failed: ${msg}`));
    }
  }
  if (draws.length === 0) {
    throw new Error(drawFailures[drawFailures.length - 1] || "debate produced no valid draws");
  }
  const ensembled = draws.length; // rounds that actually contributed
  if (numRounds > 1 && ensembled < numRounds) {
    console.log(chalk.yellow(`  Ensembling ${ensembled}/${numRounds} surviving round(s)`));
  }

  const probs = draws.map((d) => d.consensus.modelProbability);
  const { mean, stdev } = aggregateProbabilities(probs);
  // Representative draw (closest to the mean) supplies the persisted arguments.
  const rep = draws.reduce((best, d) =>
    Math.abs(d.consensus.modelProbability - mean) < Math.abs(best.consensus.modelProbability - mean)
      ? d
      : best
  );

  const winner: Side = mean >= 0.5 ? "YES" : "NO";
  const consensus: ConsensusResult = { ...rep.consensus, winner, modelProbability: mean };
  const score = scoreDebate(winner, market.latestPrice);
  const edge = computeEdge(mean, market.latestPrice);
  const ensembleReported = ensembled > 1;
  const threshold = noiseAdjustedThreshold(stdev, ensembled);
  const signal = recommendTrade(edge, threshold);
  const durationMs = Date.now() - started;

  const callColor =
    signal.recommendation === "BUY_YES"
      ? chalk.green
      : signal.recommendation === "BUY_NO"
        ? chalk.red
        : chalk.gray;
  const yes = consensus.votes.filter((v) => v.winner === "YES").length;
  const no = consensus.votes.filter((v) => v.winner === "NO").length;
  const panel = `panel ${yes}-${no}${consensus.unanimous ? " unanimous" : ""}`;
  const modelStr = ensembleReported
    ? `${mean.toFixed(3)}±${stdev.toFixed(3)} (${ensembled} rounds)`
    : mean.toFixed(3);
  const gated =
    ensembleReported && signal.recommendation === "PASS" && Math.abs(edge) >= EDGE.threshold
      ? chalk.gray(` [edge within noise: ${Math.abs(edge).toFixed(3)} < ${threshold}]`)
      : "";
  console.log(
    `  Model P(YES) ${modelStr} vs market ${market.latestPrice} → ` +
      `edge ${edge >= 0 ? "+" : ""}${edge} → ${callColor(signal.recommendation)}` +
      gated +
      ` (${panel}, EV ${signal.expectedValue}) — ${formatDuration(durationMs)}`
  );

  return {
    market,
    yesArgument: rep.yesArgument,
    noArgument: rep.noArgument,
    consensus,
    score,
    edge,
    recommendation: signal.recommendation,
    expectedValue: signal.expectedValue,
    rounds: ensembled,
    probabilityStdev: ensembleReported ? stdev : undefined,
    durationMs,
  };
}

export interface ArenaOptions {
  marketCount: number;
  conditionId?: string;
  showcase?: boolean;
  verbose: boolean;
  mock?: boolean;
  agentRuntime?: AgentRuntime;
  runId?: string;
  /** Independent panel draws to ensemble per debate (>1 enables noise-gating). */
  rounds?: number;
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
        runtime,
        options.rounds ?? 1
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
