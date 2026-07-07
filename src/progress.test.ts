import { describe, it } from "node:test";
import assert from "node:assert";
import { formatDuration } from "./progress.js";

describe("formatDuration", () => {
  it("renders '-' for missing or non-finite values", () => {
    assert.strictEqual(formatDuration(undefined), "-");
    assert.strictEqual(formatDuration(NaN), "-");
  });

  it("renders short durations in seconds", () => {
    assert.strictEqual(formatDuration(500), "1s");
    assert.strictEqual(formatDuration(89_000), "89s");
  });

  it("renders longer durations as minutes and seconds", () => {
    assert.strictEqual(formatDuration(90_000), "1m30s");
    assert.strictEqual(formatDuration(231_000), "3m51s");
  });
});
