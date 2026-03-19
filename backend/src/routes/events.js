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

const LIBRETRANSLATE_URL = process.env.LIBRETRANSLATE_URL || "https://libretranslate.com";

async function translateToEnglish(text, fromLang) {
  if (!text || text.length < 3) return text;
  const langMap = { spanish: "es", french: "fr", german: "de", arabic: "ar", chinese: "zh", russian: "ru", portuguese: "pt" };
  const from = langMap[fromLang?.toLowerCase()] || "auto";
  if (from === "en") return text;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 5000);
    const resp = await fetch(`${LIBRETRANSLATE_URL}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text.slice(0, 5000), source: from, target: "en", format: "text" }),
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!resp.ok) return text;
    const data = await resp.json();
    return data.translatedText || text;
  } catch {
    return text;
  }
}

router.get("/:id/news", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const langs = (req.query.langs || "english").split(",").map((s) => s.trim()).filter(Boolean);
    const translate = req.query.translate === "true" || req.query.translate === "1";

    const { rows } = await pool.query(
      `SELECT title, event_type, metadata, ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat
       FROM events WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Event not found" });

    const ev = rows[0];
    const meta = ev.metadata || {};
    const cacheKey = `${req.params.id}:${langs.join(",")}:${translate}`;
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let articles = [];
    const gdeltLangs = ["english", "spanish", "french", "german", "arabic", "chinese", "russian", "portuguese"];
    const toFetch = langs.length ? langs.filter((l) => gdeltLangs.includes(l.toLowerCase())) : ["english"];
    if (toFetch.length === 0) toFetch.push("english");

    for (const sourcelang of toFetch.slice(0, 3)) {
      try {
        const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
        url.searchParams.set("query", keywords);
        url.searchParams.set("mode", "artlist");
        url.searchParams.set("maxrecords", "3");
        url.searchParams.set("format", "json");
        url.searchParams.set("timespan", "7d");
        url.searchParams.set("sourcelang", sourcelang);
        url.searchParams.set("sort", "hybridrel");

        const resp = await fetch(url.toString(), { signal: controller.signal });
        if (resp.ok) {
          const data = await resp.json();
          const batch = (data.articles || []).map((a) => ({
            title: a.title || "",
            url: a.url || "",
            domain: a.domain || "",
            image: a.socialimage || "",
            seendate: a.seendate || "",
            language: a.language || sourcelang,
          }));
          articles = articles.concat(batch);
        }
        await new Promise((r) => setTimeout(r, GDELT_DOC_MIN_INTERVAL));
      } catch {
        break;
      }
    }
    clearTimeout(timeout);

    if (translate && articles.length) {
      for (let i = 0; i < Math.min(articles.length, 5); i++) {
        const a = articles[i];
        if (a.title && a.language && a.language.toLowerCase() !== "english") {
          a.titleTranslated = await translateToEnglish(a.title, a.language);
        }
      }
    }

    articles = articles.slice(0, 6);

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
