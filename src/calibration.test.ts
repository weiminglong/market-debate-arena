import { describe, it } from "node:test";
import assert from "node:assert";
import {
  brier,
  logLoss,
  reliabilityBuckets,
  tradeRecord,
  computeCalibration,
  type ResolvedPrediction,
} from "./calibration.js";

function pred(p: Partial<ResolvedPrediction>): ResolvedPrediction {
  return {
    conditionId: "c",
    question: "q",
    modelProbability: 0.5,
    marketPrice: 0.5,
    edge: 0,
    recommendation: "PASS",
    outcome: 1,
    ...p,
  };
}

describe("brier", () => {
  it("is 0 for perfect confident predictions", () => {
    assert.strictEqual(brier([{ p: 1, outcome: 1 }, { p: 0, outcome: 0 }]), 0);
  });
  it("is 0.25 for coin-flips", () => {
    assert.strictEqual(brier([{ p: 0.5, outcome: 1 }, { p: 0.5, outcome: 0 }]), 0.25);
  });
  it("is 0 for an empty set", () => {
    assert.strictEqual(brier([]), 0);
  });
});

describe("logLoss", () => {
  it("scores a coin-flip at ln(2)", () => {
    assert.ok(Math.abs(logLoss([{ p: 0.5, outcome: 1 }]) - Math.log(2)) < 1e-9);
  });
  it("stays finite on a confident miss (clamped)", () => {
    assert.ok(Number.isFinite(logLoss([{ p: 1, outcome: 0 }])));
  });
});

describe("reliabilityBuckets", () => {
  it("groups by predicted probability and reports observed frequency", () => {
    const preds = [
      pred({ modelProbability: 0.85, outcome: 1 }),
      pred({ modelProbability: 0.82, outcome: 0 }),
      pred({ modelProbability: 0.1, outcome: 0 }),
    ];
    const buckets = reliabilityBuckets(preds, 5);
    const high = buckets.find((b) => b.range === "0.8-1.0");
    assert.ok(high);
    assert.strictEqual(high!.count, 2);
    assert.strictEqual(high!.observedFrequency, 0.5);
    const low = buckets.find((b) => b.range === "0.0-0.2");
    assert.strictEqual(low!.observedFrequency, 0);
  });
  it("puts p===1 in the last (right-closed) bucket", () => {
    const buckets = reliabilityBuckets([pred({ modelProbability: 1, outcome: 1 })], 5);
    assert.strictEqual(buckets[0].range, "0.8-1.0");
  });
});

describe("tradeRecord", () => {
  it("realizes P&L on the recommended side and excludes PASS", () => {
    const preds = [
      pred({ recommendation: "BUY_YES", marketPrice: 0.34, outcome: 1, edge: 0.15 }), // +0.66
      pred({ recommendation: "BUY_NO", marketPrice: 0.7, outcome: 0, edge: -0.2 }), //  +0.70
      pred({ recommendation: "PASS", marketPrice: 0.5, outcome: 1, edge: 0.02 }), //     excluded
    ];
    const t = tradeRecord(preds);
    assert.strictEqual(t.actionable, 2);
    assert.strictEqual(t.wins, 2);
    assert.strictEqual(t.hitRate, 1);
    assert.ok(Math.abs(t.meanRealizedPnl - 0.68) < 1e-9); // (0.66 + 0.70)/2
    assert.ok(Math.abs(t.meanExpectedEdge - 0.175) < 1e-9); // (0.15 + 0.20)/2
  });
  it("counts a losing call", () => {
    const t = tradeRecord([pred({ recommendation: "BUY_YES", marketPrice: 0.4, outcome: 0, edge: 0.2 })]);
    assert.strictEqual(t.wins, 0);
    assert.ok(Math.abs(t.meanRealizedPnl - -0.4) < 1e-9);
  });
});

describe("computeCalibration", () => {
  it("reports positive skill when the model beat the market", () => {
    // Market priced both at 0.5; model leaned the right way each time.
    const preds = [
      pred({ modelProbability: 0.8, marketPrice: 0.5, outcome: 1 }),
      pred({ modelProbability: 0.2, marketPrice: 0.5, outcome: 0 }),
    ];
    const report = computeCalibration(preds);
    assert.strictEqual(report.n, 2);
    assert.ok(report.modelBrier < report.marketBrier);
    assert.ok(report.skillScore > 0, "skill should be positive when the model wins");
  });

  it("reports negative skill when the model was worse than the market", () => {
    const preds = [
      pred({ modelProbability: 0.2, marketPrice: 0.5, outcome: 1 }),
      pred({ modelProbability: 0.8, marketPrice: 0.5, outcome: 0 }),
    ];
    assert.ok(computeCalibration(preds).skillScore < 0);
  });
});
