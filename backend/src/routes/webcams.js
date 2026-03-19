import { Router } from "express";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const clauses = ["active = TRUE"];
    const params = [];
    let i = 1;

    if (req.query.bbox) {
      const [w, s, e, n] = req.query.bbox.split(",").map(Number);
      clauses.push(`ST_Intersects(location, ST_MakeEnvelope($${i}, $${i+1}, $${i+2}, $${i+3}, 4326))`);
      params.push(w, s, e, n);
      i += 4;
    }

    if (req.query.source) {
      clauses.push(`source = $${i++}`);
      params.push(req.query.source);
    }

    const where = "WHERE " + clauses.join(" AND ");
    const sql = `
      SELECT id, name, stream_url, thumbnail_url, camera_type, source, country,
             ST_AsGeoJSON(location)::json AS geometry
      FROM webcams
      ${where}
      ORDER BY name
      LIMIT 2000
    `;
    const { rows } = await pool.query(sql, params);

    res.json({
      type: "FeatureCollection",
      features: rows.map((r) => ({
        type: "Feature",
        geometry: r.geometry,
        properties: {
          id: r.id,
          name: r.name,
          stream_url: r.stream_url,
          thumbnail_url: r.thumbnail_url,
          camera_type: r.camera_type,
          source: r.source,
          country: r.country,
        },
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/stream", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const { rows } = await pool.query(
      `SELECT stream_url, name FROM webcams WHERE id = $1 AND active = TRUE`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Webcam not found" });
    res.json({ name: rows[0].name, stream_url: rows[0].stream_url });
  } catch (err) {
    next(err);
  }
});

export default router;
