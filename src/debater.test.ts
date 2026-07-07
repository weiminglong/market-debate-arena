import { describe, it } from "node:test";
import assert from "node:assert";
import { parseArgument } from "./debater.js";

describe("parseArgument", () => {
  it("parses well-formed arguments", () => {
    const arg = parseArgument(
      JSON.stringify({
        side: "YES",
        claims: [
          { claim: "BTC up 10%", source: "surf market-price", data: { change: 0.1 }, reasoning: "momentum" },
        ],
        summary: "bullish",
      }),
      "YES"
    );
    assert.strictEqual(arg.claims.length, 1);
    assert.strictEqual(arg.summary, "bullish");
  });

  it("normalizes claims with null or missing data instead of crashing downstream", () => {
    const arg = parseArgument(
      JSON.stringify({
        claims: [
          { claim: "A", source: "s", data: null, reasoning: "r" },
          { claim: "B", source: "s" },
          { claim: "C", source: "s", data: [1, 2], reasoning: "r" },
        ],
        summary: "ok",
      }),
      "NO"
    );
    assert.strictEqual(arg.claims.length, 3);
    for (const claim of arg.claims) {
      assert.ok(claim.data && typeof claim.data === "object" && !Array.isArray(claim.data));
      assert.strictEqual(typeof claim.reasoning, "string");
      // Persistence iterates claim data keys — must never throw.
      assert.doesNotThrow(() => Object.keys(claim.data));
    }
  });

  it("drops claims that are not objects or have no claim text", () => {
    const arg = parseArgument(
      JSON.stringify({
        claims: ["just a string", { source: "s" }, { claim: "valid", source: "s" }, null],
        summary: "ok",
      }),
      "YES"
    );
    assert.strictEqual(arg.claims.length, 1);
    assert.strictEqual(arg.claims[0].claim, "valid");
  });

  it("falls back to a direct-response claim when no JSON found", () => {
    const arg = parseArgument("The evidence strongly favors YES because...", "YES");
    assert.strictEqual(arg.claims.length, 1);
    assert.strictEqual(arg.claims[0].source, "direct-response");
  });
});
