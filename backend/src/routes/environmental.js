import { Router } from "express";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const clauses = ["location IS NOT NULL"];
    const params = [];
    let i = 1;

    if (req.query.event_type) {
      const types = req.query.event_type.split(",").map((t) => t.trim());
      clauses.push(`event_type = ANY($${i++})`);
      params.push(types);
    }

    if (req.query.bbox) {
      const [w, s, e, n] = req.query.bbox.split(",").map(Number);
      clauses.push(`ST_Intersects(location, ST_MakeEnvelope($${i}, $${i + 1}, $${i + 2}, $${i + 3}, 4326))`);
      params.push(w, s, e, n);
      i += 4;
    }

    if (req.query.time_start || req.query.time_end) {
      if (req.query.time_start) {
        clauses.push(`started_at >= $${i++}`);
        params.push(req.query.time_start);
      }
      if (req.query.time_end) {
        clauses.push(`started_at <= $${i++}`);
        params.push(req.query.time_end);
      }
    } else {
      const days = Math.min(parseInt(req.query.days || "30", 10), 90);
      clauses.push(`started_at >= NOW() - INTERVAL '1 day' * $${i++}`);
      params.push(days);
    }

    const where = "WHERE " + clauses.join(" AND ");
    const limit = Math.min(parseInt(req.query.limit || "2000", 10), 5000);
    const sql = `
      SELECT id, event_type, severity, data_source, started_at, metadata,
             ST_AsGeoJSON(location)::json AS geometry
      FROM environmental_events
      ${where}
      ORDER BY started_at DESC
      LIMIT $${i}
    `;
    const { rows } = await pool.query(sql, [...params, limit]);

    res.json({
      type: "FeatureCollection",
      features: rows.map((r) => ({
        type: "Feature",
        id: r.id,
        geometry: r.geometry,
        properties: {
          id: r.id,
          event_type: r.event_type,
          severity: r.severity,
          data_source: r.data_source,
          started_at: r.started_at,
          metadata: r.metadata || {},
        },
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
