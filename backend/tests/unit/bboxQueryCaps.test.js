import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bboxAreaSqDeg, maxEventRowsForBbox } from "../../src/lib/bboxQueryCaps.js";

describe("bboxQueryCaps", () => {
  it("bboxAreaSqDeg returns null for invalid input", () => {
    assert.equal(bboxAreaSqDeg(""), null);
    assert.equal(bboxAreaSqDeg("1,2,3"), null);
    assert.equal(bboxAreaSqDeg("10,10,5,20"), null);
  });

  it("bboxAreaSqDeg computes area in square degrees", () => {
    assert.equal(bboxAreaSqDeg("-10,-5,10,5"), 200);
  });

  it("maxEventRowsForBbox scales down for large viewports", () => {
    assert.ok(maxEventRowsForBbox("-180,-90,180,90") <= 650);
    assert.equal(maxEventRowsForBbox(null), 1500);
    assert.ok(maxEventRowsForBbox("-1,-1,1,1") >= 2000);
  });
});
