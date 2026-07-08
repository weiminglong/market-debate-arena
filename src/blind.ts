import type { Argument, Claim } from "./types.js";

// A claim sourced from a prediction-market lookup/odds tool is how a
// price-blinded debater would smuggle the market's own quote to the judges.
// This is deliberately narrow — it matches market-lookup/odds sources but NOT
// legitimate research like "market-price" (spot), "polymarket-smart-money"
// (positioning direction), or "market-fear-greed".
const MARKET_LOOKUP_SOURCE =
  /search[- ]?prediction[- ]?market|(prediction[- ]?market|polymarket|kalshi)[- ]?(odds|implied|price)/i;

export function isMarketLookupSource(source: string): boolean {
  return MARKET_LOOKUP_SOURCE.test(source);
}

// Code-enforced blind: drop market-lookup claims before the judges see them, so
// the price stays hidden even if a debater ignores the prompt and queries the
// market. Returns the filtered argument plus what was removed (for logging).
export function stripMarketLookupClaims(argument: Argument): {
  argument: Argument;
  removed: Claim[];
} {
  const removed = argument.claims.filter((c) => isMarketLookupSource(c.source));
  if (removed.length === 0) return { argument, removed };
  return {
    argument: { ...argument, claims: argument.claims.filter((c) => !isMarketLookupSource(c.source)) },
    removed,
  };
}

// Backstop for the harder case: a debater launders the quote into prose under an
// innocuous source. Flags a claim whose text uses market-odds language AND
// mentions a probability within tolerance of the actual market price. Narrow on
// purpose — an underlying asset price like "$57,500" is not a 0-1 probability
// and never trips it.
const ODDS_PHRASE =
  /implied prob|market('?s)?\s+(is\s+)?pric|market\s+is\s+pricing|trades?\s+at\s+0?\.\d|priced\s+at\s+0?\.\d|polymarket|kalshi|odds\s+(of|are)|%\s*implied/i;

export function detectPriceLeak(
  argument: Argument,
  marketPrice: number,
  tolerance = 0.03
): { suspected: boolean; snippets: string[] } {
  const snippets: string[] = [];
  for (const claim of argument.claims) {
    const text = `${claim.claim} ${claim.reasoning}`;
    if (!ODDS_PHRASE.test(text)) continue;
    const decimals = text.match(/\b0?\.\d+\b/g) || [];
    const nearPrice = decimals.some(
      (d) => Math.abs(Number(d) - marketPrice) <= tolerance
    );
    if (nearPrice) snippets.push(text.slice(0, 120));
  }
  return { suspected: snippets.length > 0, snippets };
}
