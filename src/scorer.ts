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
