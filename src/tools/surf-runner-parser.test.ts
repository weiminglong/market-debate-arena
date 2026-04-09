import { describe, it } from "node:test";
import assert from "node:assert";
import { parseSurfOutput } from "./surf-runner.js";

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
