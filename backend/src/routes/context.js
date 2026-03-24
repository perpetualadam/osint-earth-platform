import { Router } from "express";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTEXT_DIR = path.join(__dirname, "../../data/context");
const MANIFEST_PATH = path.join(CONTEXT_DIR, "manifest.json");

/** In-memory cache for fetched admin0 (Natural Earth fallback). */
let admin0Cache = { data: null, ts: 0 };
const ADMIN0_CACHE_MS = 6 * 60 * 60 * 1000;

function bboxIntersects(w, s, e, n, lng, lat) {
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function coordsInBbox(coords, w, s, e, n, depth) {
  if (!coords) return false;
  if (typeof coords[0] === "number") {
    return bboxIntersects(w, s, e, n, coords[0], coords[1]);
  }
  for (const c of coords) {
    if (coordsInBbox(c, w, s, e, n, depth + 1)) return true;
  }
  return false;
}

function polygonIntersectsBbox(geom, w, s, e, n) {
  if (!geom || !geom.coordinates) return false;
  const rings = geom.type === "Polygon" ? geom.coordinates : geom.type === "MultiPolygon" ? geom.coordinates.flat() : [];
  for (const ring of rings) {
    for (const pt of ring) {
      if (bboxIntersects(w, s, e, n, pt[0], pt[1])) return true;
    }
    if (ring.length > 2) {
      const midLng = (w + e) / 2;
      const midLat = (s + n) / 2;
      if (pointInRing(midLng, midLat, ring)) return true;
    }
  }
  return false;
}

function filterFeatureCollection(fc, bboxStr) {
  if (!bboxStr) return fc;
  const parts = bboxStr.split(",").map(Number);
  if (parts.length !== 4 || parts.some((x) => Number.isNaN(x))) return fc;
  const [w, s, e, n] = parts;
  if (w >= e || s >= n) return fc;
  const features = (fc.features || []).filter((f) => {
    const g = f.geometry;
    if (!g) return false;
    if (g.type === "Point") return bboxIntersects(w, s, e, n, g.coordinates[0], g.coordinates[1]);
    if (g.type === "Polygon" || g.type === "MultiPolygon") return polygonIntersectsBbox(g, w, s, e, n);
    if (g.type === "LineString") return g.coordinates.some((pt) => bboxIntersects(w, s, e, n, pt[0], pt[1]));
    if (g.type === "MultiLineString") return g.coordinates.some((line) => line.some((pt) => bboxIntersects(w, s, e, n, pt[0], pt[1])));
    return coordsInBbox(g.coordinates, w, s, e, n, 0);
  });
  return { ...fc, features };
}

const router = Router();

router.get("/manifest", async (_req, res, next) => {
  try {
    const raw = await readFile(MANIFEST_PATH, "utf8");
    res.json(JSON.parse(raw));
  } catch (err) {
    next(err);
  }
});

router.get("/layers/:layerId/geojson", async (req, res, next) => {
  try {
    const raw = await readFile(MANIFEST_PATH, "utf8");
    const manifest = JSON.parse(raw);
    const entry = manifest.find((m) => m.id === req.params.layerId);
    if (!entry) {
      return res.status(404).json({ error: "Unknown context layer" });
    }

    let fc;

    if (entry.id === "admin0") {
      const localPath = path.join(CONTEXT_DIR, entry.localFile);
      try {
        fc = JSON.parse(await readFile(localPath, "utf8"));
      } catch {
        const url = entry.fallbackUrl;
        if (!url) return res.status(404).json({ error: "admin0 file missing and no fallbackUrl" });
        const now = Date.now();
        if (admin0Cache.data && now - admin0Cache.ts < ADMIN0_CACHE_MS) {
          fc = admin0Cache.data;
        } else {
          const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
          if (!r.ok) return res.status(502).json({ error: "Failed to fetch Natural Earth fallback", status: r.status });
          fc = await r.json();
          admin0Cache = { data: fc, ts: now };
        }
      }
    } else {
      const localPath = path.join(CONTEXT_DIR, entry.localFile);
      try {
        fc = JSON.parse(await readFile(localPath, "utf8"));
      } catch {
        return res.status(404).json({ error: "GeoJSON file not found", file: entry.localFile });
      }
    }

    const filtered = filterFeatureCollection(fc, req.query.bbox);
    res.json({
      ...filtered,
      _meta: {
        layerId: entry.id,
        license: entry.license,
        featureCount: (filtered.features || []).length,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
