import { Router } from "express";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TERR_DIR = path.join(__dirname, "../../data/territorial");
const MANIFEST_PATH = path.join(TERR_DIR, "manifest.json");

const router = Router();

router.get("/manifest", async (_req, res, next) => {
  try {
    const raw = await readFile(MANIFEST_PATH, "utf8");
    res.json(JSON.parse(raw));
  } catch (err) {
    next(err);
  }
});

/**
 * Returns merged FeatureCollection for all snapshots whose [validFrom, validTo] contain `at`.
 * Query: at=ISO8601 (defaults to now). Optional bbox=west,south,east,north
 */
router.get("/active", async (req, res, next) => {
  try {
    const at = req.query.at ? new Date(req.query.at) : new Date();
    if (Number.isNaN(at.getTime())) {
      return res.status(400).json({ error: "Invalid at= ISO date" });
    }
    const raw = await readFile(MANIFEST_PATH, "utf8");
    const manifest = JSON.parse(raw);
    const allFeatures = [];

    for (const snap of manifest) {
      const from = new Date(snap.validFrom);
      const to = new Date(snap.validTo);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) continue;
      if (at < from || at > to) continue;
      const fp = path.join(TERR_DIR, snap.file);
      try {
        const gj = JSON.parse(await readFile(fp, "utf8"));
        for (const f of gj.features || []) {
          allFeatures.push({
            ...f,
            properties: {
              ...(f.properties || {}),
              _snapshotId: snap.id,
              _snapshotLabel: snap.label,
              _validFrom: snap.validFrom,
              _validTo: snap.validTo,
            },
          });
        }
      } catch {
        /* skip missing file */
      }
    }

    let features = allFeatures;
    const bboxStr = req.query.bbox;
    if (bboxStr) {
      const parts = bboxStr.split(",").map(Number);
      if (parts.length === 4 && !parts.some(Number.isNaN)) {
        const [w, s, e, n] = parts;
        features = allFeatures.filter((f) => {
          const g = f.geometry;
          if (!g || g.type !== "Polygon" || !g.coordinates?.[0]) return false;
          return g.coordinates[0].some((pt) => pt[0] >= w && pt[0] <= e && pt[1] >= s && pt[1] <= n);
        });
      }
    }

    res.json({
      type: "FeatureCollection",
      features,
      _meta: {
        at: at.toISOString(),
        snapshotsMatched: [...new Set(features.map((f) => f.properties?._snapshotId).filter(Boolean))],
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
