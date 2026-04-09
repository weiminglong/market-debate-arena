# Crypto Debate Arena — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an adversarial AI research benchmark where debater agents research prediction market questions using surf crypto data, are judged by a Byzantine consensus panel, and evolve their strategies across generations.

**Architecture:** CLI tool orchestrating Claude agents via Anthropic SDK tool use. Debater agents call surf-backed tools to gather evidence. Judge agents evaluate arguments. An analyst agent evolves the strategy playbook between generations.

**Tech Stack:** TypeScript, `@anthropic-ai/sdk`, `tsx`, `commander`, `chalk`, `cli-table3`, surf CLI

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/types.ts`

- [ ] **Step 1: Initialize project and install dependencies**

```bash
cd /Users/weiming/Documents/GitHub/surfing
npm init -y
npm install @anthropic-ai/sdk commander chalk cli-table3
npm install -D typescript tsx @types/node
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create shared types in `src/types.ts`**

```typescript
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
```

- [ ] **Step 4: Create directories for strategies and results**

```bash
mkdir -p strategies results
echo '{}' > strategies/playbook.json
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json src/types.ts strategies/ results/
git commit -m "feat: scaffold project with types and dependencies"
```

---

### Task 2: Surf Runner — CLI Wrapper

**Files:**
- Create: `src/tools/surf-runner.ts`
- Create: `src/tools/surf-runner.test.ts`

- [ ] **Step 1: Write the test for surf-runner**

