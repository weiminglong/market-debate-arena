import { describe, it } from "node:test";
import assert from "node:assert";
import { parseVote } from "./judge.js";

describe("parseVote", () => {
  it("parses a probability estimate and derives the winner", () => {
    const vote = parseVote('{"probabilityYes": 0.8, "confidence": 0.7, "reasoning": "strong YES"}');
    assert.strictEqual(vote?.probabilityYes, 0.8);
    assert.strictEqual(vote?.winner, "YES");
    assert.strictEqual(vote?.confidence, 0.7);
  });

  it("derives NO when the probability is below 0.5", () => {
    assert.strictEqual(parseVote('{"probabilityYes": 0.2}')?.winner, "NO");
    assert.strictEqual(parseVote('{"probabilityYes": 0.5}')?.winner, "YES");
  });

  it("abstains (null) when no JSON is present", () => {
    assert.strictEqual(parseVote("I think YES is more likely."), null);
  });

  it("abstains when probabilityYes is missing or non-numeric", () => {
    assert.strictEqual(parseVote('{"confidence": 0.9}'), null);
    assert.strictEqual(parseVote('{"probabilityYes": "likely"}'), null);
  });

  it("parses a numeric-string probability", () => {
    assert.strictEqual(parseVote('{"probabilityYes": "0.9"}')?.probabilityYes, 0.9);
  });

  it("clamps out-of-range probabilities", () => {
    assert.strictEqual(parseVote('{"probabilityYes": 1.4}')?.probabilityYes, 1);
    assert.strictEqual(parseVote('{"probabilityYes": -0.3}')?.probabilityYes, 0);
  });

  it("preserves a legitimate probability of 0", () => {
    const vote = parseVote('{"probabilityYes": 0}');
    assert.strictEqual(vote?.probabilityYes, 0);
    assert.strictEqual(vote?.winner, "NO");
  });

  it("defaults confidence to 0.5 when non-numeric, without poisoning it with NaN", () => {
    const vote = parseVote('{"probabilityYes": 0.7, "confidence": "high"}');
    assert.strictEqual(vote?.confidence, 0.5);
    assert.ok(Number.isFinite(vote!.confidence));
  });

  it("extracts the estimate from surrounding prose", () => {
    const vote = parseVote('Here is my call:\n{"probabilityYes": 0.3, "reasoning": "x"}\nDone.');
    assert.strictEqual(vote?.winner, "NO");
  });
});
