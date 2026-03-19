import { Router } from "express";
import { minioClient, BUCKETS } from "../services/minio.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const clauses = [];
    const params = [];
    let i = 1;

    if (req.query.event_id) {
      clauses.push(`event_id = $${i++}`);
      params.push(req.query.event_id);
    }
    if (req.query.detection_type) {
      clauses.push(`detection_type = $${i++}`);
      params.push(req.query.detection_type);
    }
    if (req.query.time_start) {
      clauses.push(`captured_at >= $${i++}`);
      params.push(req.query.time_start);
    }
    if (req.query.time_end) {
      clauses.push(`captured_at <= $${i++}`);
      params.push(req.query.time_end);
    }
    if (req.query.bbox) {
      const [w, s, e, n] = req.query.bbox.split(",").map(Number);
      clauses.push(`ST_Intersects(location, ST_MakeEnvelope($${i}, $${i+1}, $${i+2}, $${i+3}, 4326))`);
      params.push(w, s, e, n);
      i += 4;
    }

    const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
    const sql = `
      SELECT id, event_id, image_url, thumbnail_url, annotations,
             capture_source, detection_type, confidence, captured_at,
             ST_AsGeoJSON(location)::json AS geometry
      FROM event_snapshots
      ${where}
      ORDER BY captured_at DESC
      LIMIT 200
    `;
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get("/:id/image", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const { rows } = await pool.query(
      `SELECT image_url FROM event_snapshots WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Snapshot not found" });

    const objectName = rows[0].image_url.replace(/^\//, "");
    const stream = await minioClient.getObject(BUCKETS.snapshots, objectName);
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=604800");
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

export default router;
