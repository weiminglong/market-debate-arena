import { describe, it } from "node:test";
import assert from "node:assert";
import { DEFAULT_PLAYBOOK, type Argument, type Market, type Playbook } from "./types.js";
import { mockAnalyst, mockDebater, mockJudge } from "./mock.js";

const MARKET: Market = {
  question: "Will BTC hit $100K by July 2026?",
  conditionId: "mock-btc-100k",
  platform: "polymarket",
  latestPrice: 0.62,
  category: "Crypto",
  marketLink: "https://polymarket.com/mock",
};

function sourceDiversity(arg: Argument): number {
  return new Set(arg.claims.map((c) => c.source)).size;
}

describe("mock showcase behavior", () => {
  it("increases claim depth and diversity with evolved playbook", () => {
    const base = mockDebater("YES", MARKET, DEFAULT_PLAYBOOK);

    const evolvedPlaybook: Playbook = {
      ...DEFAULT_PLAYBOOK,
      generation: 2,
      lessons: [
        "Increase source diversity with cross-domain evidence",
        "Use quantified claims with concrete values",
      ],
      toolPriority: [
        "getSmartMoney",
        "getPrice",
        "getOnChainIndicator",
        "getNewsFeed",
        "getSocialMindshare",
        "getTechnicalIndicator",
        "getFearGreed",
        "getDeFiMetrics",
        "getMarketRanking",
        "getSocialDetail",
      ],
    };

    const improved = mockDebater("YES", MARKET, evolvedPlaybook);

    assert.ok(improved.claims.length >= base.claims.length);
    assert.ok(sourceDiversity(improved) >= sourceDiversity(base));
  });

  it("applies deterministic analyst mutation sequence", () => {
    const gen0 = { ...DEFAULT_PLAYBOOK, generation: 0 };
    const m1 = mockAnalyst(gen0, 0.45);
    assert.ok(
      m1.lessons.includes("Prioritize smart money evidence before sentiment-driven signals")
    );

    const gen1: Playbook = {
      generation: 1,
      lessons: [...m1.lessons],
      toolPriority: [...m1.toolPriority],
      avoidPatterns: [...m1.avoidPatterns],
    };
    const m2 = mockAnalyst(gen1, 0.5);
    assert.ok(
      m2.lessons.includes("Increase source diversity by requiring at least 4 unique sources")
    );
  });

  it("returns deterministic judge output for same inputs", () => {
    const yesArg: Argument = {
      side: "YES",
      summary: "yes",
      claims: [
        { claim: "A", source: "market-price", data: {}, reasoning: "A" },
        { claim: "B", source: "news-feed", data: {}, reasoning: "B" },
      ],
    };
    const noArg: Argument = {
      side: "NO",
      summary: "no",
      claims: [{ claim: "C", source: "market-price", data: {}, reasoning: "C" }],
    };

    const v1 = mockJudge("Q", yesArg, noArg);
    const v2 = mockJudge("Q", yesArg, noArg);

    assert.deepStrictEqual(v1, v2);
  });

  it("uses playbook maturity to break ties deterministically", () => {
    const tiedYes: Argument = {
      side: "YES",
      summary: "yes",
      claims: [
        { claim: "A", source: "market-price", data: {}, reasoning: "A" },
        { claim: "B", source: "news-feed", data: {}, reasoning: "B" },
      ],
    };
    const tiedNo: Argument = {
      side: "NO",
      summary: "no",
      claims: [
        { claim: "C", source: "market-price", data: {}, reasoning: "C" },
        { claim: "D", source: "news-feed", data: {}, reasoning: "D" },
      ],
    };

    const evenLessons: Playbook = {
      ...DEFAULT_PLAYBOOK,
      lessons: ["l1", "l2"],
    };
    const oddLessons: Playbook = {
      ...DEFAULT_PLAYBOOK,
      lessons: ["l1", "l2", "l3"],
    };

    const evenVote = mockJudge("Q", tiedYes, tiedNo, evenLessons);
    const oddVote = mockJudge("Q", tiedYes, tiedNo, oddLessons);

    assert.strictEqual(evenVote.winner, "NO");
    assert.strictEqual(oddVote.winner, "YES");
  });
});
