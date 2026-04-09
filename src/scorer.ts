// src/scorer.ts
import type { Side } from "./types.js";

export function scoreDebate(winner: Side, marketPrice: number): number {
  const score = winner === "YES" ? marketPrice : 1 - marketPrice;
  return Math.round(score * 1000) / 1000;
}
