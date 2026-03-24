import Dexie from "dexie";

/**
 * Offline IndexedDB. If the console shows Dexie’s “Workaround for Chrome UnknownError on open()” once,
 * that is Dexie retrying after a flaky first open (common in Chrome); the database usually works afterward.
 * Persistent failures: free disk space, private mode, or clear site data for this origin.
 */
export const db = new Dexie("osint-earth-offline");

db.version(1).stores({
  cached_events:        "id, event_type, occurred_at",
  cached_tracks:        "++_id, type, identifier, recorded_at",
  cached_snapshots:     "id, event_id, captured_at",
  cached_environmental: "id, event_type, started_at",
  cached_webcams:       "id, source, country",
  sync_queue:           "++_id, action, created_at",
  pinned_regions:       "++_id, name, status, created_at",
});

// ---- Events ----

export async function cacheEvents(geojson) {
  if (!geojson?.features?.length) return;
  const items = geojson.features.map((f) => ({
    id: f.id || f.properties.id,
    ...f.properties,
    geometry: f.geometry,
  }));
  await db.cached_events.bulkPut(items);
}

export async function getCachedEvents(filters = {}) {
  let collection = db.cached_events.toCollection();
  if (filters.event_type) {
    collection = db.cached_events.where("event_type").equals(filters.event_type);
  }
  const items = await collection.toArray();

  return {
    type: "FeatureCollection",
    features: items.map((item) => ({
      type: "Feature",
      id: item.id,
      geometry: item.geometry,
      properties: item,
    })),
  };
}

export async function getCachedEvent(id) {
  return db.cached_events.get(id);
}

// ---- Tracks (aircraft + ships) ----

export async function cacheTracks(type, geojson) {
  if (!geojson?.features?.length) return;
  const items = geojson.features.map((f) => ({
    type,
    identifier: f.properties.icao24 || f.properties.mmsi,
    ...f.properties,
    geometry: f.geometry,
  }));
  await db.cached_tracks.bulkAdd(items);
}

export async function getCachedTracks(type) {
  const items = await db.cached_tracks.where("type").equals(type).toArray();
  return {
    type: "FeatureCollection",
    features: items.map((item) => ({
      type: "Feature",
      geometry: item.geometry,
      properties: item,
    })),
  };
}

// ---- Environmental events ----

export async function cacheEnvironmental(rows) {
  if (!rows?.length) return;
  const items = rows.map((r) => ({
    id: r.id,
    event_type: r.event_type,
    severity: r.severity,
    data_source: r.data_source,
    started_at: r.started_at,
    ended_at: r.ended_at,
    metadata: r.metadata,
    geometry: r.geometry,
  }));
  await db.cached_environmental.bulkPut(items);
}

export async function getCachedEnvironmental(filters = {}) {
  let collection = db.cached_environmental.toCollection();
  if (filters.event_type) {
    const types = Array.isArray(filters.event_type) ? filters.event_type : [filters.event_type];
    collection = db.cached_environmental.where("event_type").anyOf(types);
  }
  const items = await collection.toArray();
  return {
    type: "FeatureCollection",
    features: items.map((item) => ({
      type: "Feature",
      id: item.id,
      geometry: item.geometry,
      properties: {
        id: item.id,
        event_type: item.event_type,
        severity: item.severity,
        data_source: item.data_source,
        started_at: item.started_at,
        metadata: item.metadata || {},
      },
    })),
  };
}

// ---- Snapshots ----

export async function cacheSnapshots(snapshots) {
  if (!snapshots?.length) return;
  await db.cached_snapshots.bulkPut(snapshots);
}

export async function getCachedSnapshots(eventId) {
  if (eventId) {
    return db.cached_snapshots.where("event_id").equals(Number(eventId)).toArray();
  }
  return db.cached_snapshots.toArray();
}

// ---- Webcams ----

export async function cacheWebcams(geojson) {
  if (!geojson?.features?.length) return;
  const items = geojson.features.map((f) => ({
    id: f.properties.id,
    ...f.properties,
    geometry: f.geometry,
  }));
  await db.cached_webcams.bulkPut(items);
}

export async function getCachedWebcams() {
  const items = await db.cached_webcams.toArray();
  return {
    type: "FeatureCollection",
    features: items.map((item) => ({
      type: "Feature",
      geometry: item.geometry,
      properties: item,
    })),
  };
}

// ---- Sync queue ----

export async function addSyncAction(action, payload) {
  return db.sync_queue.add({
    action,
    payload,
    created_at: new Date().toISOString(),
  });
}

export async function getSyncQueue() {
  return db.sync_queue.toArray();
}

export async function clearSyncQueue() {
  return db.sync_queue.clear();
}

// ---- Pinned regions ----

export async function addPinnedRegion(region) {
  return db.pinned_regions.add({
    ...region,
    status: "pending",
    size_bytes: 0,
    created_at: new Date().toISOString(),
    last_synced: null,
  });
}

export async function updatePinnedRegion(id, updates) {
  return db.pinned_regions.update(id, updates);
}

export async function getPinnedRegions() {
  return db.pinned_regions.toArray();
}

export async function deletePinnedRegion(id) {
  return db.pinned_regions.delete(id);
}

// ---- Cache statistics ----

export async function getCacheStats() {
  const [events, tracks, environmental, snapshots, webcams, queue] = await Promise.all([
    db.cached_events.count(),
    db.cached_tracks.count(),
    db.cached_environmental.count(),
    db.cached_snapshots.count(),
    db.cached_webcams.count(),
    db.sync_queue.count(),
  ]);
  return { events, tracks, environmental, snapshots, webcams, pending_sync: queue };
}

/**
 * Clear all cached offline data (does not remove pinned region records).
 */
export async function clearAllCaches() {
  await Promise.all([
    db.cached_events.clear(),
    db.cached_tracks.clear(),
    db.cached_environmental.clear(),
    db.cached_snapshots.clear(),
    db.cached_webcams.clear(),
    db.sync_queue.clear(),
  ]);
}
