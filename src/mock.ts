import type { Argument, Market, Playbook, Vote } from "./types.js";

export const MOCK_MARKETS: Market[] = [
  {
    question: "Will BTC hit $100K by July 2026?",
    conditionId: "mock-btc-100k",
    platform: "polymarket",
    latestPrice: 0.62,
    category: "Crypto",
    marketLink: "https://polymarket.com/mock",
  },
  {
    question: "Will ETH surpass $5000 by end of 2026?",
    conditionId: "mock-eth-5k",
    platform: "polymarket",
    latestPrice: 0.45,
    category: "Crypto",
    marketLink: "https://polymarket.com/mock",
  },
  {
    question: "Fed rate cut before August 2026?",
    conditionId: "mock-fed-cut",
    platform: "kalshi",
    latestPrice: 0.73,
    category: "Economics",
    marketLink: "https://kalshi.com/mock",
  },
  {
    question: "Will SOL flip BNB in market cap by 2026?",
    conditionId: "mock-sol-bnb",
    platform: "polymarket",
    latestPrice: 0.58,
    category: "Crypto",
    marketLink: "https://polymarket.com/mock",
  },
  {
    question: "US recession declared by end of 2026?",
    conditionId: "mock-recession",
    platform: "kalshi",
    latestPrice: 0.35,
    category: "Economics",
    marketLink: "https://kalshi.com/mock",
  },
];

const YES_CLAIM_TEMPLATES = [
  { source: "market-price", claim: "Price momentum shows sustained upward trend over 30d" },
  { source: "market-price-indicator", claim: "RSI at 58 indicates healthy bullish momentum without overbought conditions" },
  { source: "social-mindshare", claim: "Social mindshare has increased 40% in the past 2 weeks" },
  { source: "polymarket-smart-money", claim: "Smart money wallets are net buyers, bullish direction" },
  { source: "news-feed", claim: "Recent positive regulatory news supports this outcome" },
  { source: "market-fear-greed", claim: "Fear & Greed at 45 suggests room for upside" },
  { source: "market-onchain-indicator", claim: "NUPL in optimism zone, historically precedes rallies" },
  { source: "project-defi-metrics", claim: "DeFi TVL growing steadily, showing increased on-chain activity" },
];

const NO_CLAIM_TEMPLATES = [
  { source: "market-price", claim: "Price has failed to break key resistance 3 times in 30 days" },
  { source: "market-price-indicator", claim: "MACD shows bearish divergence on the daily chart" },
  { source: "social-mindshare", claim: "Social mindshare declining — interest is fading" },
  { source: "polymarket-smart-money", claim: "Smart money is taking profits and reducing exposure" },
  { source: "news-feed", claim: "Macro headwinds: trade tensions and regulatory uncertainty" },
  { source: "market-fear-greed", claim: "Fear & Greed at 18 (Extreme Fear) signals continued downside" },
  { source: "market-onchain-indicator", claim: "SOPR below 1 — holders selling at a loss, bearish" },
  { source: "market-ranking", claim: "Token losing market cap rank, being overtaken by competitors" },
];

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export function mockDebater(
  side: "YES" | "NO",
  market: Market,
  _playbook: Playbook
): Argument {
  const templates = side === "YES" ? YES_CLAIM_TEMPLATES : NO_CLAIM_TEMPLATES;
  const selected = pickRandom(templates, 3 + Math.floor(Math.random() * 3));

  return {
    side,
    claims: selected.map((t) => ({
      claim: t.claim,
      source: t.source,
      data: { mock: true, market: market.question },
      reasoning: `This data point supports the ${side} case for "${market.question}"`,
    })),
    summary: `Based on ${selected.length} data points across ${new Set(selected.map((s) => s.source)).size} sources, the evidence supports ${side} for "${market.question}".`,
  };
}

export function mockJudge(
  _question: string,
  yesArg: Argument,
  noArg: Argument
): Vote {
  // Simulate judge with slight randomness but preference for more claims + source diversity
  const yesScore =
    yesArg.claims.length * 0.3 +
    new Set(yesArg.claims.map((c) => c.source)).size * 0.4 +
    Math.random() * 0.3;
  const noScore =
    noArg.claims.length * 0.3 +
    new Set(noArg.claims.map((c) => c.source)).size * 0.4 +
    Math.random() * 0.3;

  const winner = yesScore >= noScore ? "YES" as const : "NO" as const;
  return {
    winner,
    confidence: 0.5 + Math.random() * 0.4,
    reasoning: `${winner} team presented ${winner === "YES" ? yesArg.claims.length : noArg.claims.length} claims from diverse sources`,
  };
}

export function mockAnalyst(
  _playbook: Playbook,
  _avgScore: number
): { lessons: string[]; toolPriority: string[]; avoidPatterns: string[]; keyMutation: string } {
  const mutations = [
    "prioritize on-chain data over social signals",
    "lead with smart money flows for prediction markets",
    "cross-reference price momentum with on-chain indicators",
    "avoid relying solely on news — combine with quantitative data",
    "weight technical indicators higher for short-term predictions",
  ];
  return {
    lessons: [mutations[Math.floor(Math.random() * mutations.length)]],
    toolPriority: [
      "getPrice", "getTechnicalIndicator", "getSmartMoney", "getOnChainIndicator",
      "getSocialMindshare", "getNewsFeed", "getFearGreed", "getDeFiMetrics",
      "getMarketRanking", "getSocialDetail",
    ],
    avoidPatterns: ["relying on a single data source"],
    keyMutation: mutations[Math.floor(Math.random() * mutations.length)],
  };
}
