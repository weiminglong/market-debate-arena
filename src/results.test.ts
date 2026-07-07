import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveGenerationResult, loadAllResults } from "./results.js";
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
