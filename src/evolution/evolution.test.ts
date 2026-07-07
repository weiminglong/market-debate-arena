import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runEvolution } from "./runner.js";
import { runGeneration } from "../arena.js";
import { loadPlaybook, ensureMockPlaybookIsolation } from "./playbook.js";
import { loadAllResults } from "../results.js";
import { computeShowcaseMetrics } from "../showcase-report.js";
import type { EvolutionHistoryEntry } from "../types.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "evolution-test-"));
  process.env.PLAYBOOK_PATH = join(tempDir, "playbook.json");
  process.env.RESULTS_DIR = join(tempDir, "results");
});

afterEach(() => {
  delete process.env.PLAYBOOK_PATH;
  delete process.env.RESULTS_DIR;
  rmSync(tempDir, { recursive: true, force: true });
});

const MOCK_OPTIONS = {
  marketCount: 1,
  verbose: false,
  mock: true,
  runId: "test-run",
} as const;

// The demo's optimization story lives in RQI (claims/diversity growth), not in
// averageScore — mock scores are intentionally flat, so assertions must target
// the maturity-sensitive metrics or they cannot catch a saturation regression.
function rqiSeries(): number[] {
  return loadAllResults().map((r) => computeShowcaseMetrics(r).researchQualityIndex);
}

describe("mock evolution loop (offline integration)", () => {
  it("runs generations, increments counters, and applies the mutation plan", async () => {
    const history = await runEvolution(3, { ...MOCK_OPTIONS });

    assert.strictEqual(history.length, 3);
    assert.deepStrictEqual(
      history.map((h) => h.generation),
      [1, 2, 3]
    );
    assert.ok(history.every((h: EvolutionHistoryEntry) => Number.isFinite(h.averageScore)));

    const playbook = loadPlaybook();
    assert.strictEqual(playbook.generation, 3);
    assert.ok(playbook.lessons.length > 0, "mutation plan should land lessons");
    assert.ok(
      existsSync(join(tempDir, "playbook-history.jsonl")),
      "playbook history trail should be written"
    );
  });

  it("shows a strictly improving research-quality trend within a run", async () => {
    await runEvolution(3, { ...MOCK_OPTIONS });
    const series = rqiSeries();
    assert.strictEqual(series.length, 3);
    for (let i = 1; i < series.length; i++) {
      assert.ok(
        series[i] > series[i - 1],
        `RQI must strictly rise (gen ${i}: ${series[i - 1]} -> ${series[i]})`
      );
    }
  });

  it("is idempotent when starting from a fresh playbook: two runs show the same rising trend", async () => {
    await runEvolution(3, { ...MOCK_OPTIONS });
    const firstSeries = rqiSeries();

    // Fresh playbook + results, as the CLI provides for every mock run.
    rmSync(join(tempDir, "playbook.json"), { force: true });
    rmSync(join(tempDir, "results"), { recursive: true, force: true });
    await runEvolution(3, { ...MOCK_OPTIONS });
    const secondSeries = rqiSeries();

    assert.deepStrictEqual(
      secondSeries,
      firstSeries,
      "same starting state must reproduce the same RQI trend"
    );
    assert.ok(
      secondSeries[secondSeries.length - 1] > secondSeries[0],
      "the demo trend must remain strictly positive on a repeat run"
    );
  });

  it("stops gracefully with a clear error when a generation fails", async () => {
    await assert.rejects(
      runEvolution(2, { ...MOCK_OPTIONS, markets: [] }),
      /evolution stopped after 0 completed generation\(s\)/
    );
  });
});

describe("mock playbook isolation", () => {
  it("points mock runs at a temp playbook outside the repo", () => {
    delete process.env.PLAYBOOK_PATH;
    ensureMockPlaybookIsolation(true);
    const isolated: string = process.env.PLAYBOOK_PATH ?? "";
    assert.ok(isolated, "should set PLAYBOOK_PATH");
    assert.ok(!isolated.includes("strategies"), "must not touch repo strategy state");
  });

  it("respects a pre-existing PLAYBOOK_PATH", () => {
    process.env.PLAYBOOK_PATH = "/explicit/path.json";
    ensureMockPlaybookIsolation(true);
    assert.strictEqual(process.env.PLAYBOOK_PATH, "/explicit/path.json");
  });

  it("does nothing for live runs", () => {
    delete process.env.PLAYBOOK_PATH;
    ensureMockPlaybookIsolation(false);
    assert.strictEqual(process.env.PLAYBOOK_PATH, undefined);
  });
});

describe("arena guards", () => {
  it("throws a clear error when the market panel is empty", async () => {
    await assert.rejects(
      runGeneration(
        { generation: 0, lessons: [], toolPriority: [], avoidPatterns: [] },
        { ...MOCK_OPTIONS, markets: [] }
      ),
      /No debatable markets/
    );
  });
});
