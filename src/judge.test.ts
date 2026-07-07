import { describe, it } from "node:test";
import assert from "node:assert";
import { parseVote } from "./judge.js";

describe("parseVote", () => {
  it("parses a well-formed vote", () => {
    const vote = parseVote('{"winner": "NO", "confidence": 0.8, "reasoning": "stronger data"}');
    assert.deepStrictEqual(vote, { winner: "NO", confidence: 0.8, reasoning: "stronger data" });
  });

  it("accepts lowercase and padded winner values", () => {
    assert.strictEqual(parseVote('{"winner": "no", "confidence": 0.7}')?.winner, "NO");
    assert.strictEqual(parseVote('{"winner": " yes ", "confidence": 0.7}')?.winner, "YES");
  });

  it("abstains (null) instead of fabricating a vote when no JSON is present", () => {
    assert.strictEqual(parseVote("I think the YES side wins."), null);
  });

  it("abstains when winner is missing or invalid", () => {
    assert.strictEqual(parseVote('{"confidence": 0.9}'), null);
    assert.strictEqual(parseVote('{"winner": "MAYBE", "confidence": 0.9}'), null);
  });

  it("guards non-numeric confidence instead of propagating NaN", () => {
    const vote = parseVote('{"winner": "YES", "confidence": "high"}');
    assert.strictEqual(vote?.confidence, 0.5);
    assert.ok(Number.isFinite(vote!.confidence));
  });

  it("parses numeric-string confidence", () => {
    assert.strictEqual(parseVote('{"winner": "YES", "confidence": "0.9"}')?.confidence, 0.9);
  });

  it("preserves a legitimate confidence of 0", () => {
    assert.strictEqual(parseVote('{"winner": "NO", "confidence": 0}')?.confidence, 0);
  });

  it("clamps out-of-range confidence", () => {
    assert.strictEqual(parseVote('{"winner": "NO", "confidence": 3}')?.confidence, 1);
    assert.strictEqual(parseVote('{"winner": "NO", "confidence": -1}')?.confidence, 0);
  });

  it("extracts the vote from surrounding prose", () => {
    const vote = parseVote('Here is my verdict:\n{"winner": "NO", "confidence": 0.6, "reasoning": "x"}\nDone.');
    assert.strictEqual(vote?.winner, "NO");
  });
});
