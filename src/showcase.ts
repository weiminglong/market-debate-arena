export const SHOWCASE_CONDITION_IDS = [
  // Politics (high-liquidity headline market)
  "0x6d0e09d0f04572d9b1adad84703458b0297bc5603b69dccbde93147ee4443246",
  // Crypto (upside scenario)
  "0xabb6bb4f7eefad8300e404ababe1580791e258aef663b73a8bab792518684759",
  // Crypto (downside scenario)
  "0x5f88a260d61f6ab1cc05e8e34019121d5d65c516f33f5eac22755c3a29e20311",
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
