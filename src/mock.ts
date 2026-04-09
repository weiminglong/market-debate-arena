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

const TOOL_SOURCE_MAP: Record<string, string> = {
  getPrice: "market-price",
  getTechnicalIndicator: "market-price-indicator",
  getSmartMoney: "polymarket-smart-money",
  getOnChainIndicator: "market-onchain-indicator",
  getSocialMindshare: "social-mindshare",
  getNewsFeed: "news-feed",
  getFearGreed: "market-fear-greed",
  getDeFiMetrics: "project-defi-metrics",
  getMarketRanking: "market-ranking",
  getSocialDetail: "social-detail",
};

const MUTATION_PLAN = [
  {
    lesson: "Prioritize smart money evidence before sentiment-driven signals",
    toolPriority: [
      "getSmartMoney", "getPrice", "getOnChainIndicator", "getNewsFeed",
      "getTechnicalIndicator", "getSocialMindshare", "getFearGreed", "getDeFiMetrics",
      "getMarketRanking", "getSocialDetail",
    ],
    avoid: "relying on a single data source",
  },
  {
    lesson: "Increase source diversity by requiring at least 4 unique sources",
    toolPriority: [
      "getSmartMoney", "getPrice", "getNewsFeed", "getOnChainIndicator",
      "getTechnicalIndicator", "getSocialMindshare", "getDeFiMetrics", "getFearGreed",
      "getMarketRanking", "getSocialDetail",
    ],
    avoid: "repeating the same tool with no new signal",
  },
  {
    lesson: "Quantify claims with concrete values instead of qualitative wording",
    toolPriority: [
      "getPrice", "getOnChainIndicator", "getSmartMoney", "getTechnicalIndicator",
      "getNewsFeed", "getSocialMindshare", "getFearGreed", "getDeFiMetrics",
      "getMarketRanking", "getSocialDetail",
    ],
    avoid: "using vague claims without supporting numbers",
  },
  {
    lesson: "Cross-check directional claims against both smart money and price trend",
    toolPriority: [
      "getSmartMoney", "getPrice", "getTechnicalIndicator", "getOnChainIndicator",
      "getNewsFeed", "getSocialMindshare", "getFearGreed", "getDeFiMetrics",
      "getMarketRanking", "getSocialDetail",
    ],
    avoid: "making logical leaps between unrelated events",
  },
] as const;

function uniquePush(values: string[], next: string, maxLen: number): string[] {
  if (!values.includes(next)) values.push(next);
  if (values.length > maxLen) {
    values.splice(0, values.length - maxLen);
  }
  return values;
}

function rankTemplates(
  templates: Array<{ source: string; claim: string }>,
  playbook: Playbook
): Array<{ source: string; claim: string }> {
  const sourcePriority = new Map<string, number>();
  playbook.toolPriority.forEach((tool, idx) => {
    const source = TOOL_SOURCE_MAP[tool];
    if (source && !sourcePriority.has(source)) {
      sourcePriority.set(source, idx);
    }
  });

  return [...templates].sort((a, b) => {
    const pa = sourcePriority.get(a.source) ?? 999;
    const pb = sourcePriority.get(b.source) ?? 999;
    if (pa !== pb) return pa - pb;
    return a.source.localeCompare(b.source);
  });
}

function targetClaimCount(playbook: Playbook): number {
  const maturity = Math.max(playbook.generation, playbook.lessons.length);
  return Math.min(6, 3 + Math.min(3, maturity));
}

function quantifiedReasoning(
  side: "YES" | "NO",
  marketQuestion: string,
  idx: number
): string {
  return `Signal ${idx + 1} supports ${side} for "${marketQuestion}" with quantified cross-source evidence.`;
}

export function mockDebater(
  side: "YES" | "NO",
  market: Market,
  playbook: Playbook
): Argument {
  const templates = side === "YES" ? YES_CLAIM_TEMPLATES : NO_CLAIM_TEMPLATES;
  const selected = rankTemplates(templates, playbook).slice(0, targetClaimCount(playbook));

  return {
    side,
    claims: selected.map((t, idx) => ({
      claim: t.claim,
      source: t.source,
      data: {
        mock: true,
        market: market.question,
        metricValue: 50 + idx * 7,
      },
      reasoning: quantifiedReasoning(side, market.question, idx),
    })),
    summary: `Based on ${selected.length} data points across ${new Set(selected.map((s) => s.source)).size} sources, the evidence supports ${side} for "${market.question}".`,
  };
}

export function mockJudge(
  _question: string,
  yesArg: Argument,
  noArg: Argument
): Vote {
  // Deterministic scoring so showcase optimization trends are reproducible.
  const yesDiversity = new Set(yesArg.claims.map((c) => c.source)).size;
  const noDiversity = new Set(noArg.claims.map((c) => c.source)).size;
  const yesScore =
    yesArg.claims.length * 0.3 +
    yesDiversity * 0.4;
  const noScore =
    noArg.claims.length * 0.3 +
    noDiversity * 0.4;

  const winner = yesScore >= noScore ? "YES" as const : "NO" as const;
  const margin = Math.abs(yesScore - noScore);
  const confidence = Math.max(0.55, Math.min(0.9, 0.6 + margin * 0.1));
  return {
    winner,
    confidence: Math.round(confidence * 1000) / 1000,
    reasoning:
      `${winner} team presented ` +
      `${winner === "YES" ? yesArg.claims.length : noArg.claims.length} claims ` +
      `across ${winner === "YES" ? yesDiversity : noDiversity} sources with stronger evidence density`,
  };
}

export function mockAnalyst(
  playbook: Playbook,
  _avgScore: number
): { lessons: string[]; toolPriority: string[]; avoidPatterns: string[]; keyMutation: string } {
  const step = Math.min(playbook.generation, MUTATION_PLAN.length - 1);
  const plan = MUTATION_PLAN[step];
  const lessons = uniquePush([...playbook.lessons], plan.lesson, 8);
  const avoidPatterns = uniquePush([...playbook.avoidPatterns], plan.avoid, 5);

  return {
    lessons,
    toolPriority: [...plan.toolPriority],
    avoidPatterns,
    keyMutation: plan.lesson,
  };
}
