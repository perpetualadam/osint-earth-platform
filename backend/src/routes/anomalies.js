import { Router } from "express";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const clauses = [];
    const params = [];
    let i = 1;

    if (req.query.bbox) {
      const [w, s, e, n] = req.query.bbox.split(",").map(Number);
      clauses.push(`ST_Intersects(location, ST_MakeEnvelope($${i}, $${i + 1}, $${i + 2}, $${i + 3}, 4326))`);
      params.push(w, s, e, n);
      i += 4;
    }

    if (req.query.time_start || req.query.time_end) {
      if (req.query.time_start) {
        clauses.push(`detected_at >= $${i++}`);
        params.push(req.query.time_start);
      }
      if (req.query.time_end) {
        clauses.push(`detected_at <= $${i++}`);
        params.push(req.query.time_end);
      }
    } else {
      const days = Math.min(parseInt(req.query.days || "7", 10), 30);
      clauses.push(`detected_at >= NOW() - INTERVAL '1 day' * $${i++}`);
      params.push(days);
    }

    if (req.query.anomaly_type) {
      clauses.push(`anomaly_type = $${i++}`);
      params.push(req.query.anomaly_type);
    }

    const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
    const limit = Math.min(parseInt(req.query.limit || "500", 10), 2000);
    const sql = `
      SELECT id, anomaly_type, score, baseline_value, observed_value,
             detection_method, detected_at, metadata,
             ST_AsGeoJSON(location)::json AS geometry
      FROM anomalies
      ${where}
      ORDER BY detected_at DESC
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
          anomaly_type: r.anomaly_type,
          score: r.score,
          baseline_value: r.baseline_value,
          observed_value: r.observed_value,
          detection_method: r.detection_method,
          detected_at: r.detected_at,
          metadata: r.metadata || {},
        },
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const { rows } = await pool.query(
      `SELECT id, anomaly_type, score, baseline_value, observed_value,
              detection_method, detected_at, metadata,
              ST_AsGeoJSON(location)::json AS geometry
       FROM anomalies WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Anomaly not found" });
    const r = rows[0];
    res.json({
      id: r.id,
      anomaly_type: r.anomaly_type,
      score: r.score,
      baseline_value: r.baseline_value,
      observed_value: r.observed_value,
      detection_method: r.detection_method,
      detected_at: r.detected_at,
      metadata: r.metadata || {},
      geometry: r.geometry,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
