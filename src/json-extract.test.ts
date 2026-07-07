import { describe, it } from "node:test";
import assert from "node:assert";
import { extractFirstJSONValue, extractLastJSONObject } from "./json-extract.js";

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

  it("survives an unmatched quote in prose before the JSON", () => {
    const text = 'The market said "buy and then... {"winner": "YES", "confidence": 0.8}';
    const extracted = extractLastJSONObject(text);
    assert.ok(extracted);
    assert.strictEqual(JSON.parse(extracted).winner, "YES");
  });

  it("survives a stray unclosed brace in prose before the JSON", () => {
    const text = 'notation like { is fine\n{"side": "NO", "claims": []}';
    const extracted = extractLastJSONObject(text);
    assert.ok(extracted);
    assert.strictEqual(JSON.parse(extracted).side, "NO");
  });

  it("returns the outermost object, not a nested one", () => {
    const text = '{"a": {"b": 1}, "c": 2}';
    assert.strictEqual(extractLastJSONObject(text), text);
  });

  it("prefers the last object when several exist", () => {
    const text = '{"first": 1} some words {"second": 2}';
    assert.strictEqual(extractLastJSONObject(text), '{"second": 2}');
  });

  it("skips a balanced-but-invalid candidate in favor of a valid one", () => {
    const text = '{ status: broken } then {"valid": true}';
    assert.strictEqual(extractLastJSONObject(text), '{"valid": true}');
  });
});

describe("extractFirstJSONValue", () => {
  it("recovers JSON after log-line prefixes", () => {
    const text = 'source: SURF_API_KEY (env)\n{"data":[{"x":1}]}';
    assert.strictEqual(extractFirstJSONValue(text), '{"data":[{"x":1}]}');
  });

  it("handles top-level arrays", () => {
    assert.strictEqual(extractFirstJSONValue('log line\n[1,2,3]'), "[1,2,3]");
  });

  it("returns null for truncated JSON", () => {
    assert.strictEqual(extractFirstJSONValue('{"data": [1, 2'), null);
  });
});
