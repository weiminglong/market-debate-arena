import { describe, it } from "node:test";
import assert from "node:assert";
import { computeConsensus } from "./consensus.js";
import type { Vote } from "./types.js";

describe("computeConsensus", () => {
  it("picks YES when majority votes YES", () => {
    const votes: Vote[] = [
      { winner: "YES", confidence: 0.8, reasoning: "strong data" },
      { winner: "YES", confidence: 0.6, reasoning: "moderate data" },
      { winner: "NO", confidence: 0.7, reasoning: "dissent" },
    ];
    const result = computeConsensus(votes);
    assert.strictEqual(result.winner, "YES");
    assert.strictEqual(result.unanimous, false);
    assert.strictEqual(result.votes.length, 3);
  });

  it("picks NO when majority votes NO", () => {
    const votes: Vote[] = [
      { winner: "NO", confidence: 0.9, reasoning: "a" },
      { winner: "NO", confidence: 0.7, reasoning: "b" },
      { winner: "YES", confidence: 0.5, reasoning: "c" },
    ];
    const result = computeConsensus(votes);
    assert.strictEqual(result.winner, "NO");
  });

  it("detects unanimous vote", () => {
    const votes: Vote[] = [
      { winner: "YES", confidence: 0.9, reasoning: "a" },
      { winner: "YES", confidence: 0.8, reasoning: "b" },
      { winner: "YES", confidence: 0.7, reasoning: "c" },
    ];
    const result = computeConsensus(votes);
    assert.strictEqual(result.unanimous, true);
  });

  it("computes average confidence", () => {
    const votes: Vote[] = [
      { winner: "YES", confidence: 0.9, reasoning: "a" },
      { winner: "YES", confidence: 0.6, reasoning: "b" },
      { winner: "NO", confidence: 0.3, reasoning: "c" },
    ];
    const result = computeConsensus(votes);
    assert.ok(Math.abs(result.averageConfidence - 0.6) < 0.01);
  });
});
