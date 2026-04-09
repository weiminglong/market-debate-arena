import { describe, it } from "node:test";
import assert from "node:assert";
import { parseAgentRuntime } from "./agent-runner.js";

describe("parseAgentRuntime", () => {
  it("defaults to claude when runtime is undefined", () => {
    assert.strictEqual(parseAgentRuntime(undefined), "claude");
  });

  it("accepts cursor runtime case-insensitively", () => {
    assert.strictEqual(parseAgentRuntime("CuRsOr"), "cursor");
  });

  it("throws on unsupported runtime values", () => {
    assert.throws(
      () => parseAgentRuntime("openai"),
      /Unsupported agent runtime/
    );
  });
});
