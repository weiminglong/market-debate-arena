// src/results.ts
import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { GenerationResult } from "./types.js";

const RESULTS_DIR = join(process.cwd(), "results");

interface StoredResultFile {
  filename: string;
  timestampKey: string;
  result: GenerationResult;
}

function parseTimestampKey(filename: string): string {
  const match = filename.match(/^gen-\d+-(.+)\.json$/);
  return match ? match[1] : filename;
}

export function saveGenerationResult(result: GenerationResult): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `gen-${result.generation}-${timestamp}.json`;
  const filepath = join(RESULTS_DIR, filename);

  // Strip raw data from claims to keep files manageable
  const stripped = {
    ...result,
    debates: result.debates.map((d) => ({
      ...d,
      yesArgument: {
        ...d.yesArgument,
        claims: d.yesArgument.claims.map((c) => ({
          ...c,
          data: Object.keys(c.data).length > 5 ? { _truncated: true } : c.data,
        })),
      },
      noArgument: {
        ...d.noArgument,
        claims: d.noArgument.claims.map((c) => ({
          ...c,
          data: Object.keys(c.data).length > 5 ? { _truncated: true } : c.data,
        })),
      },
    })),
  };

  writeFileSync(filepath, JSON.stringify(stripped, null, 2) + "\n");
  return filepath;
}

export function loadAllResults(): GenerationResult[] {
  try {
    const files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json"));
    const loaded: StoredResultFile[] = files.map((filename) => {
      const raw = readFileSync(join(RESULTS_DIR, filename), "utf-8");
      return {
        filename,
        timestampKey: parseTimestampKey(filename),
        result: JSON.parse(raw) as GenerationResult,
      };
    });

    loaded.sort((a, b) => a.timestampKey.localeCompare(b.timestampKey));
    return loaded.map((entry) => entry.result);
  } catch {
    return [];
  }
}
