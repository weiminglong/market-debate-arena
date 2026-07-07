// src/results.ts
import { writeFileSync, readFileSync, readdirSync, mkdirSync } from "node:fs";
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

interface StoredResultFile {
  filename: string;
  timestampKey: string;
  result: GenerationResult;
}

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
  const filename = `gen-${result.generation}-${timestamp}.json`;
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

export function loadAllResults(): GenerationResult[] {
  let files: string[];
  try {
    files = readdirSync(resultsDir()).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }

  // One corrupt file must not erase the whole history — skip it with a warning.
  const loaded: StoredResultFile[] = [];
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
  return loaded.map((entry) => entry.result);
}