```typescript
// src/tools/surf-runner.test.ts
import { describe, it, assert } from "node:test";
import { runSurf } from "./surf-runner.js";

describe("runSurf", () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/tools/surf-runner.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement surf-runner**

```typescript
// src/tools/surf-runner.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runSurf(
  command: string,
  params: Record<string, string | number | boolean>
): Promise<unknown> {
  const args = [command, "-o", "json", "-f", "body.data"];

  for (const [key, value] of Object.entries(params)) {
    if (value === true) {
      args.push(`--${key}`);
    } else if (value !== false && value !== undefined) {
      args.push(`--${key}`, String(value));
    }
  }

  const { stdout, stderr } = await execFileAsync("surf", args, {
    timeout: 30_000,
  });

  if (!stdout.trim()) {
    throw new Error(`surf ${command} returned empty output. stderr: ${stderr}`);
  }

  return JSON.parse(stdout);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/tools/surf-runner.test.ts`
Expected: 3 tests PASS (requires surf CLI and network)

- [ ] **Step 5: Commit**

```bash
git add src/tools/surf-runner.ts src/tools/surf-runner.test.ts
git commit -m "feat: add surf CLI wrapper with tests"
```

---

### Task 3: Tool Definitions for Anthropic SDK

**Files:**
- Create: `src/tools/index.ts`

- [ ] **Step 1: Write the tool definitions**

These are the Anthropic SDK tool definitions that debater agents will use. Each tool maps to a surf command.

```typescript
// src/tools/index.ts
import Anthropic from "@anthropic-ai/sdk";
import { runSurf } from "./surf-runner.js";

type Tool = Anthropic.Tool;

export const DEBATER_TOOLS: Tool[] = [
  {
    name: "getPrice",
    description:
      "Get token price history. Returns array of {symbol, timestamp, value} objects.",
    input_schema: {
      type: "object" as const,
      properties: {
        symbol: {
          type: "string",
          description: "Token symbol, e.g. BTC, ETH, SOL",
        },
        time_range: {
          type: "string",
          description: "Time range: 1d, 7d, 30d, 90d, 1y",
        },
      },
      required: ["symbol"],
    },
  },
  {
    name: "getTechnicalIndicator",
    description:
      "Get technical indicator data (RSI, MACD, Bollinger Bands). Returns array of indicator values over time.",
    input_schema: {
      type: "object" as const,
      properties: {
        indicator: {
          type: "string",
          description: "Indicator type: rsi, macd, bollinger",
        },
        symbol: { type: "string", description: "Token symbol, e.g. BTC, ETH" },
        interval: {
          type: "string",
          description: "Candle interval: 1h, 4h, 1d",
        },
      },
      required: ["indicator", "symbol"],
    },
  },
  {
    name: "getOnChainIndicator",
    description:
      "Get on-chain metrics like NUPL, SOPR, active addresses. Returns time-series data.",
    input_schema: {
      type: "object" as const,
      properties: {
        symbol: { type: "string", description: "Token symbol, e.g. BTC, ETH" },
        metric: {
          type: "string",
          description: "Metric name, e.g. nupl, sopr, active-addresses",
        },
      },
      required: ["symbol", "metric"],
    },
  },
  {
    name: "getSocialMindshare",
    description:
      "Get project mindshare (social buzz) time series. Shows how much attention a project is getting on crypto Twitter.",
    input_schema: {
      type: "object" as const,
      properties: {
        q: {
          type: "string",
          description: "Project name or symbol to search, e.g. bitcoin, ethereum",
        },
        interval: { type: "string", description: "Interval: 1d, 7d" },
      },
      required: ["q"],
    },
  },
  {
    name: "getSocialDetail",
    description:
      "Get aggregated social analytics for a crypto Twitter account — follower counts, engagement metrics, smart follower ratio.",
    input_schema: {
      type: "object" as const,
      properties: {
        q: {
          type: "string",
          description: "Twitter handle or project name",
        },
      },
      required: ["q"],
    },
  },
  {
    name: "getNewsFeed",
    description:
      "Get recent crypto news articles. Returns title, summary, source, and publication date.",
    input_schema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Filter by project name",
        },
        limit: { type: "number", description: "Max articles to return (default 10)" },
      },
      required: [],
    },
  },
  {
    name: "getSmartMoney",
    description:
      "Get smart money (whale) activity on Polymarket prediction markets. Shows which direction large traders are betting.",
    input_schema: {
      type: "object" as const,
      properties: {
        condition_id: {
          type: "string",
          description: "Polymarket condition ID",
        },
        category: {
          type: "string",
          description: "Market category filter",
        },
      },
      required: [],
    },
  },
  {
    name: "getMarketRanking",
    description:
      "Get token rankings by market cap, volume, or price change. Returns ranked list of tokens.",
    input_schema: {
      type: "object" as const,
      properties: {
        sort_by: {
          type: "string",
          description: "Sort metric: market_cap, volume_24h, price_change_24h",
        },
        limit: { type: "number", description: "Number of results (default 20)" },
      },
      required: [],
    },
  },
  {
    name: "getDeFiMetrics",
    description:
      "Get DeFi protocol metrics — TVL, fees, revenue over time for a specific protocol.",
    input_schema: {
      type: "object" as const,
      properties: {
        q: {
          type: "string",
          description: "Protocol name, e.g. aave, uniswap, lido",
        },
        metric: {
          type: "string",
          description: "Metric: tvl, fees, revenue",
        },
      },
      required: ["q"],
    },
  },
  {
    name: "getFearGreed",
    description:
      "Get the Crypto Fear & Greed Index history. Returns daily values (0=Extreme Fear, 100=Extreme Greed) with classification.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

// Maps tool name → surf command and parameter transforms
const TOOL_COMMAND_MAP: Record<
  string,
  { command: string; mapParams: (input: Record<string, unknown>) => Record<string, string | number | boolean> }
> = {
  getPrice: {
    command: "market-price",
    mapParams: (input) => ({
      symbol: input.symbol as string,
      ...(input.time_range ? { "time-range": input.time_range as string } : {}),
    }),
  },
  getTechnicalIndicator: {
    command: "market-price-indicator",
    mapParams: (input) => ({
      indicator: input.indicator as string,
      symbol: input.symbol as string,
      ...(input.interval ? { interval: input.interval as string } : {}),
    }),
  },
  getOnChainIndicator: {
    command: "market-onchain-indicator",
    mapParams: (input) => ({
      symbol: input.symbol as string,
      metric: input.metric as string,
    }),
  },
  getSocialMindshare: {
    command: "social-mindshare",
    mapParams: (input) => ({
      q: input.q as string,
      ...(input.interval ? { interval: input.interval as string } : {}),
    }),
  },
  getSocialDetail: {
    command: "social-detail",
    mapParams: (input) => ({ q: input.q as string }),
  },
  getNewsFeed: {
    command: "news-feed",
    mapParams: (input) => ({
      ...(input.project ? { project: input.project as string } : {}),
      limit: (input.limit as number) || 10,
    }),
  },
  getSmartMoney: {
    command: "polymarket-smart-money",
    mapParams: (input) => ({
      ...(input.condition_id ? { "condition-id": input.condition_id as string } : {}),
      ...(input.category ? { category: input.category as string } : {}),
    }),
  },
  getMarketRanking: {
    command: "market-ranking",
    mapParams: (input) => ({
      ...(input.sort_by ? { "sort-by": input.sort_by as string } : {}),
      limit: (input.limit as number) || 20,
    }),
  },
  getDeFiMetrics: {
    command: "project-defi-metrics",
    mapParams: (input) => ({
      q: input.q as string,
      ...(input.metric ? { metric: input.metric as string } : {}),
    }),
  },
  getFearGreed: {
    command: "market-fear-greed",
    mapParams: () => ({}),
  },
};

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<string> {
  const mapping = TOOL_COMMAND_MAP[toolName];
  if (!mapping) {
    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }

  try {
    const params = mapping.mapParams(toolInput);
    const result = await runSurf(mapping.command, params);
    // Truncate large responses to keep context manageable
    const json = JSON.stringify(result);
    if (json.length > 4000) {
      const truncated = JSON.stringify(
        Array.isArray(result) ? (result as unknown[]).slice(0, 10) : result
      );
      return truncated;
    }
    return json;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return JSON.stringify({ error: msg });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/tools/index.ts
git commit -m "feat: add Anthropic tool definitions mapping to surf commands"
```

---

### Task 4: Market Selector

**Files:**
- Create: `src/market-selector.ts`
- Create: `src/market-selector.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/market-selector.test.ts
import { describe, it, assert } from "node:test";
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/market-selector.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement market-selector**

```typescript
// src/market-selector.ts
import { runSurf } from "./tools/surf-runner.js";
import type { Market } from "./types.js";

interface FetchOptions {
  count?: number;
  conditionId?: string;
}

interface RawMarket {
  question: string;
  condition_id?: string;
  market_ticker?: string;
  platform: "polymarket" | "kalshi";
  latest_price?: number;
  category?: string;
  market_link?: string;
  volume_7d?: number;
  status?: string;
}

export async function fetchMarkets(options: FetchOptions): Promise<Market[]> {
  if (options.conditionId) {
    // Fetch a specific market
    const data = (await runSurf("search-prediction-market", {
      "condition-id": options.conditionId,
      limit: 1,
    })) as RawMarket[];

    return data.map(toMarket);
  }

  // Fetch active markets, sorted by volume
  const data = (await runSurf("search-prediction-market", {
    status: "active",
    "sort-by": "volume_7d",
    order: "desc",
    limit: Math.min(options.count || 5, 20),
  })) as RawMarket[];

  // Filter for markets with a clear YES/NO price (between 0.1 and 0.9)
  // to avoid near-resolved markets that are trivially one-sided
  const filtered = data.filter((m) => {
    const p = m.latest_price ?? 0.5;
    return p >= 0.1 && p <= 0.9;
  });

  return filtered.slice(0, options.count || 5).map(toMarket);
}

function toMarket(raw: RawMarket): Market {
  return {
    question: raw.question,
    conditionId: raw.condition_id || raw.market_ticker || "",
    platform: raw.platform,
    latestPrice: raw.latest_price ?? 0.5,
    category: raw.category || "Unknown",
    marketLink: raw.market_link || "",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/market-selector.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/market-selector.ts src/market-selector.test.ts
git commit -m "feat: add market selector fetching from prediction markets"
```

---

### Task 5: Debater Agent

**Files:**
- Create: `src/debater.ts`

- [ ] **Step 1: Implement the debater agent**

This is the core research agent. It uses the Anthropic SDK with tool use to autonomously research and build an argument.

```typescript
// src/debater.ts
import Anthropic from "@anthropic-ai/sdk";
import { DEBATER_TOOLS, executeTool } from "./tools/index.js";
import type { Argument, Claim, Market, Playbook, Side } from "./types.js";

const client = new Anthropic();

const MAX_TOOL_CALLS = 10;

function buildSystemPrompt(side: Side, market: Market, playbook: Playbook): string {
  let prompt = `You are a crypto research analyst assigned to argue the ${side} side of a prediction market debate.

MARKET QUESTION: ${market.question}
CURRENT MARKET PRICE: ${market.latestPrice} (probability of YES)
YOUR SIDE: ${side}

Your job is to build the strongest possible case for ${side} using real data from the tools available to you. You have up to ${MAX_TOOL_CALLS} tool calls — use them wisely.

Research strategy:
1. Think about what data would support the ${side} case
2. Use tools to gather evidence across multiple domains (price, on-chain, social, news, etc.)
3. Build your argument with specific, data-backed claims

After gathering evidence, respond with your final argument as JSON in this exact format:
{
  "side": "${side}",
  "claims": [
    {
      "claim": "specific factual claim backed by data",
      "source": "tool_name_used",
      "data": { "key data points from the tool response" },
      "reasoning": "why this supports ${side}"
    }
  ],
  "summary": "your overall argument for ${side}"
}

IMPORTANT: Only output the JSON object as your final response. No other text.`;

  if (playbook.lessons.length > 0) {
    prompt += `\n\nSTRATEGY PLAYBOOK (learned from prior generations):`;
    prompt += `\nLessons: ${playbook.lessons.join("; ")}`;
    prompt += `\nTool priority: ${playbook.toolPriority.join(", ")}`;
    if (playbook.avoidPatterns.length > 0) {
      prompt += `\nAvoid: ${playbook.avoidPatterns.join("; ")}`;
    }
  }

  return prompt;
}

export async function runDebater(
  side: Side,
  market: Market,
  playbook: Playbook,
  verbose: boolean = false
): Promise<Argument> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Research and build your case for ${side} on: "${market.question}". Use the available tools to gather evidence, then present your structured argument as JSON.`,
    },
  ];

  let toolCallCount = 0;

  while (toolCallCount < MAX_TOOL_CALLS) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: buildSystemPrompt(side, market, playbook),
      tools: DEBATER_TOOLS,
      messages,
    });

    // Check if the model wants to use tools
    if (response.stop_reason === "tool_use") {
      const assistantContent = response.content;
      messages.push({ role: "assistant", content: assistantContent });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of assistantContent) {
        if (block.type === "tool_use") {
          toolCallCount++;
          if (verbose) {
            console.log(`    [${side}] Tool ${toolCallCount}/${MAX_TOOL_CALLS}: ${block.name}(${JSON.stringify(block.input)})`);
          }
          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    } else {
      // Model is done — extract the final argument
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error(`${side} debater returned no text response`);
      }

      return parseArgument(textBlock.text, side);
    }
  }

  // Hit tool call limit — force a final response without tools
  messages.push({
    role: "user",
    content:
      "You have used all your tool calls. Now present your final argument as JSON based on the evidence gathered so far.",
  });

  const finalResponse = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: buildSystemPrompt(side, market, playbook),
    messages,
  });

  const textBlock = finalResponse.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`${side} debater returned no final text`);
  }

  return parseArgument(textBlock.text, side);
}

