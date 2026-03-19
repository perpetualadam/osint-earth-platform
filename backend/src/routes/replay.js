import { Router } from "express";

const router = Router();

/**
 * Returns ordered frame descriptors for the replay engine.
 * Each frame contains satellite tile refs, event markers, aircraft + ship
 * positions for a given timestamp within the requested bbox and range.
 */
router.get("/frames", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const { bbox, time_start, time_end, step_minutes = "60" } = req.query;

    if (!bbox || !time_start || !time_end) {
      return res.status(400).json({ error: "bbox, time_start, and time_end are required" });
    }

    const [w, s, e, n] = bbox.split(",").map(Number);
    const step = parseInt(step_minutes, 10);
    const envelope = `ST_MakeEnvelope(${w}, ${s}, ${e}, ${n}, 4326)`;

    const frames = [];
    let cursor = new Date(time_start);
    const end = new Date(time_end);

    while (cursor <= end) {
      const ts = cursor.toISOString();
      const tsNext = new Date(cursor.getTime() + step * 60000).toISOString();

      const [eventsRes, aircraftRes, shipsRes, envRes] = await Promise.all([
        pool.query(
          `SELECT id, event_type, title, severity, occurred_at,
                  ST_AsGeoJSON(location)::json AS geometry
           FROM events
           WHERE ST_Intersects(location, ${envelope})
             AND occurred_at BETWEEN $1 AND $2
           ORDER BY occurred_at LIMIT 200`,
          [ts, tsNext]
        ),
        pool.query(
          `SELECT DISTINCT ON (icao24) icao24, callsign, altitude, velocity, heading, recorded_at,
                  ST_AsGeoJSON(location)::json AS geometry
           FROM aircraft_tracks
           WHERE ST_Intersects(location, ${envelope})
             AND recorded_at BETWEEN $1 AND $2
           ORDER BY icao24, recorded_at DESC LIMIT 2000`,
          [ts, tsNext]
        ),
        pool.query(
          `SELECT DISTINCT ON (mmsi) mmsi, vessel_name, speed, course, heading, recorded_at,
                  ST_AsGeoJSON(location)::json AS geometry
           FROM ship_tracks
           WHERE ST_Intersects(location, ${envelope})
             AND recorded_at BETWEEN $1 AND $2
           ORDER BY mmsi, recorded_at DESC LIMIT 2000`,
          [ts, tsNext]
        ),
        pool.query(
          `SELECT id, event_type, severity, started_at,
                  ST_AsGeoJSON(location)::json AS geometry
           FROM environmental_events
           WHERE ST_Intersects(location, ${envelope})
             AND started_at <= $2 AND (ended_at IS NULL OR ended_at >= $1)
           LIMIT 200`,
          [ts, tsNext]
        ),
      ]);

      frames.push({
        timestamp: ts,
        events: eventsRes.rows,
        aircraft: aircraftRes.rows,
        ships: shipsRes.rows,
        environmental: envRes.rows,
      });

      cursor = new Date(cursor.getTime() + step * 60000);
    }

    res.json({ bbox, time_start, time_end, step_minutes: step, frame_count: frames.length, frames });
  } catch (err) {
    next(err);
  }
});

export default router;
