import { Router } from "express";
import archiver from "archiver";

const router = Router();

/**
 * POST /api/offline/package
 * Returns a manifest of all URLs that must be cached for offline access
 * to a given region + time range.
 */
router.post("/package", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const { bbox, time_start, time_end, zoom_min = 1, zoom_max = 14 } = req.body;

    if (!bbox) return res.status(400).json({ error: "bbox is required" });

    const [w, s, e, n] = bbox;
    const envelope = `ST_MakeEnvelope(${w}, ${s}, ${e}, ${n}, 4326)`;

    const tileUrls = [];
    for (let z = zoom_min; z <= zoom_max; z++) {
      const xMin = lng2tile(w, z);
      const xMax = lng2tile(e, z);
      const yMin = lat2tile(n, z);
      const yMax = lat2tile(s, z);
      for (let x = xMin; x <= xMax; x++) {
        for (let y = yMin; y <= yMax; y++) {
          tileUrls.push(`/api/tiles/satellite/${z}/${x}/${y}`);
        }
      }
    }

    const timeClauses = [];
    const params = [];
    let i = 1;
    if (time_start) { timeClauses.push(`occurred_at >= $${i++}`); params.push(time_start); }
    if (time_end)   { timeClauses.push(`occurred_at <= $${i++}`); params.push(time_end); }

    const timeWhere = timeClauses.length ? " AND " + timeClauses.join(" AND ") : "";

    const { rows: events } = await pool.query(
      `SELECT id FROM events WHERE ST_Intersects(location, ${envelope})${timeWhere}`,
      params
    );

    const eventUrls = events.flatMap((e) => [
      `/api/events/${e.id}`,
      `/api/events/${e.id}/snapshots`,
    ]);

    const manifest = {
      bbox,
      time_start,
      time_end,
      tile_count: tileUrls.length,
      event_count: events.length,
      urls: [
        ...tileUrls,
        ...eventUrls,
        `/api/webcams?bbox=${bbox.join(",")}`,
        `/api/heatmaps/wildfires`,
        `/api/heatmaps/earthquakes`,
      ],
    };

    await pool.query(
      `INSERT INTO offline_regions (bbox, zoom_min, zoom_max, time_start, time_end, tile_count, status)
       VALUES (ST_MakeEnvelope($1,$2,$3,$4,4326), $5, $6, $7, $8, $9, 'pending')`,
      [w, s, e, n, zoom_min, zoom_max, time_start || null, time_end || null, tileUrls.length]
    );

    res.json(manifest);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/offline/export – streams a ZIP archive of region data
 */
router.get("/export", async (req, res, next) => {
  try {
    const { pool } = req.app.locals;
    const { bbox, time_start, time_end } = req.query;
    if (!bbox) return res.status(400).json({ error: "bbox is required" });

    const [w, s, e, n] = bbox.split(",").map(Number);
    const envelope = `ST_MakeEnvelope(${w}, ${s}, ${e}, ${n}, 4326)`;

    const [eventsRes, envRes, webcamsRes] = await Promise.all([
      pool.query(
        `SELECT id, event_type, title, description, severity, source, occurred_at, metadata,
                ST_AsGeoJSON(location)::json AS geometry
         FROM events WHERE ST_Intersects(location, ${envelope})
         ${time_start ? `AND occurred_at >= '${time_start}'` : ""}
         ${time_end ? `AND occurred_at <= '${time_end}'` : ""}
         LIMIT 10000`
      ),
      pool.query(
        `SELECT * FROM environmental_events WHERE ST_Intersects(location, ${envelope})
         ${time_start ? `AND started_at >= '${time_start}'` : ""}
         LIMIT 10000`
      ),
      pool.query(
        `SELECT id, name, stream_url, thumbnail_url, camera_type, source, country,
                ST_AsGeoJSON(location)::json AS geometry
         FROM webcams WHERE ST_Intersects(location, ${envelope}) AND active = TRUE`
      ),
    ]);

    res.set("Content-Type", "application/zip");
    res.set("Content-Disposition", `attachment; filename="osint-export-${Date.now()}.zip"`);

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.pipe(res);
    archive.append(JSON.stringify(eventsRes.rows, null, 2), { name: "events.json" });
    archive.append(JSON.stringify(envRes.rows, null, 2), { name: "environmental.json" });
    archive.append(JSON.stringify(webcamsRes.rows, null, 2), { name: "webcams.json" });
    archive.append(JSON.stringify({ bbox, time_start, time_end, exported_at: new Date().toISOString() }), { name: "manifest.json" });
    await archive.finalize();
  } catch (err) {
    next(err);
  }
});

function lng2tile(lng, zoom) {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
}

function lat2tile(lat, zoom) {
  return Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
}

export default router;