function parseArgument(text: string, side: Side): Argument {
  // Extract JSON from the response (may be wrapped in markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Fallback: return the text as a single-claim argument
    return {
      side,
      claims: [
        {
          claim: text.slice(0, 200),
          source: "direct-response",
          data: {},
          reasoning: text,
        },
      ],
      summary: text,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Argument;
    return { ...parsed, side };
  } catch {
    return {
      side,
      claims: [],
      summary: text,
    };
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/debater.ts
git commit -m "feat: add debater agent with tool use via Anthropic SDK"
```

---

### Task 6: Judge Agent and Byzantine Consensus

**Files:**
- Create: `src/judge.ts`
- Create: `src/consensus.ts`
- Create: `src/consensus.test.ts`

- [ ] **Step 1: Write the consensus test**

```typescript
// src/consensus.test.ts
import { describe, it, assert } from "node:test";
import { computeConsensus } from "./consensus.js";
import type { Vote } from "./types.js";

describe("computeConsensus", () => {
  it("picks YES when majority votes YES", () => {
    const votes: Vote[] = [
      { winner: "YES", confidence: 0.8, reasoning: "strong data" },
      { winner: "YES", confidence: 0.6, reasoning: "moderate data" },
      { winner: "NO", confidence: 0.7, reasoning: "dissent" },
    ];
    const result = computeConsensus(votes);
    assert.strictEqual(result.winner, "YES");
    assert.strictEqual(result.unanimous, false);
    assert.strictEqual(result.votes.length, 3);
  });

  it("picks NO when majority votes NO", () => {
    const votes: Vote[] = [
      { winner: "NO", confidence: 0.9, reasoning: "a" },
      { winner: "NO", confidence: 0.7, reasoning: "b" },
      { winner: "YES", confidence: 0.5, reasoning: "c" },
    ];
    const result = computeConsensus(votes);
    assert.strictEqual(result.winner, "NO");
  });

  it("detects unanimous vote", () => {
    const votes: Vote[] = [
      { winner: "YES", confidence: 0.9, reasoning: "a" },
      { winner: "YES", confidence: 0.8, reasoning: "b" },
      { winner: "YES", confidence: 0.7, reasoning: "c" },
    ];
    const result = computeConsensus(votes);
    assert.strictEqual(result.unanimous, true);
  });

  it("computes average confidence", () => {
    const votes: Vote[] = [
      { winner: "YES", confidence: 0.9, reasoning: "a" },
      { winner: "YES", confidence: 0.6, reasoning: "b" },
      { winner: "NO", confidence: 0.3, reasoning: "c" },
    ];
    const result = computeConsensus(votes);
    assert.ok(Math.abs(result.averageConfidence - 0.6) < 0.01);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/consensus.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement consensus**

```typescript
// src/consensus.ts
import type { ConsensusResult, Side, Vote } from "./types.js";

export function computeConsensus(votes: Vote[]): ConsensusResult {
  const yesVotes = votes.filter((v) => v.winner === "YES").length;
  const noVotes = votes.filter((v) => v.winner === "NO").length;
  const winner: Side = yesVotes >= noVotes ? "YES" : "NO";

  const avgConfidence =
    votes.reduce((sum, v) => sum + v.confidence, 0) / votes.length;

  return {
    winner,
    votes,
    unanimous: yesVotes === votes.length || noVotes === votes.length,
    averageConfidence: Math.round(avgConfidence * 1000) / 1000,
  };
}
```

- [ ] **Step 4: Run consensus test to verify it passes**

Run: `npx tsx --test src/consensus.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Implement judge agent**

```typescript
// src/judge.ts
import Anthropic from "@anthropic-ai/sdk";
import type { Argument, Vote } from "./types.js";

const client = new Anthropic();

const JUDGE_SYSTEM = `You are an impartial judge evaluating a debate between two AI research agents about a prediction market question. Each agent has presented evidence-backed arguments for their side.

Evaluate both sides on:
1. Evidence relevance — Is the data directly relevant to the prediction question?
2. Data recency — Is the evidence recent and timely?
3. Source diversity — Did the agent use multiple data domains (price, on-chain, social, news)?
4. Logical coherence — Does the reasoning follow from the evidence?

You must pick a winner. Respond with JSON in this exact format:
{
  "winner": "YES" or "NO",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation of why this side's evidence was stronger"
}

IMPORTANT: Only output the JSON object. No other text.`;

export async function runJudge(
  question: string,
  yesArgument: Argument,
  noArgument: Argument
): Promise<Vote> {
  const prompt = `PREDICTION MARKET QUESTION: ${question}

=== YES TEAM ARGUMENT ===
Summary: ${yesArgument.summary}

Claims:
${yesArgument.claims
  .map(
    (c, i) =>
      `${i + 1}. [${c.source}] ${c.claim}\n   Reasoning: ${c.reasoning}`
  )
  .join("\n")}

=== NO TEAM ARGUMENT ===
Summary: ${noArgument.summary}

Claims:
${noArgument.claims
  .map(
    (c, i) =>
      `${i + 1}. [${c.source}] ${c.claim}\n   Reasoning: ${c.reasoning}`
  )
  .join("\n")}

Which side presented a stronger, more well-evidenced case? Vote now.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: JUDGE_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Judge returned no text");
  }

  return parseVote(textBlock.text);
}

function parseVote(text: string): Vote {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { winner: "YES", confidence: 0.5, reasoning: text };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      winner: parsed.winner === "NO" ? "NO" : "YES",
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
      reasoning: parsed.reasoning || "",
    };
  } catch {
    return { winner: "YES", confidence: 0.5, reasoning: text };
  }
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/judge.ts src/consensus.ts src/consensus.test.ts
git commit -m "feat: add judge agent and Byzantine consensus voting"
```

---

### Task 7: Scorer

**Files:**
- Create: `src/scorer.ts`
- Create: `src/scorer.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/scorer.test.ts
import { describe, it, assert } from "node:test";
import { scoreDebate } from "./scorer.js";

describe("scoreDebate", () => {
  it("scores high when judges agree with market", () => {
    // Market at 0.8 YES, judges pick YES → score = 0.8
    const score = scoreDebate("YES", 0.8);
    assert.strictEqual(score, 0.8);
  });

  it("scores low when judges disagree with market", () => {
    // Market at 0.8 YES, judges pick NO → score = 0.2
    const score = scoreDebate("NO", 0.8);
    assert.ok(Math.abs(score - 0.2) < 0.001);
  });

  it("scores 0.5 on even market regardless of pick", () => {
    assert.strictEqual(scoreDebate("YES", 0.5), 0.5);
    assert.strictEqual(scoreDebate("NO", 0.5), 0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/scorer.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement scorer**

```typescript
// src/scorer.ts
import type { Side } from "./types.js";

export function scoreDebate(winner: Side, marketPrice: number): number {
  // marketPrice = probability of YES (0 to 1)
  // If judges pick YES: score = marketPrice (higher = more aligned)
  // If judges pick NO: score = 1 - marketPrice
  const score = winner === "YES" ? marketPrice : 1 - marketPrice;
  return Math.round(score * 1000) / 1000;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/scorer.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/scorer.ts src/scorer.test.ts
git commit -m "feat: add debate scorer measuring market alignment"
```

---

### Task 8: Arena Orchestrator

**Files:**
- Create: `src/arena.ts`

- [ ] **Step 1: Implement the arena**

This orchestrates a single generation: fetches markets, runs debates in parallel, scores results.

```typescript
// src/arena.ts
import chalk from "chalk";
import { fetchMarkets } from "./market-selector.js";
import { runDebater } from "./debater.js";
import { runJudge } from "./judge.js";
import { computeConsensus } from "./consensus.js";
import { scoreDebate } from "./scorer.js";
import type { DebateResult, GenerationResult, Market, Playbook } from "./types.js";

const NUM_JUDGES = 3;

async function runSingleDebate(
  market: Market,
  playbook: Playbook,
  verbose: boolean
): Promise<DebateResult> {
  if (verbose) {
    console.log(chalk.cyan(`\n  Debating: "${market.question}"`));
    console.log(chalk.gray(`  Market price: ${market.latestPrice} | Platform: ${market.platform}`));
  }

  // Run YES and NO debaters in parallel
  if (verbose) console.log(chalk.yellow("  Starting debaters..."));

  const [yesArgument, noArgument] = await Promise.all([
    runDebater("YES", market, playbook, verbose),
    runDebater("NO", market, playbook, verbose),
  ]);

  if (verbose) {
    console.log(chalk.green(`  YES claims: ${yesArgument.claims.length}`));
    console.log(chalk.red(`  NO claims: ${noArgument.claims.length}`));
    console.log(chalk.yellow("  Judges deliberating..."));
  }

  // Run judges in parallel
  const votes = await Promise.all(
    Array.from({ length: NUM_JUDGES }, () =>
      runJudge(market.question, yesArgument, noArgument)
    )
  );

  const consensus = computeConsensus(votes);
  const score = scoreDebate(consensus.winner, market.latestPrice);

  if (verbose) {
    const winColor = consensus.winner === "YES" ? chalk.green : chalk.red;
    console.log(
      `  Verdict: ${winColor(consensus.winner)} (${consensus.unanimous ? "unanimous" : "majority"}, confidence: ${consensus.averageConfidence})`
    );
    console.log(`  Score: ${chalk.bold(String(score))}`);
  }

  return { market, yesArgument, noArgument, consensus, score };
}

export interface ArenaOptions {
  marketCount: number;
  conditionId?: string;
  verbose: boolean;
}

export async function runGeneration(
  playbook: Playbook,
  options: ArenaOptions
): Promise<GenerationResult> {
  const generation = playbook.generation + 1;
  console.log(chalk.bold(`\n=== Generation ${generation} ===`));

  // Fetch markets
  const markets = await fetchMarkets({
    count: options.marketCount,
    conditionId: options.conditionId,
  });

  console.log(`Found ${markets.length} markets to debate.\n`);

  // Run debates sequentially to avoid overwhelming the API
  // (each debate already has internal parallelism with YES/NO + judges)
  const debates: DebateResult[] = [];
  for (const market of markets) {
    const result = await runSingleDebate(market, playbook, options.verbose);
    debates.push(result);
  }

  const averageScore =
    Math.round(
      (debates.reduce((sum, d) => sum + d.score, 0) / debates.length) * 1000
    ) / 1000;

  return {
    generation,
    debates,
    averageScore,
    playbook: { ...playbook, generation },
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/arena.ts
git commit -m "feat: add arena orchestrator for debate generations"
```

---

### Task 9: Evolution Engine

**Files:**
- Create: `src/evolution/playbook.ts`
- Create: `src/evolution/analyst.ts`
- Create: `src/evolution/runner.ts`

- [ ] **Step 1: Implement playbook persistence**

```typescript
// src/evolution/playbook.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PLAYBOOK, type Playbook } from "../types.js";

const PLAYBOOK_PATH = join(process.cwd(), "strategies", "playbook.json");

export function loadPlaybook(): Playbook {
  try {
    const raw = readFileSync(PLAYBOOK_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    // If it's an empty object or doesn't have required fields, return default
    if (!parsed.generation && parsed.generation !== 0) {
      return { ...DEFAULT_PLAYBOOK };
    }
    return parsed as Playbook;
  } catch {
    return { ...DEFAULT_PLAYBOOK };
  }
}

export function savePlaybook(playbook: Playbook): void {
  writeFileSync(PLAYBOOK_PATH, JSON.stringify(playbook, null, 2) + "\n");
}
```

- [ ] **Step 2: Implement analyst agent**

```typescript
// src/evolution/analyst.ts
import Anthropic from "@anthropic-ai/sdk";
import type { GenerationResult, Playbook } from "../types.js";

const client = new Anthropic();

const ANALYST_SYSTEM = `You are a research strategy analyst. You review debate results to identify what research strategies worked and evolve the strategy playbook.

You receive:
- Debate results: which side won, what evidence they used, judge reasoning, and whether the result aligned with the market
- The current playbook of research lessons

Your job: update the playbook to improve future debate performance.

Respond with JSON in this exact format:
{
  "lessons": ["lesson 1", "lesson 2", ...],
  "toolPriority": ["tool1", "tool2", ...],
  "avoidPatterns": ["pattern to avoid 1", ...],
  "keyMutation": "one-line description of the biggest change this generation"
}

Rules:
- Keep total lessons under 10 (drop least useful ones)
- Keep avoidPatterns under 5
- toolPriority must include all 10 tools: getPrice, getTechnicalIndicator, getOnChainIndicator, getSocialMindshare, getSocialDetail, getNewsFeed, getSmartMoney, getMarketRanking, getDeFiMetrics, getFearGreed
- If a lesson from the previous playbook led to worse scores, remove it
- Be specific and actionable: "Use RSI + price trend together" not "Use good data"

IMPORTANT: Only output the JSON object. No other text.`;

export async function evolvePlaybook(
  generationResult: GenerationResult,
  currentPlaybook: Playbook
): Promise<{ playbook: Playbook; keyMutation: string }> {
  // Build a summary of the generation for the analyst
  const debateSummaries = generationResult.debates.map((d) => ({
    question: d.market.question,
    marketPrice: d.market.latestPrice,
    winner: d.consensus.winner,
    score: d.score,
    aligned: d.score > 0.5,
    unanimous: d.consensus.unanimous,
    yesClaimSources: d.yesArgument.claims.map((c) => c.source),
    noClaimSources: d.noArgument.claims.map((c) => c.source),
    yesSummary: d.yesArgument.summary.slice(0, 200),
    noSummary: d.noArgument.summary.slice(0, 200),
    judgeReasoning: d.consensus.votes.map((v) => v.reasoning.slice(0, 150)),
  }));

  const prompt = `GENERATION ${generationResult.generation} RESULTS:
Average Score: ${generationResult.averageScore}

CURRENT PLAYBOOK:
Lessons: ${currentPlaybook.lessons.length > 0 ? currentPlaybook.lessons.join("; ") : "(none — first generation)"}
Tool Priority: ${currentPlaybook.toolPriority.join(", ")}
Avoid: ${currentPlaybook.avoidPatterns.length > 0 ? currentPlaybook.avoidPatterns.join("; ") : "(none)"}

DEBATE RESULTS:
${JSON.stringify(debateSummaries, null, 2)}

Analyze these results and produce an updated playbook. Focus on:
1. Which tools appeared in winning arguments vs losing ones?
2. What patterns did judges reward or penalize?
3. Which current lessons held up? Which should be dropped?`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: ANALYST_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return { playbook: currentPlaybook, keyMutation: "analyst failed to respond" };
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { playbook: currentPlaybook, keyMutation: "analyst returned non-JSON" };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const newPlaybook: Playbook = {
      generation: generationResult.generation,
      lessons: parsed.lessons || currentPlaybook.lessons,
      toolPriority: parsed.toolPriority || currentPlaybook.toolPriority,
      avoidPatterns: parsed.avoidPatterns || currentPlaybook.avoidPatterns,
    };
    return {
      playbook: newPlaybook,
      keyMutation: parsed.keyMutation || "unknown",
    };
  } catch {
    return { playbook: currentPlaybook, keyMutation: "analyst JSON parse failed" };
  }
}
```

- [ ] **Step 3: Implement multi-generation runner**

```typescript
// src/evolution/runner.ts
import chalk from "chalk";
import { runGeneration, type ArenaOptions } from "../arena.js";
import { loadPlaybook, savePlaybook } from "./playbook.js";
import { evolvePlaybook } from "./analyst.js";

interface EvolutionSummary {
  generation: number;
  averageScore: number;
  improvement: string;
  keyMutation: string;
}

export async function runEvolution(
  generations: number,
  options: ArenaOptions
): Promise<void> {
  let playbook = loadPlaybook();
  const history: EvolutionSummary[] = [];
  let previousScore = 0;

  for (let i = 0; i < generations; i++) {
    const result = await runGeneration(playbook, options);

    // Evolve the playbook
    console.log(chalk.yellow("\n  Analyst evolving strategy..."));
    const { playbook: newPlaybook, keyMutation } = await evolvePlaybook(
      result,
      playbook
    );

    const improvement =
      previousScore === 0
        ? "baseline"
        : `${((result.averageScore - previousScore) / previousScore * 100).toFixed(1)}%`;

    history.push({
      generation: result.generation,
      averageScore: result.averageScore,
      improvement,
      keyMutation,
    });

    console.log(chalk.bold(`\n  Generation ${result.generation} complete:`));
    console.log(`  Score: ${result.averageScore} (${improvement})`);
    console.log(`  Mutation: ${keyMutation}`);

    if (newPlaybook.lessons.length > 0) {
      console.log(chalk.gray(`  Lessons: ${newPlaybook.lessons.slice(0, 3).join("; ")}${newPlaybook.lessons.length > 3 ? "..." : ""}`));
    }

    playbook = newPlaybook;
    previousScore = result.averageScore;
    savePlaybook(playbook);
  }

  // Print final evolution summary
  printEvolutionTable(history);
}

function printEvolutionTable(history: EvolutionSummary[]): void {
  console.log(chalk.bold("\n\n=== Evolution Summary ===\n"));
  console.log(
    `${"Gen".padEnd(6)}${"Score".padEnd(10)}${"Change".padEnd(12)}Mutation`
  );
  console.log("-".repeat(70));

  for (const row of history) {
    const scoreStr = row.averageScore.toFixed(3).padEnd(10);
    const changeStr = row.improvement.padEnd(12);
    console.log(`${String(row.generation).padEnd(6)}${scoreStr}${changeStr}${row.keyMutation}`);
  }

  console.log("");
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/evolution/playbook.ts src/evolution/analyst.ts src/evolution/runner.ts
git commit -m "feat: add evolution engine with analyst agent and playbook mutation"
```

---

### Task 10: CLI Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Implement the CLI**

```typescript
// src/index.ts
import { Command } from "commander";
import chalk from "chalk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runGeneration } from "./arena.js";
import { runEvolution } from "./evolution/runner.js";
import { loadPlaybook } from "./evolution/playbook.js";

const program = new Command();

program
  .name("crypto-debate-arena")
  .description("Adversarial AI research benchmark on prediction markets")
  .option("-m, --markets <count>", "number of markets to debate", "3")
  .option("-g, --generations <count>", "number of evolution generations", "1")
  .option("--condition-id <id>", "specific Polymarket condition ID")
  .option("-v, --verbose", "show detailed agent activity", false)
  .option("--history", "show evolution history from saved results")
  .action(async (opts) => {
    if (opts.history) {
      showHistory();
      return;
    }

    console.log(chalk.bold("\n🏟️  Crypto Debate Arena\n"));
    console.log(
      chalk.gray(
        "Adversarial AI research benchmark on prediction markets\n"
      )
    );

    const arenaOptions = {
      marketCount: parseInt(opts.markets, 10),
      conditionId: opts.conditionId,
      verbose: opts.verbose,
    };

    const generations = parseInt(opts.generations, 10);

    if (generations > 1) {
      await runEvolution(generations, arenaOptions);
    } else {
      const playbook = loadPlaybook();
      const result = await runGeneration(playbook, arenaOptions);
      printScorecard(result);
    }
  });

function printScorecard(result: import("./types.js").GenerationResult): void {
  console.log(chalk.bold("\n=== Scorecard ===\n"));

  const colWidths = { question: 42, winner: 8, price: 10, score: 7 };
  const header =
    "Market".padEnd(colWidths.question) +
    "Winner".padEnd(colWidths.winner) +
    "Mkt Price".padEnd(colWidths.price) +
    "Score";
  console.log(header);
  console.log("-".repeat(70));

  for (const debate of result.debates) {
    const question = debate.market.question.length > 40
      ? debate.market.question.slice(0, 37) + "..."
      : debate.market.question;
    const winColor = debate.consensus.winner === "YES" ? chalk.green : chalk.red;
    const line =
      question.padEnd(colWidths.question) +
      winColor(debate.consensus.winner.padEnd(colWidths.winner)) +
      debate.market.latestPrice.toFixed(2).padEnd(colWidths.price) +
      debate.score.toFixed(3);
    console.log(line);
  }

  console.log("-".repeat(70));
  console.log(
    `${"Aggregate".padEnd(colWidths.question)}${"".padEnd(colWidths.winner)}${"".padEnd(colWidths.price)}${chalk.bold(result.averageScore.toFixed(3))}`
  );
  console.log("");
}

function showHistory(): void {
  try {
    const raw = readFileSync(
      join(process.cwd(), "strategies", "playbook.json"),
      "utf-8"
    );
    const playbook = JSON.parse(raw);
    console.log(chalk.bold("\nCurrent Playbook:\n"));
    console.log(`Generation: ${playbook.generation || 0}`);
    console.log(
      `Lessons: ${(playbook.lessons || []).length > 0 ? (playbook.lessons as string[]).join("\n  - ") : "(none)"}`
    );
    console.log(`Tool priority: ${(playbook.toolPriority || []).join(", ")}`);
    console.log(
      `Avoid: ${(playbook.avoidPatterns || []).length > 0 ? (playbook.avoidPatterns as string[]).join("; ") : "(none)"}`
    );
    console.log("");
  } catch {
    console.log("No playbook found. Run a generation first.");
  }
}

program.parse();
```

- [ ] **Step 2: Add `bin` script to `package.json`**

Add to `package.json`:
```json
{
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "test": "tsx --test src/**/*.test.ts"
  }
}
```

- [ ] **Step 3: Verify everything compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/index.ts package.json
git commit -m "feat: add CLI entry point with single-gen and evolution modes"
```

---

### Task 11: Results Persistence

**Files:**
- Create: `src/results.ts`

- [ ] **Step 1: Implement results saving**

Save each generation's full results to a JSON file for later analysis.

```typescript
// src/results.ts
import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { GenerationResult } from "./types.js";

const RESULTS_DIR = join(process.cwd(), "results");

export function saveGenerationResult(result: GenerationResult): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `gen-${result.generation}-${timestamp}.json`;
  const filepath = join(RESULTS_DIR, filename);

  // Strip raw data from claims to keep files manageable
  const stripped = {
    ...result,
    debates: result.debates.map((d) => ({
      ...d,
      yesArgument: {
        ...d.yesArgument,
        claims: d.yesArgument.claims.map((c) => ({
          ...c,
          data: Object.keys(c.data).length > 5 ? { _truncated: true } : c.data,
        })),
      },
      noArgument: {
        ...d.noArgument,
        claims: d.noArgument.claims.map((c) => ({
          ...c,
          data: Object.keys(c.data).length > 5 ? { _truncated: true } : c.data,
        })),
      },
    })),
  };

  writeFileSync(filepath, JSON.stringify(stripped, null, 2) + "\n");
  return filepath;
}

export function loadAllResults(): GenerationResult[] {
  try {
    const files = readdirSync(RESULTS_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort();
    return files.map((f) => {
      const raw = readFileSync(join(RESULTS_DIR, f), "utf-8");
      return JSON.parse(raw) as GenerationResult;
    });
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Wire results saving into arena.ts**

Add import at the top of `src/arena.ts`:
```typescript
import { saveGenerationResult } from "./results.js";
```

Add these two lines inside `runGeneration`, just before `return { generation, debates, averageScore, playbook: ... }`:
```typescript
  const genResult: GenerationResult = { generation, debates, averageScore, playbook: { ...playbook, generation } };
  const filepath = saveGenerationResult(genResult);
  console.log(chalk.gray(`  Results saved: ${filepath}`));
  return genResult;
```

Remove the existing `return` statement since `genResult` is now returned explicitly.

- [ ] **Step 3: Wire results into history display**

Update `showHistory` in `src/index.ts` to also load and display past results:

```typescript
import { loadAllResults } from "./results.js";
```

Add to `showHistory` after the playbook display:
```typescript
  const results = loadAllResults();
  if (results.length > 0) {
    console.log(chalk.bold("Generation History:\n"));
    console.log(`${"Gen".padEnd(6)}${"Score".padEnd(10)}Markets`);
    console.log("-".repeat(40));
    for (const r of results) {
      console.log(
        `${String(r.generation).padEnd(6)}${r.averageScore.toFixed(3).padEnd(10)}${r.debates.length}`
      );
    }
    console.log("");
  }
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/results.ts src/arena.ts src/index.ts
git commit -m "feat: add results persistence and history display"
```

---

### Task 12: End-to-End Integration Test

**Files:**
- Create: `src/e2e.test.ts`

- [ ] **Step 1: Write an end-to-end smoke test**

This test runs a single market debate through the full pipeline. It requires the `ANTHROPIC_API_KEY` env var and network access.

```typescript
// src/e2e.test.ts
import { describe, it, assert } from "node:test";
import { runGeneration } from "./arena.js";
import { DEFAULT_PLAYBOOK } from "./types.js";

describe("e2e: single market debate", () => {
  it("runs a full debate and produces a score", async () => {
    const result = await runGeneration(DEFAULT_PLAYBOOK, {
      marketCount: 1,
      verbose: true,
    });

    assert.strictEqual(result.generation, 1);
    assert.strictEqual(result.debates.length, 1);

    const debate = result.debates[0];
    assert.ok(debate.market.question, "should have a market question");
    assert.ok(debate.yesArgument.claims.length > 0, "YES should have claims");
    assert.ok(debate.noArgument.claims.length > 0, "NO should have claims");
    assert.strictEqual(debate.consensus.votes.length, 3, "should have 3 judge votes");
    assert.ok(
      debate.consensus.winner === "YES" || debate.consensus.winner === "NO",
      "winner should be YES or NO"
    );
    assert.ok(debate.score >= 0 && debate.score <= 1, "score should be 0-1");

    console.log(`\nDebate result: ${debate.consensus.winner} won with score ${debate.score}`);
  });
}, { timeout: 120_000 });
```

- [ ] **Step 2: Run the test**

Run: `npx tsx --test src/e2e.test.ts`
Expected: PASS (takes ~30-60s due to API calls). Watch the verbose output to see agents researching live.

- [ ] **Step 3: Commit**

```bash
git add src/e2e.test.ts
git commit -m "test: add end-to-end integration test for full debate pipeline"
```

---

### Task 13: Add .gitignore and Final Cleanup

**Files:**
- Create: `.gitignore`
- Modify: `README.md`

- [ ] **Step 1: Create .gitignore**

```gitignore
node_modules/
dist/
results/*.json
!results/.gitkeep
```

- [ ] **Step 2: Create results/.gitkeep**

```bash
touch results/.gitkeep
```

- [ ] **Step 3: Update README.md**

```markdown
# Crypto Debate Arena

Adversarial AI research benchmark on prediction markets. AI agents autonomously research crypto questions using real-time data, debate opposing sides, and are judged by a Byzantine consensus panel. The system evolves its research strategies across generations.

## Setup

```bash
npm install
```

Requires:
- `ANTHROPIC_API_KEY` environment variable
- `surf` CLI installed and configured (`curl -fsSL https://downloads.asksurf.ai/cli/releases/install.sh | sh`)

## Usage

```bash
# Run a single debate on 3 markets
npx tsx src/index.ts --markets 3 -v

# Run 5 generations of evolution
npx tsx src/index.ts --markets 3 --generations 5 -v

# Debate a specific Polymarket question
npx tsx src/index.ts --condition-id 0x1234...

# View evolution history
npx tsx src/index.ts --history
```

## How It Works

1. Fetches active prediction markets from Polymarket/Kalshi
2. Assigns YES and NO debater agents (Claude with tool use)
3. Each agent autonomously researches using 10 crypto data tools (prices, on-chain, social, news, DeFi, prediction markets)
4. A panel of 3 judge agents evaluates both sides via Byzantine consensus
5. Results scored against market price as ground truth
6. An analyst agent evolves the strategy playbook between generations

## Tests

```bash
# Unit tests (no API key needed)
npx tsx --test src/consensus.test.ts src/scorer.test.ts

# Integration tests (needs API key + network)
npx tsx --test src/tools/surf-runner.test.ts src/market-selector.test.ts

# End-to-end (needs API key + network, ~60s)
npx tsx --test src/e2e.test.ts
```
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore results/.gitkeep README.md
git commit -m "docs: update README with setup and usage instructions"
```
