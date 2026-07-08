import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runSurf, SurfCreditsExhaustedError } from "./tools/surf-runner.js";
import { RESOLUTION } from "./config.js";
import type { Market } from "./types.js";

export type Outcome = 0 | 1;

interface RawMarket {
  condition_id?: string;
  market_ticker?: string;
  latest_price?: number;
  status?: string;
}

// Pure mapping: surf's status + snapped price → a resolved outcome, or null
// when the market is still active or closed-but-not-yet-decisive. Trusts surf's
// status, never outside knowledge (surf can lag real-world settlement).
export function outcomeFromMarket(
  status: string | undefined,
  price: number | undefined
): Outcome | null {
  const s = (status || "").toLowerCase();
  if (s !== "closed" && s !== "finalized") return null;
  if (typeof price !== "number" || !Number.isFinite(price)) return null;
  if (price >= RESOLUTION.yes) return 1;
  if (price <= RESOLUTION.no) return 0;
  return null;
}

export interface Resolution {
  outcome: Outcome;
  status: string;
  resolvedPrice: number;
  resolvedAt: string;
}

// A lookup is one of three things — resolved, genuinely not-yet-settled, or a
// failed query — and the caller must not conflate the last two (a surf outage
// is not "markets haven't settled").
export type ResolveResult =
  | { kind: "resolved"; resolution: Resolution }
  | { kind: "pending" }
  | { kind: "error"; message: string };

// Live lookup for one market. Polymarket markets are keyed by condition_id,
// Kalshi by market_ticker. Fatal, systemic failures (no credits, surf CLI
// missing) propagate so the whole command aborts honestly; a per-market query
// failure is reported as { kind: "error" }, never as "pending".
export async function resolveMarket(
  conditionId: string,
  platform: Market["platform"],
  nowIso: string
): Promise<ResolveResult> {
  const params: Record<string, string | number | boolean> =
    platform === "kalshi"
      ? { "market-ticker": conditionId, limit: 1 }
      : { "condition-id": conditionId, limit: 1 };

  let rows: RawMarket[];
  try {
    rows = (await runSurf("search-prediction-market", params)) as RawMarket[];
  } catch (e: unknown) {
    if (e instanceof SurfCreditsExhaustedError) throw e;
    if (e instanceof Error && /surf CLI not found/i.test(e.message)) throw e;
    return { kind: "error", message: e instanceof Error ? e.message.slice(0, 140) : String(e) };
  }
  if (!Array.isArray(rows) || rows.length === 0) return { kind: "pending" };

  const raw = rows[0];
  const outcome = outcomeFromMarket(raw.status, raw.latest_price);
  if (outcome === null) return { kind: "pending" };

  return {
    kind: "resolved",
    resolution: {
      outcome,
      status: String(raw.status),
      resolvedPrice: raw.latest_price as number,
      resolvedAt: nowIso,
    },
  };
}

// Durable cache of resolved outcomes, so a settled market is queried once and
// the record survives even if surf later changes. Keyed by conditionId.
export type ResolutionCache = Record<string, Resolution>;

function cachePath(): string {
  const dir =
    process.env.RESULTS_DIR ||
    join(dirname(fileURLToPath(import.meta.url)), "..", "results");
  return join(dir, "resolutions.json");
}

export function loadResolutionCache(): ResolutionCache {
  try {
    const parsed: unknown = JSON.parse(readFileSync(cachePath(), "utf-8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ResolutionCache;
    }
  } catch {
    /* no cache yet */
  }
  return {};
}

export function saveResolutionCache(cache: ResolutionCache): void {
  const path = cachePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cache, null, 2) + "\n");
}
