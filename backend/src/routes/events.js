import { Router } from "express";
import { buildSpatialFilter } from "../services/db.js";

const router = Router();

const newsCache = new Map();
const NEWS_CACHE_TTL = 600000; // 10 minutes
let lastGdeltDocCall = 0;
const GDELT_DOC_MIN_INTERVAL = 5000; // 5 seconds between GDELT Doc API calls

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

router.get("/:id/news", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const { rows } = await pool.query(
      `SELECT title, event_type, metadata, ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat
       FROM events WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Event not found" });

    const ev = rows[0];
    const meta = ev.metadata || {};
    const cacheKey = `${req.params.id}`;
    const cached = newsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < NEWS_CACHE_TTL) {
      return res.json(cached.data);
    }

    const now = Date.now();
    const wait = GDELT_DOC_MIN_INTERVAL - (now - lastGdeltDocCall);
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    lastGdeltDocCall = Date.now();

    const termParts = [];
    if (meta.location_name) termParts.push(meta.location_name.split(",")[0].trim());
    if (meta.actor1 && meta.actor1.length > 3) termParts.push(meta.actor1);
    if (meta.actor2 && meta.actor2.length > 3 && meta.actor2 !== meta.actor1) termParts.push(meta.actor2);
    const typeMap = { conflict: "(conflict OR military OR attack)", protest: "(protest OR demonstration)", disaster: "(disaster OR emergency)" };
    termParts.push(typeMap[ev.event_type] || ev.event_type || "conflict");
    const keywords = termParts.join(" ").slice(0, 250);

    const nearFilter = "";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
    url.searchParams.set("query", keywords + nearFilter);
    url.searchParams.set("mode", "artlist");
    url.searchParams.set("maxrecords", "5");
    url.searchParams.set("format", "json");
    url.searchParams.set("timespan", "7d");
    url.searchParams.set("sourcelang", "english");
    url.searchParams.set("sort", "hybridrel");

    let articles = [];
    try {
      const resp = await fetch(url.toString(), { signal: controller.signal });
      clearTimeout(timeout);
      if (resp.ok) {
        const data = await resp.json();
        articles = (data.articles || []).slice(0, 3).map((a) => ({
          title: a.title || "",
          url: a.url || "",
          domain: a.domain || "",
          image: a.socialimage || "",
          seendate: a.seendate || "",
          language: a.language || "",
        }));
      }
    } catch {
      clearTimeout(timeout);
    }

    const result = { event_id: req.params.id, articles };
    newsCache.set(cacheKey, { data: result, ts: Date.now() });
    res.json(result);
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
