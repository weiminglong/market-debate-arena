import { describe, it } from "node:test";
import assert from "node:assert";
import { computeConsensus } from "./consensus.js";
import type { Vote } from "./types.js";

function vote(probabilityYes: number, confidence = 0.7): Vote {
  return {
    winner: probabilityYes >= 0.5 ? "YES" : "NO",
    probabilityYes,
    confidence,
    reasoning: "",
  };
}

describe("computeConsensus", () => {
  it("winner follows the panel mean probability (YES)", () => {
    const result = computeConsensus([vote(0.8), vote(0.6), vote(0.4)]);
    assert.strictEqual(result.winner, "YES");
    assert.ok(Math.abs(result.modelProbability - 0.6) < 1e-9);
    assert.strictEqual(result.unanimous, false);
    assert.strictEqual(result.votes.length, 3);
  });

  it("winner follows the panel mean probability (NO)", () => {
    const result = computeConsensus([vote(0.1), vote(0.3), vote(0.55)]);
    assert.strictEqual(result.winner, "NO");
    assert.ok(result.modelProbability < 0.5);
  });

  it("verdict and modelProbability never disagree, even with a split panel", () => {
    // Two judges below 0.5, one strongly above → panel splits 1-2 but the mean
    // (0.633) is YES; winner tracks the mean, not the vote count.
    const result = computeConsensus([vote(0.95), vote(0.45), vote(0.45)]);
    assert.strictEqual(result.winner, "YES");
    assert.ok(result.modelProbability >= 0.5);
  });

  it("detects a unanimous panel (all judges on the same side of 0.5)", () => {
    const result = computeConsensus([vote(0.9), vote(0.8), vote(0.7)]);
    assert.strictEqual(result.unanimous, true);
  });

  it("computes average confidence independently of the probability", () => {
    const result = computeConsensus([vote(0.9, 0.9), vote(0.6, 0.6), vote(0.3, 0.3)]);
    assert.ok(Math.abs(result.averageConfidence - 0.6) < 0.01);
  });

  it("works with a 2-judge panel after one abstention", () => {
    const result = computeConsensus([vote(0.2), vote(0.3)]);
    assert.strictEqual(result.winner, "NO");
    assert.strictEqual(result.unanimous, true);
    assert.ok(Math.abs(result.modelProbability - 0.25) < 1e-9);
  });

  it("throws on zero votes instead of returning a fabricated verdict", () => {
    assert.throws(() => computeConsensus([]), /zero valid votes/);
  });
});
