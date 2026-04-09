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
