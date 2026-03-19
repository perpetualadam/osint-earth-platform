import { Router } from "express";
import { buildSpatialFilter } from "../services/db.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const { where, params, nextParam } = buildSpatialFilter(req.query);
    const limit = Math.min(parseInt(req.query.limit || "500", 10), 5000);
    const offset = parseInt(req.query.offset || "0", 10);

    const sql = `
      SELECT id, event_type, title, description, severity, source, source_id,
             occurred_at, metadata,
             ST_AsGeoJSON(location)::json AS geometry,
             ST_AsGeoJSON(bbox)::json AS bbox_geojson
      FROM events
      ${where}
      ORDER BY occurred_at DESC
      LIMIT $${nextParam} OFFSET $${nextParam + 1}
    `;
    const { rows } = await pool.query(sql, [...params, limit, offset]);

    const geojson = {
      type: "FeatureCollection",
      features: rows.map((r) => ({
        type: "Feature",
        id: r.id,
        geometry: r.geometry,
        properties: {
          id: r.id,
          event_type: r.event_type,
          title: r.title,
          description: r.description,
          severity: r.severity,
          source: r.source,
          source_id: r.source_id,
          occurred_at: r.occurred_at,
          metadata: r.metadata,
        },
      })),
    };
    res.json(geojson);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const { rows } = await pool.query(
      `SELECT *, ST_AsGeoJSON(location)::json AS geometry FROM events WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Event not found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get("/:id/snapshots", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const { rows } = await pool.query(
      `SELECT * FROM event_snapshots WHERE event_id = $1 ORDER BY captured_at`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get("/:id/timeline", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const { rows } = await pool.query(
      `SELECT id, image_url, thumbnail_url, detection_type, confidence, captured_at
       FROM event_snapshots
       WHERE event_id = $1
       ORDER BY captured_at`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
