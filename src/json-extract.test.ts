import { describe, it } from "node:test";
import assert from "node:assert";
import { extractLastJSONObject } from "./json-extract.js";

describe("extractLastJSONObject", () => {
  it("extracts the last balanced JSON object after prose", () => {
    const text = `Preface text before JSON.
{
  "side": "YES",
  "claims": [
    {
      "claim": "sample claim",
      "source": "surf command",
      "data": { "nested": true },
      "reasoning": "sample reasoning"
    }
  ],
  "summary": "sample summary"
}`;

    const extracted = extractLastJSONObject(text);
    assert.ok(extracted, "expected JSON object to be extracted");

    const parsed = JSON.parse(extracted);
    assert.strictEqual(parsed.side, "YES");
    assert.strictEqual(parsed.claims.length, 1);
  });

  it("returns null when no JSON object exists", () => {
    assert.strictEqual(extractLastJSONObject("plain text only"), null);
  });
});
