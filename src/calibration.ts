import { round3 } from "./util.js";
import type { TradeRecommendation } from "./types.js";

// One scored forecast: what the model said, what the market said, what happened.
export interface ResolvedPrediction {
  conditionId: string;
  question: string;
  modelProbability: number; // panel P(YES) at prediction time
  marketPrice: number; // market-implied P(YES) at prediction time
  edge: number;
  recommendation: TradeRecommendation;
  outcome: 0 | 1; // 1 = YES happened, 0 = NO
}

export interface ReliabilityBucket {
  range: string; // e.g. "0.6-0.8"
  count: number;
  meanPredicted: number; // mean model P(YES) in the bucket
  observedFrequency: number; // fraction that resolved YES
}

export interface TradeRecord {
  actionable: number; // BUY_YES/BUY_NO calls that resolved
  wins: number; // calls where the bet side won
  hitRate: number;
  meanRealizedPnl: number; // realized $ per $1, averaged over actionable calls
  meanExpectedEdge: number; // what the model expected (mean |edge|)
}

export interface CalibrationReport {
  n: number;
  modelBrier: number;
  marketBrier: number;
  skillScore: number; // 1 - modelBrier/marketBrier; > 0 means the model beat the market
  modelLogLoss: number;
  marketLogLoss: number;
  reliability: ReliabilityBucket[];
  trades: TradeRecord;
}

// Mean squared error of a probability against the 0/1 outcome. Lower is better;
// a coin-flip (always 0.5) scores 0.25.
export function brier(pairs: Array<{ p: number; outcome: number }>): number {
  if (pairs.length === 0) return 0;
  const sum = pairs.reduce((acc, { p, outcome }) => acc + (p - outcome) ** 2, 0);
  return sum / pairs.length;
}

// Mean negative log-likelihood; probabilities are clamped off 0/1 so a single
// confident miss doesn't send it to Infinity.
export function logLoss(pairs: Array<{ p: number; outcome: number }>, eps = 1e-9): number {
  if (pairs.length === 0) return 0;
  const sum = pairs.reduce((acc, { p, outcome }) => {
    const clamped = Math.max(eps, Math.min(1 - eps, p));
    return acc - (outcome * Math.log(clamped) + (1 - outcome) * Math.log(1 - clamped));
  }, 0);
  return sum / pairs.length;
}

export function reliabilityBuckets(
  preds: ResolvedPrediction[],
  bins = 5
): ReliabilityBucket[] {
  const buckets: ReliabilityBucket[] = [];
  for (let i = 0; i < bins; i++) {
    const lo = i / bins;
    const hi = (i + 1) / bins;
    // Last bucket is closed on the right so p === 1 lands somewhere.
    const inBucket = preds.filter(
      (pr) => pr.modelProbability >= lo && (i === bins - 1 ? pr.modelProbability <= hi : pr.modelProbability < hi)
    );
    if (inBucket.length === 0) continue;
    buckets.push({
      range: `${lo.toFixed(1)}-${hi.toFixed(1)}`,
      count: inBucket.length,
      meanPredicted: round3(
        inBucket.reduce((a, p) => a + p.modelProbability, 0) / inBucket.length
      ),
      observedFrequency: round3(
        inBucket.reduce((a, p) => a + p.outcome, 0) / inBucket.length
      ),
    });
  }
  return buckets;
}

// Realized P&L of a $1 contract on the recommended side: a YES contract costs
// the market price and pays 1 on YES (pnl = outcome − price); a NO contract
// costs 1 − price and pays 1 on NO (pnl = price − outcome). PASS calls are not
// trades and are excluded.
export function tradeRecord(preds: ResolvedPrediction[]): TradeRecord {
  const acted = preds.filter((p) => p.recommendation !== "PASS");
  if (acted.length === 0) {
    return { actionable: 0, wins: 0, hitRate: 0, meanRealizedPnl: 0, meanExpectedEdge: 0 };
  }

  let wins = 0;
  let pnl = 0;
  let expected = 0;
  for (const p of acted) {
    if (p.recommendation === "BUY_YES") {
      pnl += p.outcome - p.marketPrice;
      if (p.outcome === 1) wins++;
    } else {
      pnl += p.marketPrice - p.outcome;
      if (p.outcome === 0) wins++;
    }
    expected += Math.abs(p.edge);
  }

  return {
    actionable: acted.length,
    wins,
    hitRate: round3(wins / acted.length),
    meanRealizedPnl: round3(pnl / acted.length),
    meanExpectedEdge: round3(expected / acted.length),
  };
}

export function computeCalibration(preds: ResolvedPrediction[]): CalibrationReport {
  const modelPairs = preds.map((p) => ({ p: p.modelProbability, outcome: p.outcome }));
  const marketPairs = preds.map((p) => ({ p: p.marketPrice, outcome: p.outcome }));

  const modelBrier = round3(brier(modelPairs));
  const marketBrier = round3(brier(marketPairs));
  // Skill vs the market: positive means the model's probabilities were closer
  // to the truth than the market's price. Undefined (0) when the market was
  // already perfect.
  const skillScore = marketBrier > 0 ? round3(1 - modelBrier / marketBrier) : 0;

  return {
    n: preds.length,
    modelBrier,
    marketBrier,
    skillScore,
    modelLogLoss: round3(logLoss(modelPairs)),
    marketLogLoss: round3(logLoss(marketPairs)),
    reliability: reliabilityBuckets(preds),
    trades: tradeRecord(preds),
  };
}
