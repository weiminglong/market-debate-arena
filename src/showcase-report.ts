import chalk from "chalk";
import Table from "cli-table3";
import { loadAllResults } from "./results.js";
import type { GenerationResult } from "./types.js";

export interface ShowcaseMetrics {
  averageAlignmentProxy: number;
  avgClaimsPerSide: number;
  avgSourceDiversityPerSide: number;
  avgJudgeConfidence: number;
  researchQualityIndex: number;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function sourceDiversity(claims: { source: string }[]): number {
  return new Set(claims.map((c) => c.source)).size;
}

export function computeShowcaseMetrics(
  generationResult: GenerationResult
): ShowcaseMetrics {
  const debates = generationResult.debates;
  if (debates.length === 0) {
    return {
      averageAlignmentProxy: generationResult.averageScore,
      avgClaimsPerSide: 0,
      avgSourceDiversityPerSide: 0,
      avgJudgeConfidence: 0,
      researchQualityIndex: 0,
    };
  }

  const avgClaimsPerSide =
    debates.reduce(
      (sum, d) => sum + (d.yesArgument.claims.length + d.noArgument.claims.length) / 2,
      0
    ) / debates.length;

  const avgSourceDiversityPerSide =
    debates.reduce(
      (sum, d) =>
        sum +
        (sourceDiversity(d.yesArgument.claims) +
          sourceDiversity(d.noArgument.claims)) /
          2,
      0
    ) / debates.length;

  const avgJudgeConfidence =
    debates.reduce((sum, d) => sum + d.consensus.averageConfidence, 0) / debates.length;

  // RQI is independent from unresolved market outcomes.
  const claimsScore = Math.min(avgClaimsPerSide / 6, 1);
  const diversityScore = Math.min(avgSourceDiversityPerSide / 5, 1);
  const confidenceScore = Math.max(0, Math.min(1, avgJudgeConfidence));
  const researchQualityIndex = round3(
    claimsScore * 0.45 + diversityScore * 0.35 + confidenceScore * 0.2
  );

  return {
    averageAlignmentProxy: round3(generationResult.averageScore),
    avgClaimsPerSide: round3(avgClaimsPerSide),
    avgSourceDiversityPerSide: round3(avgSourceDiversityPerSide),
    avgJudgeConfidence: round3(avgJudgeConfidence),
    researchQualityIndex,
  };
}

function summarizeStrategyShift(
  previous: GenerationResult | null,
  current: GenerationResult
): string {
  if (!previous) return "baseline";

  const addedLesson = current.playbook.lessons.find(
    (lesson) => !previous.playbook.lessons.includes(lesson)
  );
  if (addedLesson) return `+ lesson: ${addedLesson}`;

  const addedAvoid = current.playbook.avoidPatterns.find(
    (pattern) => !previous.playbook.avoidPatterns.includes(pattern)
  );
  if (addedAvoid) return `+ avoid: ${addedAvoid}`;

  const currentTopTool = current.playbook.toolPriority[0];
  const previousTopTool = previous.playbook.toolPriority[0];
  if (currentTopTool && currentTopTool !== previousTopTool) {
    return `tool priority shift: ${currentTopTool}`;
  }

  return "strategy refined";
}

export function selectLatestRunSeries(
  results: GenerationResult[]
): GenerationResult[] {
  if (results.length === 0) return [];

  const latest = results[results.length - 1];
  const latestRunId = latest.metadata?.runId;
  if (latestRunId) {
    return results
      .filter((r) => r.metadata?.runId === latestRunId)
      .sort((a, b) => a.generation - b.generation);
  }

  // Fallback for old result files without run metadata:
  // walk backwards from latest and pick contiguous generation chain.
  const chain: GenerationResult[] = [latest];
  let expected = latest.generation - 1;
  for (let i = results.length - 2; i >= 0 && expected >= 1; i--) {
    if (results[i].generation === expected) {
      chain.push(results[i]);
      expected--;
    }
  }
  return chain.reverse();
}

function printSummaryDelta(series: GenerationResult[]): void {
  if (series.length < 2) return;
  const first = computeShowcaseMetrics(series[0]);
  const last = computeShowcaseMetrics(series[series.length - 1]);

  const rqiDelta = round3(last.researchQualityIndex - first.researchQualityIndex);
  const alignDelta = round3(last.averageAlignmentProxy - first.averageAlignmentProxy);

  const rqiColor = rqiDelta >= 0 ? chalk.green : chalk.red;
  const alignColor = alignDelta >= 0 ? chalk.green : chalk.red;

  console.log(chalk.bold("\nOptimization Delta:"));
  console.log(`  RQI: ${rqiColor((rqiDelta >= 0 ? "+" : "") + rqiDelta.toFixed(3))}`);
  console.log(
    `  Alignment proxy: ${alignColor((alignDelta >= 0 ? "+" : "") + alignDelta.toFixed(3))}`
  );
}

export function printShowcaseReport(series: GenerationResult[]): void {
  if (series.length === 0) {
    console.log("No results found. Run a generation first.");
    return;
  }

  console.log(chalk.bold("\n=== Automated Optimization Report ===\n"));

  const table = new Table({
    head: ["Gen", "Align*", "RQI", "Claims/Side", "SrcDiv/Side", "JudgeConf", "Strategy Shift"],
    colWidths: [6, 8, 8, 13, 13, 11, 58],
    style: { head: ["cyan"] },
    wordWrap: true,
  });

  let previous: GenerationResult | null = null;
  for (const result of series) {
    const metrics = computeShowcaseMetrics(result);
    table.push([
      String(result.generation),
      metrics.averageAlignmentProxy.toFixed(3),
      metrics.researchQualityIndex.toFixed(3),
      metrics.avgClaimsPerSide.toFixed(2),
      metrics.avgSourceDiversityPerSide.toFixed(2),
      metrics.avgJudgeConfidence.toFixed(3),
      summarizeStrategyShift(previous, result),
    ]);
    previous = result;
  }

  console.log(table.toString());
  printSummaryDelta(series);

  console.log(
    chalk.gray(
      "\n* Align = market-alignment proxy versus live implied probability (markets may be unresolved).\n" +
        "  RQI = research quality index from claim depth, source diversity, and judge confidence.\n"
    )
  );
}

export function showLatestShowcaseReport(): void {
  const results = loadAllResults();
  const latestSeries = selectLatestRunSeries(results);
  printShowcaseReport(latestSeries);
}
