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
      clauses.push(`recorded_at >= NOW() - INTERVAL '30 minutes'`);
    } else {
      if (req.query.time_start) { clauses.push(`recorded_at >= $${i++}`); params.push(req.query.time_start); }
      if (req.query.time_end)   { clauses.push(`recorded_at <= $${i++}`); params.push(req.query.time_end); }
    }

    const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";

    const sql = `
      SELECT DISTINCT ON (mmsi)
             mmsi, vessel_name, vessel_type, speed, course, heading,
             nav_status, destination, callsign, imo, recorded_at,
             ST_AsGeoJSON(location)::json AS geometry
      FROM ship_tracks
      ${where}
      ORDER BY mmsi, recorded_at DESC
      LIMIT 5000
    `;
    const { rows } = await pool.query(sql, params);

    res.json({
      type: "FeatureCollection",
      features: rows.map((r) => ({
        type: "Feature",
        geometry: r.geometry,
        properties: {
          mmsi: r.mmsi,
          vessel_name: r.vessel_name,
          vessel_type: r.vessel_type,
          speed: r.speed,
          course: r.course,
          heading: r.heading,
          nav_status: r.nav_status,
          destination: r.destination || "",
          callsign: r.callsign || "",
          imo: r.imo || "",
          recorded_at: r.recorded_at,
        },
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:mmsi/history", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const timeStart = req.query.time_start || new Date(Date.now() - 86400000).toISOString();
    const timeEnd = req.query.time_end || new Date().toISOString();

    const { rows } = await pool.query(
      `SELECT mmsi, vessel_name, speed, course, heading, recorded_at,
              ST_AsGeoJSON(location)::json AS geometry
       FROM ship_tracks
       WHERE mmsi = $1 AND recorded_at BETWEEN $2 AND $3
       ORDER BY recorded_at`,
      [req.params.mmsi, timeStart, timeEnd]
    );

    res.json({
      mmsi: req.params.mmsi,
      points: rows.map((r) => ({
        geometry: r.geometry,
        speed: r.speed,
        course: r.course,
        heading: r.heading,
        recorded_at: r.recorded_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
