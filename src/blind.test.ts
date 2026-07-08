import { describe, it } from "node:test";
import assert from "node:assert";
import { isMarketLookupSource, stripMarketLookupClaims, detectPriceLeak } from "./blind.js";
import type { Argument, Claim } from "./types.js";

function claim(over: Partial<Claim>): Claim {
  return { claim: "c", source: "market-price", data: {}, reasoning: "r", ...over };
}

describe("isMarketLookupSource", () => {
  it("flags prediction-market lookup and odds sources", () => {
    for (const s of ["surf search-prediction-market", "search-prediction-market", "polymarket odds", "kalshi price"]) {
      assert.strictEqual(isMarketLookupSource(s), true, s);
    }
  });
  it("does NOT flag legitimate research sources", () => {
    for (const s of ["market-price", "polymarket-smart-money", "news-feed", "market-fear-greed", "market-onchain-indicator"]) {
      assert.strictEqual(isMarketLookupSource(s), false, s);
    }
  });
});

describe("stripMarketLookupClaims", () => {
  it("removes market-lookup claims and keeps the rest", () => {
    const arg: Argument = {
      side: "YES",
      summary: "s",
      claims: [
        claim({ source: "market-price", claim: "spot up" }),
        claim({ source: "surf search-prediction-market", claim: "this market trades at 0.34" }),
        claim({ source: "news-feed", claim: "bullish headline" }),
      ],
    };
    const { argument, removed } = stripMarketLookupClaims(arg);
    assert.strictEqual(removed.length, 1);
    assert.strictEqual(argument.claims.length, 2);
    assert.ok(!argument.claims.some((c) => c.source.includes("search-prediction-market")));
  });

  it("is a no-op when there are no lookup claims (e.g. mock claims)", () => {
    const arg: Argument = {
      side: "NO",
      summary: "s",
      claims: [claim({ source: "polymarket-smart-money" }), claim({ source: "market-fear-greed" })],
    };
    const { argument, removed } = stripMarketLookupClaims(arg);
    assert.strictEqual(removed.length, 0);
    assert.strictEqual(argument, arg); // same reference, untouched
  });
});

describe("detectPriceLeak", () => {
  const arg = (text: string): Argument => ({
    side: "YES",
    summary: "s",
    claims: [claim({ claim: text })],
  });

  it("flags odds language with a probability near the actual price", () => {
    assert.strictEqual(detectPriceLeak(arg("the market trades at 0.34 today"), 0.34).suspected, true);
    assert.strictEqual(detectPriceLeak(arg("implied probability is 0.35"), 0.34).suspected, true);
  });

  it("ignores an underlying asset price that is not a 0-1 probability", () => {
    assert.strictEqual(detectPriceLeak(arg("BTC trades at $57,500 right now"), 0.34).suspected, false);
  });

  it("ignores odds language whose number is far from the market price", () => {
    assert.strictEqual(detectPriceLeak(arg("implied probability is 0.90"), 0.34).suspected, false);
  });

  it("ignores clean research with no odds language", () => {
    assert.strictEqual(detectPriceLeak(arg("RSI at 58 signals momentum"), 0.34).suspected, false);
  });
});
