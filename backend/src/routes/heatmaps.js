import { Router } from "express";

const router = Router();

const HEATMAP_QUERIES = {
  wildfires: `
    SELECT ST_X(location) AS lng, ST_Y(location) AS lat, severity AS weight
    FROM environmental_events
    WHERE event_type = 'wildfire' AND started_at >= NOW() - INTERVAL '7 days'
  `,
  earthquakes: `
    SELECT ST_X(location) AS lng, ST_Y(location) AS lat, severity AS weight
    FROM environmental_events
    WHERE event_type = 'earthquake' AND started_at >= NOW() - INTERVAL '30 days'
  `,
  shipping: `
    SELECT ST_X(location) AS lng, ST_Y(location) AS lat, 1.0 AS weight
    FROM (
      SELECT DISTINCT ON (mmsi) location
      FROM ship_tracks
      WHERE recorded_at >= NOW() - INTERVAL '1 hour'
      ORDER BY mmsi, recorded_at DESC
    ) sub
  `,
  air_traffic: `
    SELECT ST_X(location) AS lng, ST_Y(location) AS lat, 1.0 AS weight
    FROM (
      SELECT DISTINCT ON (icao24) location
      FROM aircraft_tracks
      WHERE recorded_at >= NOW() - INTERVAL '5 minutes'
      ORDER BY icao24, recorded_at DESC
    ) sub
  `,
  environmental: `
    SELECT ST_X(location) AS lng, ST_Y(location) AS lat, severity AS weight
    FROM environmental_events
    WHERE started_at >= NOW() - INTERVAL '30 days'
  `,
};

router.get("/:type", async (req, res, next) => {
  try {
    const sql = HEATMAP_QUERIES[req.params.type];
    if (!sql) return res.status(400).json({ error: `Unknown heatmap type: ${req.params.type}` });

    const { pool, redis } = req.app.locals;
    const cacheKey = `heatmap:${req.params.type}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const { rows } = await pool.query(sql);
    const result = { type: req.params.type, points: rows };
    await redis.setex(cacheKey, 60, JSON.stringify(result));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
