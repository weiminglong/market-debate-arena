import { loadStoredResults } from "./results.js";
import {
  loadResolutionCache,
  saveResolutionCache,
  resolveMarket,
  type ResolveResult,
} from "./resolver.js";
import {
  computeCalibration,
  type ResolvedPrediction,
  type CalibrationReport,
} from "./calibration.js";
import type { Market, TradeRecommendation } from "./types.js";

export interface Prediction {
  conditionId: string;
  platform: Market["platform"];
  question: string;
  modelProbability: number;
  marketPrice: number;
  edge: number;
  recommendation: TradeRecommendation;
  timestampKey: string;
}

// The latest non-mock prediction per market. A frozen evolution run debates the
// same market every generation; each market resolves once, so we score the most
// recent estimate rather than double-counting the panel.
export function loadPredictions(): Prediction[] {
  const byMarket = new Map<string, Prediction>();
  for (const { timestampKey, result } of loadStoredResults()) {
    if (result.metadata?.mock) continue;
    for (const d of result.debates) {
      const cid = d.market.conditionId;
      if (!cid) continue;
      // Result files that predate the edge metric have no modelProbability/edge;
      // scoring them would inject NaN into Brier/skill/P&L once they resolve.
      if (!Number.isFinite(d.consensus?.modelProbability) || !Number.isFinite(d.edge)) {
        continue;
      }
      const existing = byMarket.get(cid);
      if (!existing || timestampKey > existing.timestampKey) {
        byMarket.set(cid, {
          conditionId: cid,
          platform: d.market.platform,
          question: d.market.question,
          modelProbability: d.consensus.modelProbability,
          marketPrice: d.market.latestPrice,
          edge: d.edge,
          recommendation: d.recommendation,
          timestampKey,
        });
      }
    }
  }
  return [...byMarket.values()];
}

export interface CalibrationRun {
  report: CalibrationReport;
  resolved: ResolvedPrediction[];
  pending: Prediction[];
  /** Predictions whose live lookup failed (surf error) — NOT the same as pending. */
  failed: number;
  failureSample?: string;
  totalPredictions: number;
}

function toResolved(p: Prediction, outcome: 0 | 1): ResolvedPrediction {
  return {
    conditionId: p.conditionId,
    question: p.question,
    modelProbability: p.modelProbability,
    marketPrice: p.marketPrice,
    edge: p.edge,
    recommendation: p.recommendation,
    outcome,
  };
}

export type ResolveFn = (
  conditionId: string,
  platform: Prediction["platform"],
  nowIso: string
) => Promise<ResolveResult>;

export async function runCalibration(opts: {
  refresh: boolean;
  nowIso: string;
  resolve?: ResolveFn; // injectable for tests; defaults to the live surf resolver
}): Promise<CalibrationRun> {
  const resolve = opts.resolve ?? resolveMarket;
  const predictions = loadPredictions();
  const cache = loadResolutionCache();
  let cacheChanged = false;

  const resolved: ResolvedPrediction[] = [];
  const pending: Prediction[] = [];
  let failed = 0;
  let failureSample: string | undefined;

  for (const p of predictions) {
    const cached = cache[p.conditionId];
    if (cached) {
      resolved.push(toResolved(p, cached.outcome));
      continue;
    }
    if (!opts.refresh) {
      pending.push(p);
      continue;
    }

    // A fatal error (no credits / surf missing) propagates and aborts the run.
    const result = await resolve(p.conditionId, p.platform, opts.nowIso);
    if (result.kind === "resolved") {
      cache[p.conditionId] = result.resolution;
      cacheChanged = true;
      resolved.push(toResolved(p, result.resolution.outcome));
    } else if (result.kind === "error") {
      failed++;
      if (!failureSample) failureSample = result.message;
    } else {
      pending.push(p);
    }
  }

  if (cacheChanged) saveResolutionCache(cache);

  return {
    report: computeCalibration(resolved),
    resolved,
    pending,
    failed,
    failureSample,
    totalPredictions: predictions.length,
  };
}
