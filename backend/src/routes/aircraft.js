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
             ST_AsGeoJSON(location)::json AS geometry
      FROM aircraft_tracks
      ${where}
      ORDER BY icao24, recorded_at DESC
      LIMIT 5000
    `;
    const { rows } = await pool.query(sql, params);

    res.json({
      type: "FeatureCollection",
      features: rows.map((r) => ({
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
        },
      })),
    });
  } catch (err) {
    next(err);
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
