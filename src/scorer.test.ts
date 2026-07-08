// src/scorer.test.ts
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  scoreDebate,
  computeEdge,
  recommendTrade,
  aggregateProbabilities,
  noiseAdjustedThreshold,
} from "./scorer.js";

describe("scoreDebate", () => {
  it("scores high when the verdict agrees with the market", () => {
    const score = scoreDebate("YES", 0.8);
    assert.strictEqual(score, 0.8);
  });

  it("scores low when the verdict disagrees with the market", () => {
    const score = scoreDebate("NO", 0.8);
    assert.ok(Math.abs(score - 0.2) < 0.001);
  });

  it("scores 0.5 on an even market regardless of pick", () => {
    assert.strictEqual(scoreDebate("YES", 0.5), 0.5);
    assert.strictEqual(scoreDebate("NO", 0.5), 0.5);
  });
});

describe("computeEdge", () => {
  it("is positive when the model thinks YES is underpriced", () => {
    assert.strictEqual(computeEdge(0.7, 0.5), 0.2);
  });

  it("is negative when the model thinks YES is overpriced", () => {
    assert.strictEqual(computeEdge(0.4, 0.75), -0.35);
  });

  it("is zero when the model agrees with the market", () => {
    assert.strictEqual(computeEdge(0.6, 0.6), 0);
  });
});

describe("recommendTrade", () => {
  it("buys YES when the edge clears the threshold upward", () => {
    const signal = recommendTrade(0.2, 0.08);
    assert.strictEqual(signal.recommendation, "BUY_YES");
    assert.strictEqual(signal.expectedValue, 0.2);
  });

  it("buys NO when the edge clears the threshold downward", () => {
    const signal = recommendTrade(-0.15, 0.08);
    assert.strictEqual(signal.recommendation, "BUY_NO");
    assert.strictEqual(signal.expectedValue, 0.15);
  });

  it("passes inside the threshold band, with zero EV", () => {
    for (const edge of [0.05, -0.05, 0]) {
      const signal = recommendTrade(edge, 0.08);
      assert.strictEqual(signal.recommendation, "PASS");
      assert.strictEqual(signal.expectedValue, 0);
    }
  });

  it("treats the threshold as inclusive", () => {
    assert.strictEqual(recommendTrade(0.08, 0.08).recommendation, "BUY_YES");
    assert.strictEqual(recommendTrade(-0.08, 0.08).recommendation, "BUY_NO");
  });

  it("recommends BUY_YES even when YES is the less likely outcome, if it is underpriced", () => {
    // The real live case: model estimates 0.49 (so the discrete winner is NO,
    // < 0.5) but the market prices only 0.34 → YES is underpriced → BUY_YES.
    // Direction and mispricing are different questions.
    const edge = computeEdge(0.49, 0.34);
    assert.ok(edge > 0, "YES should look underpriced");
    assert.strictEqual(recommendTrade(edge).recommendation, "BUY_YES");
  });
});

describe("aggregateProbabilities", () => {
  it("returns the mean with zero SD for a single draw", () => {
    assert.deepStrictEqual(aggregateProbabilities([0.42]), { mean: 0.42, stdev: 0 });
  });
  it("computes mean and sample SD across draws", () => {
    // The re-dogfood's real swing: 0.487 then 0.297 on the same market.
    const { mean, stdev } = aggregateProbabilities([0.487, 0.297]);
    assert.ok(Math.abs(mean - 0.392) < 1e-9);
    assert.ok(Math.abs(stdev - 0.134) < 0.002); // |Δ|/√2 ≈ 0.1344
  });
  it("has zero SD when every draw agrees", () => {
    assert.strictEqual(aggregateProbabilities([0.6, 0.6, 0.6]).stdev, 0);
  });
  it("handles the empty set", () => {
    assert.deepStrictEqual(aggregateProbabilities([]), { mean: 0, stdev: 0 });
  });
});

describe("noiseAdjustedThreshold", () => {
  it("is the base threshold for a single draw (no noise estimate)", () => {
    assert.strictEqual(noiseAdjustedThreshold(0, 1, 0.08, 2), 0.08);
    assert.strictEqual(noiseAdjustedThreshold(0.2, 1, 0.08, 2), 0.08);
  });
  it("raises the bar to N standard errors when the estimate is noisy", () => {
    // SD 0.134 over 2 rounds → SE ≈ 0.0948 → 2·SE ≈ 0.19 > 0.08 base.
    const t = noiseAdjustedThreshold(0.134, 2, 0.08, 2);
    assert.ok(t > 0.18 && t < 0.20, `expected ~0.19, got ${t}`);
  });
  it("keeps the base threshold when noise is small", () => {
    // SD 0.02 over 4 rounds → SE 0.01 → 2·SE 0.02 < 0.08 base.
    assert.strictEqual(noiseAdjustedThreshold(0.02, 4, 0.08, 2), 0.08);
  });
  it("makes a noisy 0.15 edge PASS but a clean one act", () => {
    // Noisy: threshold ~0.19 > edge 0.15 → PASS.
    assert.strictEqual(
      recommendTrade(0.15, noiseAdjustedThreshold(0.134, 2, 0.08, 2)).recommendation,
      "PASS"
    );
    // Clean: threshold stays 0.08 < edge 0.15 → BUY_YES.
    assert.strictEqual(
      recommendTrade(0.15, noiseAdjustedThreshold(0.02, 4, 0.08, 2)).recommendation,
      "BUY_YES"
    );
  });
});
