/**
 * Convert longitude to tile X at a given zoom level.
 */
export function lng2tile(lng, zoom) {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
}

/**
 * Convert latitude to tile Y at a given zoom level.
 */
export function lat2tile(lat, zoom) {
  return Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) +
          1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom)
  );
}

/**
 * Get the bounding box of a tile in degrees.
 */
export function tileBBox(x, y, z) {
  const n = Math.pow(2, z);
  const west = (x / n) * 360 - 180;
  const east = ((x + 1) / n) * 360 - 180;
  const north = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const south = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;
  return { west, south, east, north };
}

/**
 * Count tiles in a bounding box across zoom levels.
 */
export function countTiles(bbox, zoomMin, zoomMax) {
  let count = 0;
  const [w, s, e, n] = bbox;
  for (let z = zoomMin; z <= zoomMax; z++) {
    const xMin = lng2tile(w, z);
    const xMax = lng2tile(e, z);
    const yMin = lat2tile(n, z);
    const yMax = lat2tile(s, z);
    count += (xMax - xMin + 1) * (yMax - yMin + 1);
  }
  return count;
}
