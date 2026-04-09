import { describe, it } from "node:test";
import assert from "node:assert";
import type { GenerationResult } from "./types.js";
import {
  computeShowcaseMetrics,
  selectLatestRunSeries,
} from "./showcase-report.js";

function makeGenerationResult(
  generation: number,
  runId: string,
  yesClaims: number,
  noClaims: number,
  avgConfidence: number
): GenerationResult {
  const makeClaims = (n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => ({
      claim: `${prefix}-claim-${i}`,
      source: i % 2 === 0 ? "surf market-price" : "surf news-feed",
      data: {},
      reasoning: "supports side",
    }));

  return {
    generation,
    averageScore: generation === 1 ? 0.45 : 0.6,
    playbook: {
      generation,
      lessons: generation === 1 ? [] : ["Quantify evidence with concrete values"],
      toolPriority: ["getSmartMoney", "getPrice"],
      avoidPatterns: [],
    },
    metadata: {
      runId,
      createdAt: new Date().toISOString(),
      runtime: "cursor",
      mock: generation !== 2,
      showcase: true,
    },
    debates: [
      {
        market: {
          question: "Test market?",
          conditionId: `test-${generation}`,
          platform: "polymarket",
          latestPrice: 0.6,
          category: "Crypto",
          marketLink: "https://example.com",
        },
        yesArgument: { side: "YES", claims: makeClaims(yesClaims, "yes"), summary: "yes" },
        noArgument: { side: "NO", claims: makeClaims(noClaims, "no"), summary: "no" },
        consensus: {
          winner: "YES",
          votes: [
            { winner: "YES", confidence: avgConfidence, reasoning: "good" },
            { winner: "YES", confidence: avgConfidence, reasoning: "good" },
            { winner: "NO", confidence: avgConfidence, reasoning: "good" },
          ],
          unanimous: false,
          averageConfidence: avgConfidence,
        },
        score: 0.6,
      },
    ],
  };
}

describe("showcase report", () => {
  it("prefers latest run-id group when present", () => {
    const oldRun = makeGenerationResult(1, "run-old", 2, 2, 0.5);
    const newRunG1 = makeGenerationResult(1, "run-new", 3, 3, 0.6);
    const newRunG2 = makeGenerationResult(2, "run-new", 4, 4, 0.7);

    const series = selectLatestRunSeries([oldRun, newRunG1, newRunG2]);
    assert.strictEqual(series.length, 2);
    assert.strictEqual(series[0].metadata?.runId, "run-new");
    assert.strictEqual(series[1].generation, 2);
  });

  it("computes research quality metrics from claims/diversity/confidence", () => {
    const result = makeGenerationResult(1, "run-1", 6, 4, 0.8);
    const metrics = computeShowcaseMetrics(result);

    assert.ok(metrics.avgClaimsPerSide > 0);
    assert.ok(metrics.avgSourceDiversityPerSide > 0);
    assert.ok(metrics.researchQualityIndex >= 0 && metrics.researchQualityIndex <= 1);
  });
});
