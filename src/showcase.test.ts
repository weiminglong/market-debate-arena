import { describe, it } from "node:test";
import assert from "node:assert";
import { SHOWCASE_CONDITION_IDS, getShowcaseConditionIds } from "./showcase.js";

describe("showcase markets", () => {
  it("exposes a non-empty curated condition list", () => {
    assert.ok(SHOWCASE_CONDITION_IDS.length > 0);
  });

  it("returns all curated IDs by default", () => {
    assert.deepStrictEqual(
      getShowcaseConditionIds(),
      [...SHOWCASE_CONDITION_IDS]
    );
  });

  it("respects count while staying in valid bounds", () => {
    assert.deepStrictEqual(getShowcaseConditionIds(1), [
      SHOWCASE_CONDITION_IDS[0],
    ]);
    assert.deepStrictEqual(getShowcaseConditionIds(999), [
      ...SHOWCASE_CONDITION_IDS,
    ]);
    assert.deepStrictEqual(getShowcaseConditionIds(0), [
      SHOWCASE_CONDITION_IDS[0],
    ]);
  });
});
