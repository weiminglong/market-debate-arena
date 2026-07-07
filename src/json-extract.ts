// Total character-visit budget per extraction call. LLM/CLI output with many
// unmatched open braces makes per-start scanning quadratic; the budget turns a
// pathological multi-minute stall into a fast bail-out with best-effort result.
const SCAN_BUDGET = 4_000_000;

interface BalancedScan {
  /** Index of the balancing close bracket, or -1 if none. */
  end: number;
  /** Characters visited (budget accounting). */
  visited: number;
  /** True when the scan hit end-of-text with brackets still open (truncated doc). */
  truncated: boolean;
}

function scanBalancedEnd(text: string, start: number, budget: number): BalancedScan {
  let depth = 0;
  let inString = false;
  let escaped = false;

  const limit = Math.min(text.length, start + budget);
  let i = start;
  for (; i < limit; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{" || ch === "[") {
      depth++;
      continue;
    }

    if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) {
        return { end: i, visited: i - start + 1, truncated: false };
      }
      if (depth < 0) {
        return { end: -1, visited: i - start + 1, truncated: false };
      }
    }
  }

  return { end: -1, visited: i - start, truncated: i >= text.length && depth > 0 };
}

// Prose before/after the JSON (including stray braces or unmatched quotes) must
// not poison extraction, so every "{" is tried as a candidate start and only
// candidates that actually parse count. Iteration runs backward from the last
// "{" — the final answer object is found first — keeping the best candidate by
// (latest end, then outermost start).
export function extractLastJSONObject(text: string): string | null {
  let budget = SCAN_BUDGET;
  let best: { start: number; end: number } | null = null;

  for (
    let start = text.lastIndexOf("{");
    start >= 0 && budget > 0;
    start = text.lastIndexOf("{", start - 1)
  ) {
    const scan = scanBalancedEnd(text, start, budget);
    budget -= scan.visited;
    if (scan.end < 0) continue;
    // Going backward, a new candidate can only beat the best by enclosing it
    // (same or later end from an earlier start = outermost object).
    if (best && scan.end < best.end) continue;

    const candidate = text.slice(start, scan.end + 1);
    budget -= candidate.length;
    try {
      JSON.parse(candidate);
    } catch {
      continue;
    }
    best = { start, end: scan.end };
  }

  return best ? text.slice(best.start, best.end + 1) : null;
}

// JSON payload of CLI output that may carry log-line prefixes before the
// document (e.g. surf). The payload is the FINAL content of stdout, so a
// candidate followed by further JSON-ish content is a log fragment ("[404]"),
// not the payload. A document that hits end-of-text unbalanced is truncated —
// return null rather than a balanced interior fragment, so callers surface a
// retryable truncation error instead of mistaking the fragment for the payload.
export function extractFirstJSONValue(text: string): string | null {
  let budget = SCAN_BUDGET;

  for (let i = 0; i < text.length && budget > 0; i++) {
    const ch = text[i];
    if (ch !== "{" && ch !== "[") continue;

    const scan = scanBalancedEnd(text, i, budget);
    budget -= scan.visited;
    if (scan.truncated) return null;
    if (scan.end < 0) continue;

    const trailing = text.slice(scan.end + 1);
    if (/[{[]/.test(trailing)) {
      i = scan.end;
      continue;
    }

    const candidate = text.slice(i, scan.end + 1);
    budget -= candidate.length;
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      i = scan.end;
      continue;
    }
  }

  return null;
}
