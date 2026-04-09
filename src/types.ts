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
}

export interface Playbook {
  generation: number;
  lessons: string[];
  toolPriority: string[];
  avoidPatterns: string[];
}

export const DEFAULT_PLAYBOOK: Playbook = {
  generation: 0,
  lessons: [],
  toolPriority: [
    "getPrice",
    "getTechnicalIndicator",
    "getSmartMoney",
    "getOnChainIndicator",
    "getSocialMindshare",
    "getNewsFeed",
    "getFearGreed",
    "getDeFiMetrics",
    "getMarketRanking",
    "getSocialDetail",
  ],
  avoidPatterns: [],
};
