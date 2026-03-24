/**
 * Input validation helpers for API routes.
 */

export function validateBbox(bboxStr) {
  if (!bboxStr || typeof bboxStr !== "string") return null;
  const parts = bboxStr.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  const [west, south, east, north] = parts;
  if (west < -180 || west > 180 || east < -180 || east > 180) return null;
  if (south < -90 || south > 90 || north < -90 || north > 90) return null;
  if (west >= east || south >= north) return null;
  return parts;
}

export function validateLimit(val, max = 5000) {
  const n = parseInt(String(val || "500"), 10);
  return Number.isNaN(n) || n < 1 ? 500 : Math.min(n, max);
}

export function validateOffset(val) {
  const n = parseInt(String(val || "0"), 10);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}
