export type Side = "YES" | "NO";

export interface Claim {
  claim: string;
  source: string;
  data: Record<string, unknown>;
  reasoning: string;
}

export interface Argument {
  side: Side;
  claims: Claim[];
  summary: string;
}

export interface Vote {
  winner: Side;
  confidence: number;
  reasoning: string;
}

export interface ConsensusResult {
  winner: Side;
  votes: Vote[];
  unanimous: boolean;
  averageConfidence: number;
}

export interface Market {
  question: string;
  conditionId: string;
  platform: "polymarket" | "kalshi";
  latestPrice: number;
  category: string;
  marketLink: string;
  status?: string;
}

export interface DebateResult {
  market: Market;
  yesArgument: Argument;
  noArgument: Argument;
  consensus: ConsensusResult;
  score: number;
  durationMs?: number;
}

export interface GenerationResult {
  generation: number;
  debates: DebateResult[];
  averageScore: number;
  playbook: Playbook;
  metadata?: GenerationMetadata;
}

export interface GenerationMetadata {
  runId: string;
  createdAt: string;
  runtime: "claude" | "cursor";
  mock: boolean;
  showcase: boolean;
  totalDurationMs?: number;
}

export interface Playbook {
  generation: number;
  lessons: string[];
  toolPriority: string[];
  avoidPatterns: string[];
}

export interface EvolutionHistoryEntry {
  generation: number;
  averageScore: number;
  improvement: string;
  keyMutation: string;
  reverted: boolean;
  durationMs?: number;
}

// Canonical research tool catalog — the single source of truth for playbook
// tool names. Everything else (surf command mapping, mock claim sources, the
// debater prompt's tool list) is derived from it; hand-synced copies drift and
// silently corrupt the source-diversity metrics.
export interface ToolCatalogEntry {
  command: string;
  example: string;
  blurb: string;
}

export const TOOL_CATALOG: Record<string, ToolCatalogEntry> = {
  getPrice: {
    command: "surf market-price",
    example: "surf market-price --symbol BTC",
    blurb: "price history",
  },
  getTechnicalIndicator: {
    command: "surf market-price-indicator",
    example: "surf market-price-indicator --indicator rsi --symbol BTC",
    blurb: "RSI, MACD, bollinger",
  },
  getSmartMoney: {
    command: "surf polymarket-smart-money",
    example: "surf polymarket-smart-money",
    blurb: "smart money/whale activity",
  },
  getOnChainIndicator: {
    command: "surf market-onchain-indicator",
    example: "surf market-onchain-indicator --symbol BTC --metric nupl",
    blurb: "on-chain: nupl, sopr",
  },
  getSocialMindshare: {
    command: "surf social-mindshare",
    example: "surf social-mindshare --q bitcoin",
    blurb: "social buzz trends",
  },
  getNewsFeed: {
    command: "surf news-feed",
    example: "surf news-feed --limit 5",
    blurb: "recent crypto news",
  },
  getFearGreed: {
    command: "surf market-fear-greed",
    example: "surf market-fear-greed",
    blurb: "fear & greed index",
  },
  getDeFiMetrics: {
    command: "surf project-defi-metrics",
    example: "surf project-defi-metrics --q aave",
    blurb: "DeFi TVL, fees",
  },
  getMarketRanking: {
    command: "surf market-ranking",
    example: "surf market-ranking --limit 10",
    blurb: "token rankings",
  },
  getSocialDetail: {
    command: "surf social-detail",
    example: "surf social-detail --q bitcoin",
    blurb: "social analytics",
  },
};

export const TOOL_SURF_COMMANDS: Record<string, string> = Object.fromEntries(
  Object.entries(TOOL_CATALOG).map(([name, entry]) => [name, entry.command])
);

export const KNOWN_TOOLS = Object.keys(TOOL_CATALOG);

export const DEFAULT_PLAYBOOK: Playbook = {
  generation: 0,
  lessons: [],
  toolPriority: [...KNOWN_TOOLS],
  avoidPatterns: [],
};
