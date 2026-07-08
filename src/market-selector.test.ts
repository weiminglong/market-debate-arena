// src/market-selector.test.ts
import { describe, it } from "node:test";
import assert from "node:assert";
import { fetchMarkets, idLookupParam } from "./market-selector.js";

describe("idLookupParam", () => {
  it("routes a Polymarket 0x id to condition-id", () => {
    assert.strictEqual(idLookupParam("0x2be031440c5a571cd4fc3e05e2478d98"), "condition-id");
  });
  it("routes a Kalshi ticker to market-ticker", () => {
    assert.strictEqual(idLookupParam("KXBTCD-26JUL1017-T62999.99"), "market-ticker");
    assert.strictEqual(idLookupParam("FEDHIKE-26DEC31"), "market-ticker");
  });
});

// Live network test (spends surf API credits) — opt in via LIVE_TESTS=1.
describe("fetchMarkets", { skip: !process.env.LIVE_TESTS }, () => {
  it("fetches active prediction markets", async () => {
    const markets = await fetchMarkets({ count: 3 });
    assert.ok(Array.isArray(markets), "should return array");
    assert.ok(markets.length > 0, "should have at least one market");
    assert.ok(markets.length <= 3, "should respect count limit");

    const market = markets[0];
    assert.ok(market.question, "market should have a question");
    assert.ok(market.latestPrice >= 0 && market.latestPrice <= 1, "price should be 0-1");
    assert.ok(market.conditionId || market.platform === "kalshi", "polymarket should have conditionId");
  });
});
