// src/market-selector.ts
import { runSurf } from "./tools/surf-runner.js";
import { PRICE_BAND } from "./config.js";
import type { Market } from "./types.js";

interface FetchOptions {
  count?: number;
  conditionId?: string;
  category?: string;
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
    const data = (await runSurf("search-prediction-market", {
      "condition-id": options.conditionId,
      limit: 1,
    })) as RawMarket[];

    if (data.length === 0) {
      throw new Error(
        `No market found for condition id ${options.conditionId} — check the id (or find one with: surf search-prediction-market --q "<topic>")`
      );
    }
    return data.map(toMarket);
  }

  const data = (await runSurf("search-prediction-market", {
    status: "active",
    "sort-by": "volume_7d",
    order: "desc",
    limit: Math.min(options.count || 5, 20),
    ...(options.category ? { category: options.category } : {}),
  })) as RawMarket[];

  const filtered = data.filter((m) => {
    const p = m.latest_price ?? 0.5;
    return p >= PRICE_BAND.min && p <= PRICE_BAND.max;
  });

  if (data.length > 0 && filtered.length === 0) {
    throw new Error(
      `Found ${data.length} active markets but none priced within the debatable band ` +
        `${PRICE_BAND.min}-${PRICE_BAND.max} — try a different --condition-id or a larger --markets count`
    );
  }

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
    status: raw.status,
  };
}
