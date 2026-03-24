import { Router } from "express";
import { filterAircraftFeatures } from "../lib/aircraftInterest.js";

const router = Router();

const typeCache = new Map();
const CACHE_TTL = 3600000; // 1 hour

const MILITARY_KEYWORDS = [
  "air force", "navy", "army", "marines", "military", "defence", "defense",
  "ministry of", "royal air", "luftwaffe", "aeronautica militare",
  "fuerza aerea", "força aérea", "armée de l'air", "coast guard",
  "national guard", "indian air force", "raaf", "raf ", "usaf",
  "israeli air", "plaaf", "jasdf", "rokaf",
];
const GOV_KEYWORDS = [
  "government", "police", "gendarmerie", "border", "customs",
  "fire service", "ambulance", "rescue", "medevac", "nato",
  "federal aviation", "dept of", "department of",
];
const COMMERCIAL_KEYWORDS = [
  "airlines", "airways", "air lines", "aviation", "cargo", "express",
  "transport", "freight", "jet", "flying", "aero", "wing",
];

function classifyAircraft(operator, icaoType, registration) {
  const op = (operator || "").toLowerCase();
  if (!op) return "Unknown";
  for (const kw of MILITARY_KEYWORDS) {
    if (op.includes(kw)) return "Military";
  }
  for (const kw of GOV_KEYWORDS) {
    if (op.includes(kw)) return "Government";
  }
  const isLikelyAirline = COMMERCIAL_KEYWORDS.some((kw) => op.includes(kw));
  if (isLikelyAirline) return "Commercial";
  if (op.includes("llc") || op.includes("inc") || op.includes("ltd") ||
      op.includes("trust") || op.includes("leasing") || op.includes("bank")) {
    return "Private";
  }
  const hasPersonName = op.split(/\s+/).length <= 3 && !op.includes(",");
  if (hasPersonName && !isLikelyAirline) return "Private";
  return "Commercial";
}

router.get("/", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const clauses = [];
    const params = [];
    let i = 1;

    if (req.query.bbox) {
      const [w, s, e, n] = req.query.bbox.split(",").map(Number);
      clauses.push(`ST_Intersects(location, ST_MakeEnvelope($${i}, $${i+1}, $${i+2}, $${i+3}, 4326))`);
      params.push(w, s, e, n);
      i += 4;
    }

    const live = req.query.live !== "false";
    if (live) {
      clauses.push(`recorded_at >= NOW() - INTERVAL '2 minutes'`);
    } else {
      if (req.query.time_start) { clauses.push(`recorded_at >= $${i++}`); params.push(req.query.time_start); }
      if (req.query.time_end)   { clauses.push(`recorded_at <= $${i++}`); params.push(req.query.time_end); }
    }

    const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";

    const sql = `
      SELECT DISTINCT ON (icao24)
             icao24, callsign, origin, destination,
             altitude, velocity, heading, on_ground, recorded_at,
             origin_country, category, vertical_rate, squawk,
             ST_AsGeoJSON(location)::json AS geometry
      FROM aircraft_tracks
      ${where}
      ORDER BY icao24, recorded_at DESC
      LIMIT 5000
    `;
    const { rows } = await pool.query(sql, params);

    let features = rows.map((r) => ({
      type: "Feature",
      geometry: r.geometry,
      properties: {
        icao24: r.icao24,
        callsign: r.callsign,
        origin: r.origin,
        destination: r.destination,
        altitude: r.altitude,
        velocity: r.velocity,
        heading: r.heading,
        on_ground: r.on_ground,
        recorded_at: r.recorded_at,
        origin_country: r.origin_country || "",
        category: r.category || "",
        vertical_rate: r.vertical_rate,
        squawk: r.squawk || "",
      },
    }));

    const q = req.query;
    if (
      q.preset ||
      q.callsign_prefix ||
      q.min_altitude != null ||
      q.max_altitude != null ||
      q.min_velocity != null
    ) {
      features = filterAircraftFeatures(features, q);
    }

    res.json({ type: "FeatureCollection", features });
  } catch (err) {
    next(err);
  }
});

router.get("/:icao24/type", async (req, res, next) => {
  try {
    const icao24 = req.params.icao24.toLowerCase();
    const cached = typeCache.get(icao24);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return res.json(cached.data);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch(`https://hexdb.io/api/v1/aircraft/${icao24}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return res.json({ icao24, error: "not_found" });
    }
    const data = await resp.json();
    const operator = data.RegisteredOwners || "";
    const result = {
      icao24,
      registration: data.Registration || "",
      manufacturer: data.Manufacturer || "",
      type: data.Type || "",
      icao_type: data.ICAOTypeCode || "",
      operator,
      usage: classifyAircraft(operator, data.ICAOTypeCode || "", data.Registration || ""),
    };
    typeCache.set(icao24, { data: result, ts: Date.now() });
    res.json(result);
  } catch (err) {
    res.json({ icao24: req.params.icao24, error: "lookup_failed" });
  }
});

router.get("/:icao24/history", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const timeStart = req.query.time_start || new Date(Date.now() - 86400000).toISOString();
    const timeEnd = req.query.time_end || new Date().toISOString();

    const { rows } = await pool.query(
      `SELECT icao24, callsign, altitude, velocity, heading, recorded_at,
              ST_AsGeoJSON(location)::json AS geometry
       FROM aircraft_tracks
       WHERE icao24 = $1 AND recorded_at BETWEEN $2 AND $3
       ORDER BY recorded_at`,
      [req.params.icao24, timeStart, timeEnd]
    );

    res.json({
      icao24: req.params.icao24,
      points: rows.map((r) => ({
        geometry: r.geometry,
        altitude: r.altitude,
        velocity: r.velocity,
        heading: r.heading,
        recorded_at: r.recorded_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
