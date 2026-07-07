import { describe, it } from "node:test";
import assert from "node:assert";
import { runSurf } from "./surf-runner.js";

// Live network tests (spend surf API credits) — opt in via LIVE_TESTS=1.
describe("runSurf", { skip: !process.env.LIVE_TESTS }, () => {
  it("fetches market fear-greed data", async () => {
    const result = await runSurf("market-fear-greed", {});
    assert.ok(Array.isArray(result), "result should be an array");
    assert.ok(result.length > 0, "result should have entries");
    assert.ok("value" in result[0], "entries should have value field");
  });

  it("fetches market price for BTC", async () => {
    const result = await runSurf("market-price", { symbol: "BTC" });
    assert.ok(Array.isArray(result), "result should be an array");
    assert.ok(result.length > 0, "result should have entries");
    assert.ok("value" in result[0], "entries should have value field");
  });

  it("returns error info for invalid command", async () => {
    try {
      await runSurf("nonexistent-command", {});
      assert.fail("should have thrown");
    } catch (e: unknown) {
      assert.ok(e instanceof Error);
    }
  });
});
