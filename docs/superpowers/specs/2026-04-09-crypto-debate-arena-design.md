# Crypto Debate Arena — Design Spec

**Date:** 2026-04-09
**Hackathon theme:** Automated research — harnesses, tools, benchmarks, challenges, or demonstrations
**Stack:** TypeScript, Anthropic SDK (tool use), Surf CLI, Node.js

## 1. Overview

Crypto Debate Arena is an adversarial AI research benchmark built on prediction markets. Multiple AI agents autonomously research crypto questions using real-time data, debate opposing sides, and are judged by a Byzantine consensus panel. The system evolves its research strategies across generations, getting measurably better over time.

**Core thesis:** The best way to benchmark automated research is to pit agents against each other on questions that have objective ground truth — prediction market prices — and let the system self-improve.

## 2. Core Loop

```
1. Fetch active prediction markets from Polymarket/Kalshi via surf
2. For each market question:
   a. Assign a YES debater agent and a NO debater agent
   b. Both autonomously research using surf tools (up to 10 tool calls each)
   c. Each builds a structured argument with verifiable claims
   d. A panel of 3 independent judge agents evaluates both sides
   e. Judges cast Byzantine votes — majority wins
   f. Winner is scored against actual market price
3. After all debates, an analyst agent reviews outcomes and evolves the strategy playbook
4. Repeat for next generation with evolved strategies
```

## 3. Agent Architecture

### 3.1 Debater Agents (2 per market)

Each debater is a Claude conversation with tool use via the Anthropic SDK. It receives:
- The prediction market question (e.g., "Will BTC hit $120K by Sep 2026?")
- Its assigned side: YES or NO
- The current strategy playbook (evolves across generations)
- A set of ~10 surf-backed tools

The agent autonomously:
1. Formulates a research strategy based on the question and playbook
2. Calls tools to gather evidence (multi-step — results inform next queries)
3. Produces a structured argument:

```typescript
interface Argument {
  side: "YES" | "NO";
  claims: Claim[];
  summary: string;
}

interface Claim {
  claim: string;           // "ETH RSI is at 32 (oversold territory)"
  source: string;          // "market-price-indicator"
  data: Record<string, unknown>; // Raw data from the tool call
  reasoning: string;       // Why this supports the assigned side
}
```

**Constraint:** Max 10 tool calls per debater to keep costs and runtime bounded.

### 3.2 Judge Agents (panel of 3)

Each judge is an independent Claude call that receives both structured arguments. Judges have no tools — they evaluate purely on the evidence presented. Each produces:

```typescript
interface Vote {
  winner: "YES" | "NO";
  confidence: number;      // 0-1
  reasoning: string;       // Why this side's evidence was stronger
}
```

Judges evaluate on:
- Evidence relevance to the specific question
- Data recency and quality
- Source diversity (multi-domain evidence > single-domain)
- Logical coherence of the argument

### 3.3 Byzantine Consensus

Simple majority vote: 2 of 3 judges must agree on the winner. The consensus module outputs:

```typescript
interface ConsensusResult {
  winner: "YES" | "NO";
  votes: Vote[];           // All 3 votes for auditability
  unanimous: boolean;
  averageConfidence: number;
}
```

## 4. Market Selection

Markets are fetched from Polymarket via `search-prediction-market`. Selection criteria:
- Status: active (not resolved)
- Sufficient liquidity (avoid thin markets where price is noisy)
- Crypto-related preferred but not required (macro and politics also valid)

Users can also specify markets manually by condition ID.

For the demo, we pre-select ~5 diverse markets to show breadth.

## 5. Scoring

### Per-market score
The market price represents consensus probability. Scoring measures alignment:
- If judges pick YES and market price is P: `score = P`
- If judges pick NO and market price is P: `score = 1 - P`

Example: Market at 0.72 YES → judges pick YES → score = 0.72.
Example: Market at 0.72 YES → judges pick NO → score = 0.28.

A perfect system picks the side the market favors, yielding scores > 0.5 consistently.

### Aggregate benchmark
Average alignment score across all markets in a generation. This is the number that should improve over generations.

### Why market price, not resolved outcomes?
Resolved outcomes take weeks/months. Market price gives instant ground truth and makes the benchmark runnable on any active market at any time. This is a design choice, not a limitation — market price aggregates all available information, making it a strong proxy for "what good research should conclude." Resolved outcomes can be used for retroactive validation but are not required for the benchmark to function.

## 6. Surf Tool Integration

Tools exposed to debater agents:

