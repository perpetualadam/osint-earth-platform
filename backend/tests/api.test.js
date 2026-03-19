/**
 * Backend API integration tests.
 * Run: cd backend && npm test
 *
 * Requires: PostgreSQL+PostGIS running with schema loaded, Redis, MinIO.
 * Uses the same env vars as the application (.env).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.API_URL || "http://localhost:3001";

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, data: await res.json() };
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
describe("Health", () => {
  it("GET /api/health returns ok", async () => {
    const { status, data } = await get("/api/health");
    assert.equal(status, 200);
    assert.equal(data.status, "ok");
    assert.equal(data.db, "connected");
  });
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
describe("Events API", () => {
  it("GET /api/events returns GeoJSON FeatureCollection", async () => {
    const { status, data } = await get("/api/events?limit=10");
    assert.equal(status, 200);
    assert.equal(data.type, "FeatureCollection");
    assert(Array.isArray(data.features));
  });

  it("GET /api/events supports bbox filter", async () => {
    const { status, data } = await get("/api/events?bbox=-180,-90,180,90&limit=5");
    assert.equal(status, 200);
    assert.equal(data.type, "FeatureCollection");
  });

  it("GET /api/events supports time range filter", async () => {
    const { status, data } = await get(
      "/api/events?time_start=2020-01-01&time_end=2030-01-01&limit=5"
    );
    assert.equal(status, 200);
    assert.equal(data.type, "FeatureCollection");
  });

  it("GET /api/events supports event_type filter", async () => {
    const { status, data } = await get("/api/events?event_type=wildfire&limit=5");
    assert.equal(status, 200);
    data.features.forEach((f) => {
      assert.equal(f.properties.event_type, "wildfire");
    });
  });

  it("GET /api/events/:id returns 404 for missing event", async () => {
    const { status } = await get("/api/events/999999999");
    assert.equal(status, 404);
  });

  it("GET /api/events/:id/snapshots returns array", async () => {
    const { status, data } = await get("/api/events/1/snapshots");
    // May be 200 with empty array or 404 — both acceptable
    assert([200, 404].includes(status));
    if (status === 200) assert(Array.isArray(data));
  });
});

// ---------------------------------------------------------------------------
// Aircraft
// ---------------------------------------------------------------------------
describe("Aircraft API", () => {
  it("GET /api/aircraft returns GeoJSON", async () => {
    const { status, data } = await get("/api/aircraft?bbox=-180,-90,180,90");
    assert.equal(status, 200);
    assert.equal(data.type, "FeatureCollection");
  });

  it("GET /api/aircraft/:icao24/history returns track", async () => {
    const { status, data } = await get("/api/aircraft/abc123/history");
    assert.equal(status, 200);
    assert.equal(data.icao24, "abc123");
    assert(Array.isArray(data.points));
  });
});

// ---------------------------------------------------------------------------
// Ships
// ---------------------------------------------------------------------------
describe("Ships API", () => {
  it("GET /api/ships returns GeoJSON", async () => {
    const { status, data } = await get("/api/ships?bbox=-180,-90,180,90");
    assert.equal(status, 200);
    assert.equal(data.type, "FeatureCollection");
  });

  it("GET /api/ships/:mmsi/history returns track", async () => {
    const { status, data } = await get("/api/ships/123456789/history");
    assert.equal(status, 200);
    assert.equal(data.mmsi, "123456789");
    assert(Array.isArray(data.points));
  });
});

// ---------------------------------------------------------------------------
// Webcams
// ---------------------------------------------------------------------------
describe("Webcams API", () => {
  it("GET /api/webcams returns GeoJSON", async () => {
    const { status, data } = await get("/api/webcams");
    assert.equal(status, 200);
    assert.equal(data.type, "FeatureCollection");
  });

  it("GET /api/webcams/:id/stream returns 404 for missing", async () => {
    const { status } = await get("/api/webcams/999999/stream");
    assert.equal(status, 404);
  });
});

// ---------------------------------------------------------------------------
// Heatmaps
// ---------------------------------------------------------------------------
describe("Heatmaps API", () => {
  for (const type of ["wildfires", "earthquakes", "shipping", "air_traffic", "environmental"]) {
    it(`GET /api/heatmaps/${type} returns points`, async () => {
      const { status, data } = await get(`/api/heatmaps/${type}`);
      assert.equal(status, 200);
      assert.equal(data.type, type);
      assert(Array.isArray(data.points));
    });
  }

  it("GET /api/heatmaps/invalid returns 400", async () => {
    const { status } = await get("/api/heatmaps/invalid");
    assert.equal(status, 400);
  });
});

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------
describe("Replay API", () => {
  it("GET /api/replay/frames requires params", async () => {
    const { status } = await get("/api/replay/frames");
    assert.equal(status, 400);
  });

  it("GET /api/replay/frames returns frame descriptors", async () => {
    const { status, data } = await get(
      "/api/replay/frames?bbox=-10,35,30,60&time_start=2024-01-01T00:00:00Z&time_end=2024-01-01T06:00:00Z&step_minutes=60"
    );
    assert.equal(status, 200);
    assert(Array.isArray(data.frames));
    assert.equal(data.frame_count, data.frames.length);
  });
});

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------
describe("Snapshots API", () => {
  it("GET /api/snapshots returns array", async () => {
    const { status, data } = await get("/api/snapshots");
    assert.equal(status, 200);
    assert(Array.isArray(data));
  });
});

// ---------------------------------------------------------------------------
// Offline
// ---------------------------------------------------------------------------
describe("Offline API", () => {
  it("POST /api/offline/package returns manifest", async () => {
    const { status, data } = await post("/api/offline/package", {
      bbox: [-10, 35, 30, 60],
      zoom_min: 1,
      zoom_max: 3,
    });
    assert.equal(status, 200);
    assert(data.tile_count > 0);
    assert(Array.isArray(data.urls));
    assert(data.urls.length > 0);
  });

  it("POST /api/offline/package requires bbox", async () => {
    const { status } = await post("/api/offline/package", {});
    assert.equal(status, 400);
  });

  it("GET /api/offline/export requires bbox", async () => {
    const { status } = await get("/api/offline/export");
    assert.equal(status, 400);
  });

  it("GET /api/offline/export returns ZIP", async () => {
    const res = await fetch(`${BASE}/api/offline/export?bbox=-10,35,30,60`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/zip");
  });
});

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------
describe("Tiles API", () => {
  it("GET /api/tiles/available returns array", async () => {
    const { status, data } = await get("/api/tiles/available");
    assert.equal(status, 200);
    assert(Array.isArray(data));
  });

  it("GET /api/tiles/:sat/:z/:x/:y returns 404 for missing tile", async () => {
    const { status } = await get("/api/tiles/sentinel-2/0/0/0");
    assert.equal(status, 404);
  });
});
