import { describe, it } from "node:test";
import assert from "node:assert";
import { runGeneration } from "./arena.js";
import { DEFAULT_PLAYBOOK } from "./types.js";

describe("e2e: single market debate", () => {
  it("runs a full debate and produces a score", { timeout: 120_000 }, async () => {
    const result = await runGeneration(DEFAULT_PLAYBOOK, {
      marketCount: 1,
      verbose: true,
    });

    assert.strictEqual(result.generation, 1);
    assert.strictEqual(result.debates.length, 1);

    const debate = result.debates[0];
    assert.ok(debate.market.question, "should have a market question");
    assert.ok(debate.yesArgument.claims.length > 0, "YES should have claims");
    assert.ok(debate.noArgument.claims.length > 0, "NO should have claims");
    assert.strictEqual(
      debate.consensus.votes.length,
      3,
      "should have 3 judge votes"
    );
    assert.ok(
      debate.consensus.winner === "YES" || debate.consensus.winner === "NO",
      "winner should be YES or NO"
    );
    assert.ok(
      debate.score >= 0 && debate.score <= 1,
      "score should be 0-1"
    );

    console.log(
      `\nDebate result: ${debate.consensus.winner} won with score ${debate.score}`
    );
  });
});