| Tool Name              | Surf Command               | Use Case                              |
|------------------------|---------------------------|---------------------------------------|
| `getPrice`             | `market-price`            | Price history and current price       |
| `getTechnicalIndicator`| `market-price-indicator`  | RSI, MACD, Bollinger bands            |
| `getOnChainIndicator`  | `market-onchain-indicator`| NUPL, SOPR, on-chain metrics          |
| `getSocialMindshare`   | `social-mindshare`        | Project mindshare trends              |
| `getSocialDetail`      | `social-detail`           | Aggregated social analytics           |
| `getNewsFeed`          | `news-feed`               | Recent crypto news                    |
| `getSmartMoney`        | `polymarket-smart-money`  | Smart money flows on prediction mkts  |
| `getMarketRanking`     | `market-ranking`          | Token rankings by various metrics     |
| `getDeFiMetrics`       | `project-defi-metrics`    | TVL, protocol metrics                 |
| `getFearGreed`         | `market-fear-greed`       | Market sentiment index                |

Each tool wraps a `surf <command>` call via `child_process.execFile`, parses JSON output, and returns structured data. Tool set is intentionally focused (~10) so agents make deliberate research choices rather than shotgunning all 83+ endpoints.

## 7. Evolution Engine

The system runs debates in **generations**. After each generation, it analyzes what worked and evolves.

### 7.1 Strategy Playbook

A persistent JSON file that accumulates research wisdom:

```typescript
interface Playbook {
  generation: number;
  lessons: string[];          // "Lead with on-chain evidence"
  toolPriority: string[];     // Ordered tool preference
  avoidPatterns: string[];    // "Don't rely solely on sentiment"
}
```

Debaters receive the current playbook in their system prompt. It's the "DNA" that evolves.

### 7.2 Analyst Agent

After each generation completes, an analyst agent receives:
- All debate transcripts (tool calls made, arguments built, judge reasoning)
- Which side won each debate vs. which side the market favored
- Current playbook

It then:
- Identifies patterns in winning vs. losing arguments
- Updates the playbook with new lessons
- Adjusts tool priority rankings
- Removes lessons that didn't hold up in this generation

### 7.3 Score Tracking

Each generation's results are persisted for comparison:

```
Generation  | Avg Score | Improvement | Key Mutation
------------|-----------|-------------|---------------------------
  1         |  0.58     |  baseline   | (default prompts)
  2         |  0.64     |  +10.3%     | prioritize on-chain data
  3         |  0.71     |  +10.9%     | add smart money cross-ref
  4         |  0.69     |  -2.8%      | over-indexed on news (reverted)
  5         |  0.74     |  +7.2%      | require multi-source claims
```

The evolution is auditable — every playbook mutation is logged with the reasoning behind it.

## 8. Project Structure

```
surfing/
├── src/
│   ├── index.ts                # CLI entry point
│   ├── arena.ts                # Orchestrator — runs the full debate flow
│   ├── market-selector.ts      # Fetches & filters prediction markets via surf
│   ├── debater.ts              # Debater agent — Claude + tool use
│   ├── judge.ts                # Judge agent — evaluates arguments, casts vote
│   ├── consensus.ts            # Byzantine voting logic
│   ├── scorer.ts               # Scores debate outcome against market price
│   ├── tools/
│   │   ├── index.ts            # Tool definitions for Anthropic tool use
│   │   └── surf-runner.ts      # Executes surf CLI commands, parses output
│   ├── evolution/
│   │   ├── analyst.ts          # Post-generation analysis agent
│   │   ├── playbook.ts         # Read/write/mutate the strategy playbook
│   │   └── runner.ts           # Multi-generation loop orchestrator
│   └── types.ts                # Shared types
├── strategies/
│   └── playbook.json           # Current evolved strategy (persisted)
├── results/                    # JSON output of completed debates
├── package.json
└── tsconfig.json
```

## 9. CLI Interface

```bash
# Run a single generation of debates on 3 markets
npx tsx src/index.ts --markets 3

# Run 5 generations of evolution on 3 markets each
npx tsx src/index.ts --markets 3 --generations 5

# Run on a specific Polymarket market
npx tsx src/index.ts --condition-id 0x1234...

# View evolution history
npx tsx src/index.ts --history
```

## 10. Dependencies

- `@anthropic-ai/sdk` — Claude API with tool use
- `tsx` — TypeScript execution
- `commander` — CLI argument parsing
- `chalk` + `cli-table3` — Terminal output formatting

No framework, no server, no database. Pure CLI tool — run it and watch agents research.

## 11. Demo Flow

For a hackathon presentation:

1. Show the system fetching live prediction markets
2. Run one debate with verbose output — watch agents pick tools, gather data, build arguments in real-time
3. Show judges deliberating and voting
4. Run `--generations 5` — show the score chart climbing over generations
5. Open `strategies/playbook.json` — show what the system learned autonomously

The compelling narrative: "We built a system where AI agents get better at crypto research by debating each other and learning from their mistakes — no human in the loop."
