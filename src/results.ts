// src/results.ts
import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { GenerationResult } from "./types.js";

const RESULTS_DIR = join(process.cwd(), "results");

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
    const files = readdirSync(RESULTS_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort();
    return files.map((f) => {
      const raw = readFileSync(join(RESULTS_DIR, f), "utf-8");
      return JSON.parse(raw) as GenerationResult;
    });
  } catch {
    return [];
  }
}
