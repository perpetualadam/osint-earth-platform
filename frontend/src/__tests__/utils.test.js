/**
 * Frontend utility unit tests.
 * Run: cd frontend && npx vitest run
 */
import { describe, it, expect } from "vitest";
import { lng2tile, lat2tile, tileBBox, countTiles } from "../utils/tilemath";
import { thinFeaturesByTimeField } from "../utils/mapThinning";

describe("tilemath", () => {
  describe("lng2tile", () => {
    it("converts 0° longitude at zoom 0 to tile 0", () => {
      expect(lng2tile(0, 0)).toBe(0);
    });

    it("converts -180° to tile 0 at any zoom", () => {
      expect(lng2tile(-180, 5)).toBe(0);
    });

    it("converts 180° to max tile at zoom 2", () => {
      // 180° maps to 2^zoom = 4 (clamped to 3 by floor)
      expect(lng2tile(179.99, 2)).toBe(3);
    });

    it("returns correct tile for known coordinate", () => {
      // London (~-0.12) at zoom 10
      const x = lng2tile(-0.12, 10);
      expect(x).toBe(511);
    });
  });

  describe("lat2tile", () => {
    it("converts equator at zoom 0 to tile 0", () => {
      expect(lat2tile(0, 0)).toBe(0);
    });

    it("returns correct tile for known coordinate", () => {
      // London (~51.5) at zoom 10
      const y = lat2tile(51.5, 10);
      expect(y).toBe(340);
    });
  });

  describe("tileBBox", () => {
    it("returns valid bbox for tile 0,0,0", () => {
      const bbox = tileBBox(0, 0, 0);
      expect(bbox.west).toBeCloseTo(-180);
      expect(bbox.east).toBeCloseTo(180);
      expect(bbox.north).toBeCloseTo(85.05, 0);
      expect(bbox.south).toBeCloseTo(-85.05, 0);
    });

    it("returns bbox within valid range", () => {
      const bbox = tileBBox(1, 1, 2);
      expect(bbox.west).toBeGreaterThanOrEqual(-180);
      expect(bbox.east).toBeLessThanOrEqual(180);
      expect(bbox.north).toBeLessThanOrEqual(90);
      expect(bbox.south).toBeGreaterThanOrEqual(-90);
    });
  });

  describe("countTiles", () => {
    it("counts tiles at zoom 0 for entire world", () => {
      // 180° longitude maps to tile x=1 at zoom 0, producing 2 x-tiles
      expect(countTiles([-180, -85, 180, 85], 0, 0)).toBe(2);
    });

    it("counts tiles at zoom 1 for entire world", () => {
      expect(countTiles([-180, -85, 180, 85], 1, 1)).toBe(6);
    });

    it("scales correctly across zoom levels", () => {
      const count = countTiles([-10, 35, 30, 60], 0, 3);
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(1000); // small region, low zoom
    });

    it("increases with higher zoom max", () => {
      const low = countTiles([-10, 35, 30, 60], 0, 5);
      const high = countTiles([-10, 35, 30, 60], 0, 8);
      expect(high).toBeGreaterThan(low);
    });
  });
});

describe("mapThinning", () => {
  it("returns unchanged when under max", () => {
    const f = [{ properties: { t: "2024-01-01T00:00:00Z" } }];
    expect(thinFeaturesByTimeField(f, 5, "t")).toEqual(f);
  });

  it("keeps most recent N by time field", () => {
    const features = [
      { properties: { occurred_at: "2020-01-01T00:00:00Z" } },
      { properties: { occurred_at: "2024-06-01T00:00:00Z" } },
      { properties: { occurred_at: "2023-01-01T00:00:00Z" } },
    ];
    const out = thinFeaturesByTimeField(features, 2, "occurred_at");
    expect(out).toHaveLength(2);
    expect(out[0].properties.occurred_at).toBe("2024-06-01T00:00:00Z");
    expect(out[1].properties.occurred_at).toBe("2023-01-01T00:00:00Z");
  });
});
