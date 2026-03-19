import { Router } from "express";
import { minioClient, BUCKETS } from "../services/minio.js";

const router = Router();

router.get("/available", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const clauses = [];
    const params = [];
    let i = 1;

    if (req.query.satellite) {
      clauses.push(`satellite = $${i++}`);
      params.push(req.query.satellite);
    }
    if (req.query.time_start) {
      clauses.push(`acquisition_at >= $${i++}`);
      params.push(req.query.time_start);
    }
    if (req.query.time_end) {
      clauses.push(`acquisition_at <= $${i++}`);
      params.push(req.query.time_end);
    }
    if (req.query.bbox) {
      const [w, s, e, n] = req.query.bbox.split(",").map(Number);
      clauses.push(`ST_Intersects(bbox, ST_MakeEnvelope($${i}, $${i+1}, $${i+2}, $${i+3}, 4326))`);
      params.push(w, s, e, n);
      i += 4;
    }

    const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
    const sql = `
      SELECT id, satellite, band, acquisition_at, cloud_cover, tile_url,
             resolution_m, zoom_level, tile_x, tile_y,
             ST_AsGeoJSON(bbox)::json AS bbox_geojson
      FROM satellite_tiles
      ${where}
      ORDER BY acquisition_at DESC
      LIMIT 200
    `;
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get("/:satellite/:z/:x/:y", async (req, res, next) => {
  try {
    const { satellite, z, x, y } = req.params;
    const objectName = `${satellite}/${z}/${x}/${y}.webp`;

    const { redis } = req.app.locals;
    const cached = await redis.getBuffer(`tile:${objectName}`);
    if (cached) {
      res.set("Content-Type", "image/webp");
      res.set("Cache-Control", "public, max-age=86400");
      return res.send(cached);
    }

    try {
      const stream = await minioClient.getObject(BUCKETS.tiles, objectName);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buf = Buffer.concat(chunks);

      await redis.setex(`tile:${objectName}`, 3600, buf);
      res.set("Content-Type", "image/webp");
      res.set("Cache-Control", "public, max-age=86400");
      res.send(buf);
    } catch {
      res.status(404).json({ error: "Tile not found" });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
