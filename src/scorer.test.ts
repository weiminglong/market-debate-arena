// src/scorer.test.ts
import { describe, it } from "node:test";
import assert from "node:assert";
import { scoreDebate } from "./scorer.js";

describe("scoreDebate", () => {
  it("scores high when judges agree with market", () => {
    const score = scoreDebate("YES", 0.8);
    assert.strictEqual(score, 0.8);
  });

  it("scores low when judges disagree with market", () => {
    const score = scoreDebate("NO", 0.8);
    assert.ok(Math.abs(score - 0.2) < 0.001);
  });

  it("scores 0.5 on even market regardless of pick", () => {
    assert.strictEqual(scoreDebate("YES", 0.5), 0.5);
    assert.strictEqual(scoreDebate("NO", 0.5), 0.5);
  });
});
