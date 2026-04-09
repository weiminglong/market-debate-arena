import { describe, it } from "node:test";
import assert from "node:assert";
import { createSequentialRunner } from "./sequential-runner.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("createSequentialRunner", () => {
  it("runs async calls one-at-a-time in submission order", async () => {
    const events: string[] = [];
    const starts: number[] = [];
    const ends: number[] = [];

    const runner = createSequentialRunner(async (label: string, delayMs: number) => {
      starts.push(Date.now());
      events.push(`start:${label}`);
      await sleep(delayMs);
      events.push(`end:${label}`);
      ends.push(Date.now());
      return label;
    });

    const [a, b, c] = await Promise.all([
      runner("a", 80),
      runner("b", 20),
      runner("c", 10),
    ]);

    assert.deepStrictEqual([a, b, c], ["a", "b", "c"]);
    assert.deepStrictEqual(events, [
      "start:a",
      "end:a",
      "start:b",
      "end:b",
      "start:c",
      "end:c",
    ]);

    assert.ok(starts[1] >= ends[0], "second call must start after first ends");
    assert.ok(starts[2] >= ends[1], "third call must start after second ends");
  });
});
