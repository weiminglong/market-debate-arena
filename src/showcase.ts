// Curated live markets for the stage demo. Verified active 2026-07-07, all
// resolving end of July 2026 — refresh before any demo after that (find
// candidates with: surf search-prediction-market --status active --category
// crypto --sort-by volume_7d --order desc). Expired or extreme-priced entries
// are detected at runtime and replaced from live discovery (see arena.ts).
export const SHOWCASE_CONDITION_IDS = [
  // BTC toss-up (p≈0.50): "Will Bitcoin reach $67,500 in July?"
  "0xbe20fcfd54937c2a48a7b8521ca349e6a2c4373566328ebb950a8c35ab1be3d9",
  // BTC upside (p≈0.75): "Will Bitcoin reach $65,000 in July?"
  "0xc9c9790c8f26dd9c8cabae9dd76be37aa86a6ded7de660e1da9d19324cf618d4",
  // BTC downside (p≈0.34): "Will Bitcoin dip to $57,500 in July?"
  "0x2be031440c5a571cd4fc3e05e2478d98aee41c7a44d10d3c5e6a24e38b30fabb",
] as const;

export function getShowcaseConditionIds(
  count: number = SHOWCASE_CONDITION_IDS.length
): string[] {
  const safeCount = Math.max(
    1,
    Math.min(Math.floor(count), SHOWCASE_CONDITION_IDS.length)
  );
  return SHOWCASE_CONDITION_IDS.slice(0, safeCount);
}
