// src/market-selector.test.ts
import { describe, it } from "node:test";
import assert from "node:assert";
import { fetchMarkets } from "./market-selector.js";

describe("fetchMarkets", () => {
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
