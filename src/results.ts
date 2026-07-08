// src/results.ts
import { writeFileSync, readFileSync, readdirSync, mkdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Claim, GenerationResult } from "./types.js";

// Anchor to the repo root (not process.cwd()) so runs from other directories
// read and write the same results. RESULTS_DIR env overrides for tests.
function resultsDir(): string {
  return (
    process.env.RESULTS_DIR ||
    join(dirname(fileURLToPath(import.meta.url)), "..", "results")
  );
}

export interface StoredResult {
  filename: string;
  timestampKey: string;
  result: GenerationResult;
}

// Filenames are gen-<n>-<timestamp>[-<runId>].json — timestamp first so plain
// lexicographic sort stays chronological; runId suffix is for human navigation.
function parseTimestampKey(filename: string): string {
  const match = filename.match(/^gen-\d+-(.+)\.json$/);
  return match ? match[1] : filename;
}

function stripClaimData(claims: Claim[]): Claim[] {
  return claims.map((c) => {
    const data =
      c.data && typeof c.data === "object" && !Array.isArray(c.data)
        ? c.data
        : {};
    return {
      ...c,
      data: Object.keys(data).length > 5 ? { _truncated: true } : data,
    };
  });
}

export function saveGenerationResult(result: GenerationResult): string {
  const dir = resultsDir();
  mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runSuffix = result.metadata?.runId ? `-${result.metadata.runId}` : "";
  const filename = `gen-${result.generation}-${timestamp}${runSuffix}.json`;
  const filepath = join(dir, filename);

  // Strip raw data from claims to keep files manageable
  const stripped = {
    ...result,
    debates: result.debates.map((d) => ({
      ...d,
      yesArgument: {
        ...d.yesArgument,
        claims: stripClaimData(d.yesArgument.claims),
      },
      noArgument: {
        ...d.noArgument,
        claims: stripClaimData(d.noArgument.claims),
      },
    })),
  };

  writeFileSync(filepath, JSON.stringify(stripped, null, 2) + "\n");
  return filepath;
}

export function loadStoredResults(): StoredResult[] {
  let files: string[];
  try {
    // Only generation result files — not sibling state like resolutions.json.
    files = readdirSync(resultsDir()).filter(
      (f) => f.startsWith("gen-") && f.endsWith(".json")
    );
  } catch {
    return [];
  }

  // One corrupt file must not erase the whole history — skip it with a warning.
  const loaded: StoredResult[] = [];
  for (const filename of files) {
    try {
      const raw = readFileSync(join(resultsDir(), filename), "utf-8");
      const parsed: unknown = JSON.parse(raw);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        !Array.isArray((parsed as GenerationResult).debates)
      ) {
        console.warn(`Warning: skipping malformed result file ${filename}`);
        continue;
      }
      loaded.push({
        filename,
        timestampKey: parseTimestampKey(filename),
        result: parsed as GenerationResult,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`Warning: skipping unreadable result file ${filename}: ${msg}`);
    }
  }

  loaded.sort((a, b) => a.timestampKey.localeCompare(b.timestampKey));
  return loaded;
}

export function loadAllResults(): GenerationResult[] {
  return loadStoredResults().map((entry) => entry.result);
}

export interface RunSummary {
  runId: string;
  createdAt: string;
  runtime: string;
  mock: boolean;
  generations: number;
  totalDurationMs: number;
  /** Timestamp key of the run's newest result file. */
  lastActivity: string;
  files: string[];
}

// Ordered by last activity (oldest first), so a run that is still writing
// results sorts as most recent and prune never deletes it out from under
// itself. Results without run metadata are grouped under "(untagged)".
export function summarizeRuns(): RunSummary[] {
  const byRun = new Map<string, RunSummary>();
  for (const { filename, timestampKey, result } of loadStoredResults()) {
    const runId = result.metadata?.runId || "(untagged)";
    let summary = byRun.get(runId);
    if (!summary) {
      summary = {
        runId,
        createdAt: result.metadata?.createdAt || "",
        runtime: result.metadata?.runtime || "?",
        mock: Boolean(result.metadata?.mock),
        generations: 0,
        totalDurationMs: 0,
        lastActivity: timestampKey,
        files: [],
      };
      byRun.set(runId, summary);
    }
    summary.generations++;
    summary.totalDurationMs += result.metadata?.totalDurationMs ?? 0;
    if (timestampKey > summary.lastActivity) summary.lastActivity = timestampKey;
    summary.files.push(filename);
  }
  return Array.from(byRun.values()).sort((a, b) =>
    a.lastActivity.localeCompare(b.lastActivity)
  );
}

// Deletes result files belonging to all but the most recent `keep` runs.
// Returns the deleted filenames.
export function pruneResults(keep: number): string[] {
  const runs = summarizeRuns();
  if (runs.length <= keep) return [];

  const toDelete = runs.slice(0, runs.length - keep);
  const deleted: string[] = [];
  for (const run of toDelete) {
    for (const filename of run.files) {
      try {
        unlinkSync(join(resultsDir(), filename));
        deleted.push(filename);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`Warning: could not delete ${filename}: ${msg}`);
      }
    }
  }
  return deleted;
}
