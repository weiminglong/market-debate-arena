import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  outcomeFromMarket,
  loadResolutionCache,
  saveResolutionCache,
  type ResolutionCache,
} from "./resolver.js";

describe("outcomeFromMarket", () => {
  it("resolves YES for a closed market snapped high", () => {
    assert.strictEqual(outcomeFromMarket("closed", 0.999), 1);
  });
  it("resolves NO for a closed market snapped low", () => {
    assert.strictEqual(outcomeFromMarket("closed", 0.001), 0);
  });
  it("accepts finalized status too", () => {
    assert.strictEqual(outcomeFromMarket("finalized", 0.96), 1);
    assert.strictEqual(outcomeFromMarket("finalized", 0.04), 0);
  });
  it("returns null for an active (unsettled) market", () => {
    assert.strictEqual(outcomeFromMarket("active", 0.5), null);
    assert.strictEqual(outcomeFromMarket("active", 0.99), null);
  });
  it("returns null for a closed-but-not-decisive price", () => {
    assert.strictEqual(outcomeFromMarket("closed", 0.5), null);
    assert.strictEqual(outcomeFromMarket("closed", 0.4), null);
  });
  it("returns null for missing/NaN price or status", () => {
    assert.strictEqual(outcomeFromMarket("closed", undefined), null);
    assert.strictEqual(outcomeFromMarket("closed", NaN), null);
    assert.strictEqual(outcomeFromMarket(undefined, 0.99), null);
  });
});

describe("resolution cache", () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "resolver-test-"));
    process.env.RESULTS_DIR = tempDir;
  });
  afterEach(() => {
    delete process.env.RESULTS_DIR;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("round-trips and returns {} when absent", () => {
    assert.deepStrictEqual(loadResolutionCache(), {});
    const cache: ResolutionCache = {
      "0xabc": { outcome: 1, status: "closed", resolvedPrice: 0.999, resolvedAt: "2026-01-01T00:00:00Z" },
    };
    saveResolutionCache(cache);
    assert.deepStrictEqual(loadResolutionCache(), cache);
  });
});
