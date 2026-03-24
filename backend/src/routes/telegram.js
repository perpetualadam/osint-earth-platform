import { Router } from "express";

const router = Router();

function buildTelegramWhere(query, startParam = 1) {
  const clauses = [];
  const params = [];
  let i = startParam;

  if (query.bbox) {
    const parts = query.bbox.split(",").map(Number);
    if (parts.length === 4 && !parts.some(Number.isNaN)) {
      const [west, south, east, north] = parts;
      if (west >= -180 && east <= 180 && south >= -90 && north <= 90 && west < east && south < north) {
        clauses.push(
          `ST_Intersects(location, ST_MakeEnvelope($${i}, $${i + 1}, $${i + 2}, $${i + 3}, 4326))`
        );
        params.push(west, south, east, north);
        i += 4;
      }
    }
  }
  if (query.time_start) {
    clauses.push(`posted_at >= $${i}`);
    params.push(query.time_start);
    i++;
  }
  if (query.time_end) {
    clauses.push(`posted_at <= $${i}`);
    params.push(query.time_end);
    i++;
  }
  clauses.push("location IS NOT NULL");

  return {
    where: clauses.length ? "WHERE " + clauses.join(" AND ") : "",
    params,
    nextParam: i,
  };
}

router.get("/geojson", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const { where, params, nextParam } = buildTelegramWhere(req.query);
    const limit = Math.min(parseInt(req.query.limit || "2000", 10), 5000);
    const sql = `
      SELECT id, channel_username, text, text_en, posted_at, geo_confidence, metadata,
             ST_AsGeoJSON(location)::json AS geometry
      FROM telegram_posts
      ${where}
      ORDER BY posted_at DESC
      LIMIT $${nextParam}
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
          channel_username: r.channel_username,
          text: r.text,
          text_en: r.text_en,
          posted_at: r.posted_at,
          geo_confidence: r.geo_confidence,
          metadata: r.metadata,
        },
      })),
    });
  } catch (err) {
    if (err.code === "42P01" || /telegram_posts/.test(err.message || "")) {
      return res.json({ type: "FeatureCollection", features: [] });
    }
    next(err);
  }
});

router.get("/posts/:id", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }
    const { rows } = await pool.query(
      `SELECT id, telegram_message_id, channel_id, channel_username, text, text_en,
              posted_at, lon, lat, geo_confidence, metadata,
              ST_AsGeoJSON(location)::json AS geometry
       FROM telegram_posts WHERE id = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "42P01" || /telegram_posts/.test(err.message || "")) {
      return res.status(404).json({ error: "Not found" });
    }
    next(err);
  }
});

router.get("/posts", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const offset = parseInt(req.query.offset || "0", 10);
    const { rows } = await pool.query(
      `SELECT id, telegram_message_id, channel_id, channel_username, text, text_en,
              posted_at, lon, lat, geo_confidence, metadata
       FROM telegram_posts
       ORDER BY posted_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ posts: rows });
  } catch (err) {
    if (err.code === "42P01") {
      return res.json({ posts: [] });
    }
    next(err);
  }
});

export default router;
