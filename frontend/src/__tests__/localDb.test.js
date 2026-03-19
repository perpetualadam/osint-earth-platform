/**
 * IndexedDB (Dexie) offline cache tests.
 * Run: cd frontend && npx vitest run
 *
 * Uses fake-indexeddb for Node.js environment.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  db,
  cacheEvents,
  getCachedEvents,
  cacheTracks,
  getCachedTracks,
  cacheWebcams,
  getCachedWebcams,
  cacheSnapshots,
  getCachedSnapshots,
  cacheEnvironmental,
  getCachedEnvironmental,
  addPinnedRegion,
  getPinnedRegions,
  deletePinnedRegion,
  addSyncAction,
  getSyncQueue,
  clearSyncQueue,
  getCacheStats,
  clearAllCaches,
} from "../services/localDb";

beforeEach(async () => {
  await clearAllCaches();
  await db.pinned_regions.clear();
});

describe("cacheEvents / getCachedEvents", () => {
  it("stores and retrieves events as GeoJSON", async () => {
    const geojson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: 1,
          geometry: { type: "Point", coordinates: [-73.9, 40.7] },
          properties: { id: 1, event_type: "wildfire", title: "Test Fire" },
        },
        {
          type: "Feature",
          id: 2,
          geometry: { type: "Point", coordinates: [2.3, 48.8] },
          properties: { id: 2, event_type: "earthquake", title: "Test Quake" },
        },
      ],
    };

    await cacheEvents(geojson);
    const result = await getCachedEvents();
    expect(result.type).toBe("FeatureCollection");
    expect(result.features.length).toBe(2);
  });

  it("filters by event_type", async () => {
    await cacheEvents({
      type: "FeatureCollection",
      features: [
        { type: "Feature", id: 10, geometry: { type: "Point", coordinates: [0, 0] }, properties: { id: 10, event_type: "wildfire" } },
        { type: "Feature", id: 11, geometry: { type: "Point", coordinates: [0, 0] }, properties: { id: 11, event_type: "earthquake" } },
      ],
    });

    const result = await getCachedEvents({ event_type: "wildfire" });
    expect(result.features.length).toBe(1);
    expect(result.features[0].properties.event_type).toBe("wildfire");
  });
});

describe("cacheTracks / getCachedTracks", () => {
  it("stores and retrieves aircraft tracks", async () => {
    const geojson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-73.9, 40.7] },
          properties: { icao24: "abc123", callsign: "TST123" },
        },
      ],
    };

    await cacheTracks("aircraft", geojson);
    const result = await getCachedTracks("aircraft");
    expect(result.features.length).toBe(1);
    expect(result.features[0].properties.identifier).toBe("abc123");
  });
});

describe("cacheWebcams / getCachedWebcams", () => {
  it("stores and retrieves webcams", async () => {
    const geojson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [0, 0] },
          properties: { id: 100, name: "Test Cam", source: "windy" },
        },
      ],
    };

    await cacheWebcams(geojson);
    const result = await getCachedWebcams();
    expect(result.features.length).toBe(1);
  });
});

describe("cacheSnapshots / getCachedSnapshots", () => {
  it("stores and retrieves snapshots", async () => {
    await cacheSnapshots([
      { id: 1, event_id: 42, image_url: "/img1.png", captured_at: "2024-01-01" },
      { id: 2, event_id: 42, image_url: "/img2.png", captured_at: "2024-01-02" },
    ]);

    const all = await getCachedSnapshots();
    expect(all.length).toBe(2);

    const filtered = await getCachedSnapshots(42);
    expect(filtered.length).toBe(2);
  });
});

describe("pinned regions", () => {
  it("adds and lists regions", async () => {
    const id = await addPinnedRegion({ name: "Europe", bbox: [-10, 35, 30, 60] });
    expect(id).toBeGreaterThan(0);

    const regions = await getPinnedRegions();
    expect(regions.length).toBe(1);
    expect(regions[0].name).toBe("Europe");
    expect(regions[0].status).toBe("pending");
  });

  it("deletes a region", async () => {
    const id = await addPinnedRegion({ name: "To Delete", bbox: [0, 0, 10, 10] });
    await deletePinnedRegion(id);
    const regions = await getPinnedRegions();
    expect(regions.length).toBe(0);
  });
});

describe("sync queue", () => {
  it("adds and retrieves sync actions", async () => {
    await addSyncAction("bookmark_event", { event_id: 5 });
    const queue = await getSyncQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].action).toBe("bookmark_event");
  });

  it("clears sync queue", async () => {
    await addSyncAction("test", {});
    await clearSyncQueue();
    const queue = await getSyncQueue();
    expect(queue.length).toBe(0);
  });
});

describe("getCacheStats", () => {
  it("returns zero counts on empty DB", async () => {
    const stats = await getCacheStats();
    expect(stats.events).toBe(0);
    expect(stats.tracks).toBe(0);
    expect(stats.webcams).toBe(0);
  });
});
