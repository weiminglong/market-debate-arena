import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  saveGenerationResult,
  loadAllResults,
  summarizeRuns,
  pruneResults,
} from "./results.js";
import type { GenerationResult } from "./types.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "results-test-"));
  process.env.RESULTS_DIR = tempDir;
});

afterEach(() => {
  delete process.env.RESULTS_DIR;
  rmSync(tempDir, { recursive: true, force: true });
});

function makeResult(generation: number): GenerationResult {
  return {
    generation,
    averageScore: 0.6,
    playbook: { generation, lessons: [], toolPriority: [], avoidPatterns: [] },
    metadata: {
      runId: "run-test",
      createdAt: new Date().toISOString(),
      runtime: "claude",
      mock: true,
      showcase: false,
    },
    debates: [
      {
        market: {
          question: "Q?",
          conditionId: "c1",
          platform: "polymarket",
          latestPrice: 0.6,
          category: "Crypto",
          marketLink: "",
        },
        yesArgument: {
          side: "YES",
          summary: "yes",
          claims: [{ claim: "a", source: "s", data: { k: 1 }, reasoning: "r" }],
        },
        noArgument: { side: "NO", summary: "no", claims: [] },
        consensus: {
          winner: "YES",
          votes: [{ winner: "YES", confidence: 0.7, reasoning: "" }],
          unanimous: true,
          averageConfidence: 0.7,
        },
        score: 0.6,
      },
    ],
  };
}

describe("results persistence", () => {
  it("creates the results directory if missing and round-trips", () => {
    process.env.RESULTS_DIR = join(tempDir, "nested", "results");
    const filepath = saveGenerationResult(makeResult(1));
    assert.ok(filepath.includes("gen-1-"));
    const loaded = loadAllResults();
    assert.strictEqual(loaded.length, 1);
    assert.strictEqual(loaded[0].generation, 1);
  });

  it("survives claims with malformed data instead of crashing the save", () => {
    const result = makeResult(1);
    // Simulate an LLM claim that slipped through with data: null.
    (result.debates[0].yesArgument.claims[0] as { data: unknown }).data = null;
    assert.doesNotThrow(() => saveGenerationResult(result));
  });

  it("skips corrupt result files instead of erasing all history", () => {
    saveGenerationResult(makeResult(1));
    writeFileSync(join(tempDir, "gen-2-corrupt.json"), "{broken");
    const loaded = loadAllResults();
    assert.strictEqual(loaded.length, 1);
  });

  it("skips parseable-but-wrong-shape files", () => {
    saveGenerationResult(makeResult(1));
    writeFileSync(join(tempDir, "gen-2-null.json"), "null");
    writeFileSync(join(tempDir, "gen-3-string.json"), '"not a result"');
    writeFileSync(join(tempDir, "gen-4-nodebates.json"), '{"generation": 4}');
    const loaded = loadAllResults();
    assert.strictEqual(loaded.length, 1);
  });

  it("returns empty array when directory is missing", () => {
    process.env.RESULTS_DIR = join(tempDir, "does-not-exist");
    assert.deepStrictEqual(loadAllResults(), []);
  });
});

// Writes with an explicit timestamp so ordering is deterministic (real saves
// in the same millisecond would otherwise tie on the timestamp key).
function writeRunFile(
  generation: number,
  timestamp: string,
  runId: string,
  mock: boolean
): void {
  const result = makeResult(generation);
  result.metadata = {
    runId,
    createdAt: new Date().toISOString(),
    runtime: "claude",
    mock,
    showcase: false,
    totalDurationMs: 1000,
  };
  writeFileSync(
    join(tempDir, `gen-${generation}-${timestamp}-${runId}.json`),
    JSON.stringify(result)
  );
}

describe("run management", () => {
  it("groups results by runId, ordered by last activity", () => {
    writeRunFile(1, "2026-01-01T00-00-01-000Z", "run-a", true);
    writeRunFile(2, "2026-01-01T00-00-02-000Z", "run-a", true);
    writeRunFile(1, "2026-01-01T00-00-03-000Z", "run-b", false);
    // A legacy file without run metadata groups under (untagged).
    const legacy = makeResult(1);
    delete legacy.metadata;
    writeFileSync(join(tempDir, "gen-1-0000-legacy.json"), JSON.stringify(legacy));

    const runs = summarizeRuns();
    assert.deepStrictEqual(
      runs.map((r) => r.runId),
      ["(untagged)", "run-a", "run-b"]
    );
    const runA = runs.find((r) => r.runId === "run-a")!;
    assert.strictEqual(runA.generations, 2);
    assert.strictEqual(runA.files.length, 2);
    assert.strictEqual(runA.totalDurationMs, 2000);
  });

  it("prunes only the oldest runs and keeps the rest intact", () => {
    writeRunFile(1, "2026-01-01T00-00-01-000Z", "run-old", true);
    writeRunFile(1, "2026-01-02T00-00-01-000Z", "run-mid", true);
    writeRunFile(1, "2026-01-03T00-00-01-000Z", "run-new", true);

    const deleted = pruneResults(2);
    assert.strictEqual(deleted.length, 1);
    assert.ok(deleted[0].includes("run-old"));
    for (const filename of deleted) {
      assert.ok(!existsSync(join(tempDir, filename)));
    }

    const remaining = summarizeRuns().map((r) => r.runId);
    assert.deepStrictEqual(remaining, ["run-mid", "run-new"]);
  });

  it("prune is a no-op when there are fewer runs than keep", () => {
    writeRunFile(1, "2026-01-01T00-00-01-000Z", "run-a", true);
    assert.deepStrictEqual(pruneResults(5), []);
    assert.strictEqual(loadAllResults().length, 1);
  });
});
