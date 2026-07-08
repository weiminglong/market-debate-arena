import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCalibration, loadPredictions, type ResolveFn } from "./calibrate.js";
import type { GenerationResult } from "./types.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "calibrate-test-"));
  process.env.RESULTS_DIR = tempDir;
});
afterEach(() => {
  delete process.env.RESULTS_DIR;
  rmSync(tempDir, { recursive: true, force: true });
});

function writePrediction(
  conditionId: string,
  ts: string,
  opts: { mock?: boolean; modelProbability?: number; price?: number } = {}
): void {
  const result: GenerationResult = {
    generation: 1,
    averageScore: 0.6,
    playbook: { generation: 1, lessons: [], toolPriority: [], avoidPatterns: [] },
    metadata: {
      runId: conditionId,
      createdAt: `${ts}Z`,
      runtime: "claude",
      mock: opts.mock ?? false,
      showcase: false,
    },
    debates: [
      {
        market: {
          question: `Q ${conditionId}?`,
          conditionId,
          platform: "polymarket",
          latestPrice: opts.price ?? 0.4,
          category: "Crypto",
          marketLink: "",
        },
        yesArgument: { side: "YES", summary: "y", claims: [] },
        noArgument: { side: "NO", summary: "n", claims: [] },
        consensus: {
          winner: "YES",
          votes: [],
          unanimous: true,
          averageConfidence: 0.7,
          modelProbability: opts.modelProbability ?? 0.6,
        },
        score: 0.6,
        edge: 0.2,
        recommendation: "BUY_YES",
        expectedValue: 0.2,
      },
    ],
  };
  writeFileSync(join(tempDir, `gen-1-${ts}-${conditionId}.json`), JSON.stringify(result));
}

const NOW = "2026-07-08T00:00:00Z";

describe("loadPredictions", () => {
  it("keeps the latest non-mock prediction per market and skips mock", () => {
    writePrediction("0xA", "2026-06-01T00-00-00-000", { modelProbability: 0.5 });
    writePrediction("0xA", "2026-06-02T00-00-00-000", { modelProbability: 0.7 }); // newer
    writePrediction("0xB", "2026-06-01T00-00-00-000", { mock: true });

    const preds = loadPredictions();
    assert.strictEqual(preds.length, 1);
    assert.strictEqual(preds[0].conditionId, "0xA");
    assert.strictEqual(preds[0].modelProbability, 0.7);
  });
});

describe("runCalibration", () => {
  it("does not label lookup failures as pending, and surfaces the error", async () => {
    writePrediction("0xA", "2026-06-01T00-00-00-000");
    writePrediction("0xB", "2026-06-02T00-00-00-000");

    const resolve: ResolveFn = async (cid) =>
      cid === "0xA"
        ? { kind: "resolved", resolution: { outcome: 1, status: "closed", resolvedPrice: 0.999, resolvedAt: NOW } }
        : { kind: "error", message: "surf timed out" };

    const run = await runCalibration({ refresh: true, nowIso: NOW, resolve });
    assert.strictEqual(run.totalPredictions, 2);
    assert.strictEqual(run.resolved.length, 1);
    assert.strictEqual(run.pending.length, 0, "a failed lookup is not pending");
    assert.strictEqual(run.failed, 1);
    assert.strictEqual(run.failureSample, "surf timed out");
  });

  it("caches resolved outcomes and honors --no-refresh from cache", async () => {
    writePrediction("0xA", "2026-06-01T00-00-00-000");
    const resolve: ResolveFn = async () => ({
      kind: "resolved",
      resolution: { outcome: 1, status: "closed", resolvedPrice: 0.999, resolvedAt: NOW },
    });

    await runCalibration({ refresh: true, nowIso: NOW, resolve });
    assert.ok(existsSync(join(tempDir, "resolutions.json")), "cache should be written");

    // Second run, no refresh and a resolver that would throw if called → served from cache.
    const boom: ResolveFn = async () => {
      throw new Error("should not be called");
    };
    const run = await runCalibration({ refresh: false, nowIso: NOW, resolve: boom });
    assert.strictEqual(run.resolved.length, 1);
    assert.strictEqual(run.failed, 0);
  });

  it("treats uncached predictions as pending under --no-refresh (no surf calls)", async () => {
    writePrediction("0xA", "2026-06-01T00-00-00-000");
    const boom: ResolveFn = async () => {
      throw new Error("should not be called");
    };
    const run = await runCalibration({ refresh: false, nowIso: NOW, resolve: boom });
    assert.strictEqual(run.pending.length, 1);
    assert.strictEqual(run.resolved.length, 0);
  });

  it("does not write a cache file when nothing new resolved", async () => {
    writePrediction("0xA", "2026-06-01T00-00-00-000");
    const pendingResolver: ResolveFn = async () => ({ kind: "pending" });
    await runCalibration({ refresh: true, nowIso: NOW, resolve: pendingResolver });
    assert.ok(!existsSync(join(tempDir, "resolutions.json")));
  });
});
