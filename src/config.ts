// All tunables in one place. Env overrides exist only for the high-churn
// knobs (models, agent timeout) — everything else is edited here.

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    console.warn(
      `Warning: ignoring ${name}="${raw}" (must be a positive integer); using ${fallback}`
    );
    return fallback;
  }
  return n;
}

function envString(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

const DEFAULTS = {
  debater: "sonnet",
  judge: "haiku",
  analyst: "sonnet",
  bashTimeoutMs: 240_000,
} as const;

/** Markets outside this band are effectively settled and not debatable. */
export const PRICE_BAND = { min: 0.1, max: 0.9 } as const;

/** Model per role. Override with DEBATER_MODEL / JUDGE_MODEL / ANALYST_MODEL. */
export const MODELS = {
  debater: envString("DEBATER_MODEL", DEFAULTS.debater),
  judge: envString("JUDGE_MODEL", DEFAULTS.judge),
  analyst: envString("ANALYST_MODEL", DEFAULTS.analyst),
};

/** Agent CLI subprocess limits. Override timeout with AGENT_TIMEOUT_MS. */
export const AGENT_EXEC = {
  // Research runs (6-8 surf calls + reasoning) routinely exceed 120s.
  bashTimeoutMs: envInt("AGENT_TIMEOUT_MS", DEFAULTS.bashTimeoutMs),
  plainTimeoutMs: 120_000,
  maxBuffer: 1024 * 1024 * 10,
};

/** Surf CLI subprocess limits and retry policy. */
export const SURF = {
  timeoutsMs: [45_000, 90_000, 90_000] as readonly number[],
  maxBuffer: 1024 * 1024 * 20,
  retryDelayMs: 1_500,
};

const JUDGE_COUNT = 3;
export const JUDGING = {
  judges: JUDGE_COUNT,
  // A real majority regardless of judge count.
  minValidVotes: Math.floor(JUDGE_COUNT / 2) + 1,
};

/** Research Quality Index component weights (must sum to 1). */
export const RQI_WEIGHTS = { claims: 0.45, diversity: 0.35, confidence: 0.2 } as const;

/**
 * Trade-signal thresholds. `threshold` is the minimum |model P(YES) − market
 * price| worth acting on — it absorbs model noise plus prediction-market fees
 * and slippage, so anything inside the band is a PASS.
 */
export const EDGE = { threshold: 0.08 } as const;

/**
 * Resolution thresholds for scoring past predictions. Surf marks settled
 * markets `closed`/`finalized` and snaps their price to ~0/1; a price at/above
 * `yes` resolves YES, at/below `no` resolves NO, and anything in between is
 * treated as not-yet-decisive (skipped).
 */
export const RESOLUTION = { yes: 0.9, no: 0.1 } as const;

/**
 * Env overrides that actually took effect, for the run banner. Reports the
 * EFFECTIVE value — a set-but-invalid env var is warned about at load time
 * and must not show up here as if it were active.
 */
export function activeConfigOverrides(): string[] {
  const overrides: string[] = [];
  const report = (name: string, effective: string | number, dflt: string | number) => {
    if (process.env[name] && effective !== dflt) {
      overrides.push(`${name}=${effective}`);
    }
  };
  report("DEBATER_MODEL", MODELS.debater, DEFAULTS.debater);
  report("JUDGE_MODEL", MODELS.judge, DEFAULTS.judge);
  report("ANALYST_MODEL", MODELS.analyst, DEFAULTS.analyst);
  report("AGENT_TIMEOUT_MS", AGENT_EXEC.bashTimeoutMs, DEFAULTS.bashTimeoutMs);
  return overrides;
}
