// src/scorer.ts
import { EDGE } from "./config.js";
import { round3 } from "./util.js";
import type { Side, TradeRecommendation } from "./types.js";

// Align*: the market-implied probability of the side the panel picked (winner
// YES → price, else 1 − price). It measures *directional* agreement weighted by
// the market's own confidence — NOT the distance between the model estimate and
// the price (that gap is the edge). High Align* = sided with a confident market.
export function scoreDebate(winner: Side, marketPrice: number): number {
  const score = winner === "YES" ? marketPrice : 1 - marketPrice;
  return round3(score);
}

// Signed edge: how far the panel's independent P(YES) sits above (long YES) or
// below (long NO) the market's implied probability. This is the tradeable
// signal — where the model thinks the market is wrong, and by how much.
export function computeEdge(modelProbability: number, marketPrice: number): number {
  return round3(modelProbability - marketPrice);
}

export interface EnsembleStats {
  mean: number;
  /** Between-round sample SD of the panel's P(YES); 0 for a single draw. */
  stdev: number;
}

// Aggregate repeated price-blind panel draws. The mean is the ensembled
// estimate; the SD exposes how noisy that estimate is (the first re-dogfood saw
// a 0.19 swing across identical single runs).
export function aggregateProbabilities(probs: number[]): EnsembleStats {
  const n = probs.length;
  if (n === 0) return { mean: 0, stdev: 0 };
  const mean = probs.reduce((a, p) => a + p, 0) / n;
  if (n === 1) return { mean: round3(mean), stdev: 0 };
  const variance = probs.reduce((a, p) => a + (p - mean) ** 2, 0) / (n - 1);
  return { mean: round3(mean), stdev: round3(Math.sqrt(variance)) };
}

// An edge is only worth acting on if it clears BOTH the fixed fee/slippage
// threshold and the estimator noise — noiseSigmas standard errors of the
// ensembled mean. With a single draw there is no noise estimate, so the base
// threshold stands and behavior is unchanged.
export function noiseAdjustedThreshold(
  stdev: number,
  rounds: number,
  baseThreshold: number = EDGE.threshold,
  sigmas: number = EDGE.noiseSigmas
): number {
  if (rounds <= 1 || stdev <= 0) return baseThreshold;
  const standardError = stdev / Math.sqrt(rounds);
  return Math.max(baseThreshold, round3(sigmas * standardError));
}

export interface TradeSignal {
  recommendation: TradeRecommendation;
  /** EV per $1 of the recommended contract, = |edge| when acting, 0 on PASS. */
  expectedValue: number;
}

// A YES contract costing p and paying $1 on YES has EV = q − p = edge (where q
// is the model's P(YES)); the NO contract's EV is p − q = −edge. So taking the
// side the edge points to yields EV = |edge|; below the threshold — which
// absorbs model noise, fees, and slippage — we PASS.
export function recommendTrade(
  edge: number,
  threshold: number = EDGE.threshold
): TradeSignal {
  if (edge >= threshold) return { recommendation: "BUY_YES", expectedValue: round3(edge) };
  if (edge <= -threshold) return { recommendation: "BUY_NO", expectedValue: round3(-edge) };
  return { recommendation: "PASS", expectedValue: 0 };
}
