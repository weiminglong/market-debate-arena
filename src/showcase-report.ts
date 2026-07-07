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

// Older or partially-written result files can carry null/NaN numbers after
// JSON round-trips; the report must render, not crash.
function finite(value: unknown, fallback: number = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sourceDiversity(claims: { source: string }[]): number {
  return new Set(claims.map((c) => c.source)).size;
}

export function computeShowcaseMetrics(
  generationResult: GenerationResult
): ShowcaseMetrics {
  const debates = Array.isArray(generationResult.debates)
    ? generationResult.debates
    : [];
  if (debates.length === 0) {
    return {
      averageAlignmentProxy: finite(generationResult.averageScore),
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
    debates.reduce((sum, d) => sum + finite(d.consensus.averageConfidence), 0) /
    debates.length;

  // RQI is independent from unresolved market outcomes.
  const claimsScore = Math.min(avgClaimsPerSide / 6, 1);
  const diversityScore = Math.min(avgSourceDiversityPerSide / 5, 1);
  const confidenceScore = Math.max(0, Math.min(1, avgJudgeConfidence));
  const researchQualityIndex = round3(
    claimsScore * 0.45 + diversityScore * 0.35 + confidenceScore * 0.2
  );

  return {
    averageAlignmentProxy: round3(finite(generationResult.averageScore)),
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

function describeRunMode(series: GenerationResult[]): string {
  const modes = new Set(
    series.map((r) => (r.metadata ? (r.metadata.mock ? "MOCK" : "LIVE") : "UNKNOWN"))
  );
  if (modes.size === 1) return [...modes][0];
  return "MIXED (mock + live)";
}

function printRunHeader(series: GenerationResult[]): void {
  const meta = series[0].metadata;
  const mode = describeRunMode(series);
  const modeColor = mode === "LIVE" ? chalk.green : chalk.yellow;

  const parts = [
    meta?.runId ? `Run: ${meta.runId}` : "Run: (no metadata)",
    meta?.createdAt ? `Started: ${meta.createdAt}` : null,
    meta?.runtime ? `Runtime: ${meta.runtime}` : null,
  ].filter(Boolean);
  console.log(chalk.gray(`  ${parts.join("  •  ")}  •  `) + modeColor.bold(mode));
  if (mode !== "LIVE") {
    console.log(
      chalk.yellow("  ⚠ Includes simulated (mock) generations — not live market results.")
    );
  }
  console.log("");
}

export function printShowcaseReport(series: GenerationResult[]): void {
  if (series.length === 0) {
    console.log("No results found. Run a generation first.");
    return;
  }

  console.log(chalk.bold("\n=== Automated Optimization Report ===\n"));
  printRunHeader(series);

  // Fixed columns + borders total 69 chars; fit the shift column to the
  // terminal so the minimum layout still fits an 80-column projector.
  const terminalWidth =
    Number.isFinite(process.stdout.columns) && process.stdout.columns
      ? process.stdout.columns
      : 100;
  const shiftWidth = Math.max(11, Math.min(58, terminalWidth - 69));

  const table = new Table({
    head: ["Gen", "Align*", "RQI", "Claims/Side", "SrcDiv/Side", "JudgeConf", "Strategy Shift"],
    colWidths: [8, 8, 8, 13, 13, 11, shiftWidth],
    style: { head: ["cyan"] },
    wordWrap: true,
  });

  let previous: GenerationResult | null = null;
  for (const result of series) {
    const metrics = computeShowcaseMetrics(result);
    const genLabel = result.metadata?.mock
      ? `${result.generation} (m)`
      : String(result.generation);
    table.push([
      genLabel,
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
        "  RQI = research quality index from claim depth, source diversity, and judge confidence.\n" +
        (series.some((r) => r.metadata?.mock) ? "  (m) = simulated (mock) generation.\n" : "")
    )
  );
}

export function showLatestShowcaseReport(): void {
  const results = loadAllResults();
  const latestSeries = selectLatestRunSeries(results);
  printShowcaseReport(latestSeries);
}
