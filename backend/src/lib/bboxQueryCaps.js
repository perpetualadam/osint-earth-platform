/**
 * Scale max row counts for map GeoJSON queries: large viewports (continent/world)
 * return fewer points to bound payload size, DB work, and client entity count.
 */

export function bboxAreaSqDeg(bboxStr) {
  if (!bboxStr || typeof bboxStr !== "string") return null;
  const parts = bboxStr.split(",").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null;
  const [w, s, e, n] = parts;
  if (w < -180 || e > 180 || s < -90 || n > 90 || w >= e || s >= n) return null;
  return Math.max(0, e - w) * Math.max(0, n - s);
}

/** [minAreaSqDeg inclusive, maxRows] — first matching tier wins (list is descending by area). */
const EVENT_MAP_TIERS = [
  [14_000, 650],
  [6_000, 950],
  [2_000, 1_400],
  [400, 2_200],
  [0, 5_000],
];

export function maxEventRowsForBbox(bboxStr) {
  const area = bboxAreaSqDeg(bboxStr);
  if (area == null) return 1_500;
  for (const [minArea, cap] of EVENT_MAP_TIERS) {
    if (area >= minArea) return cap;
  }
  return EVENT_MAP_TIERS[EVENT_MAP_TIERS.length - 1][1];
}
