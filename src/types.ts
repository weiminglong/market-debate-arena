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
}

// Canonical research tool set: playbook tool names → the surf CLI command that
// implements them. Used to translate toolPriority into actionable commands in
// prompts and to validate analyst output against known tools.
export const TOOL_SURF_COMMANDS: Record<string, string> = {
  getPrice: "surf market-price",
  getTechnicalIndicator: "surf market-price-indicator",
  getSmartMoney: "surf polymarket-smart-money",
  getOnChainIndicator: "surf market-onchain-indicator",
  getSocialMindshare: "surf social-mindshare",
  getNewsFeed: "surf news-feed",
  getFearGreed: "surf market-fear-greed",
  getDeFiMetrics: "surf project-defi-metrics",
  getMarketRanking: "surf market-ranking",
  getSocialDetail: "surf social-detail",
};

export const KNOWN_TOOLS = Object.keys(TOOL_SURF_COMMANDS);

export const DEFAULT_PLAYBOOK: Playbook = {
  generation: 0,
  lessons: [],
  toolPriority: [...KNOWN_TOOLS],
  avoidPatterns: [],
};
