import { describe, it } from "node:test";
import assert from "node:assert";
import {
  isRetryableFailure,
  isTransientExecError,
  parseSurfOutput,
} from "./surf-runner.js";

describe("parseSurfOutput", () => {
  it("extracts data from envelope JSON", () => {
    const out = parseSurfOutput(
      "market-price",
      JSON.stringify({
        data: [{ symbol: "BTC", value: 100 }],
        meta: { credits_used: 1 },
      })
    );
    assert.deepStrictEqual(out, [{ symbol: "BTC", value: 100 }]);
  });

  it("handles direct JSON arrays", () => {
    const out = parseSurfOutput(
      "search-prediction-market",
      JSON.stringify([{ condition_id: "x" }])
    );
    assert.deepStrictEqual(out, [{ condition_id: "x" }]);
  });

  it("recovers JSON when prefixed logs are present", () => {
    const out = parseSurfOutput(
      "search-prediction-market",
      'source: SURF_API_KEY (env)\n{"data":[{"condition_id":"x"}]}'
    );
    assert.deepStrictEqual(out, [{ condition_id: "x" }]);
  });

  it("surfaces insufficient credit as actionable error", () => {
    assert.throws(
      () =>
        parseSurfOutput(
          "market-price",
          JSON.stringify({
            error: { code: "INSUFFICIENT_CREDIT", message: "out of credits" },
          })
        ),
      /credits exhausted/
    );
  });

  it("throws useful message on non-JSON output", () => {
    assert.throws(
      () => parseSurfOutput("market-price", "{ status: broken }"),
      /invalid JSON output|non-JSON output/
    );
  });
});

describe("retry classification", () => {
  it("classifies Node-enforced timeout kills as transient via structured properties", () => {
    // execFile timeout rejections carry killed/signal but a generic message
    // that no text pattern matches — the primary retry case.
    const err = Object.assign(new Error("Command failed: surf market-price"), {
      killed: true,
      signal: "SIGTERM",
    });
    assert.strictEqual(isTransientExecError(err), true);
    assert.strictEqual(isRetryableFailure(err.message), false);
  });

  it("classifies connection errors as transient", () => {
    const err = Object.assign(new Error("connect ECONNRESET"), { code: "ECONNRESET" });
    assert.strictEqual(isTransientExecError(err), true);
  });

  it("treats output-corruption messages as retryable", () => {
    assert.ok(isRetryableFailure("surf x returned truncated or invalid JSON output: ..."));
    assert.ok(isRetryableFailure("surf x returned invalid JSON output: ..."));
    assert.ok(isRetryableFailure("surf x returned non-JSON output: log noise"));
    assert.ok(isRetryableFailure("surf x returned empty output"));
  });

  it("treats rate-limit and server errors as retryable", () => {
    assert.ok(isRetryableFailure("Surf API error: 429 Too Many Requests"));
    assert.ok(isRetryableFailure("Surf API error: 503 upstream unavailable"));
  });

  it("does not retry ordinary failures", () => {
    assert.strictEqual(isTransientExecError(new Error("boom")), false);
    assert.strictEqual(isRetryableFailure("Surf API error: invalid symbol"), false);
  });
});
