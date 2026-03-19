import { api } from "./api";
import {
  addPinnedRegion,
  updatePinnedRegion,
  deletePinnedRegion,
  db,
  cacheEvents,
  cacheTracks,
  cacheEnvironmental,
  cacheWebcams,
  cacheSnapshots,
  getCacheStats,
  clearAllCaches,
} from "./localDb";
import { countTiles } from "../utils/tilemath";

const TILE_CACHE_NAME = "osint-offline-tiles";

/**
 * Estimate how many tiles and bytes a pinned region would require
 * before actually downloading anything.
 */
export async function estimateRegionSize(bbox, zoomMin = 1, zoomMax = 14) {
  const tileCount = countTiles(bbox, zoomMin, zoomMax);
  const avgTileBytes = 25_000; // ~25 KB average WebP tile
  return {
    tile_count: tileCount,
    estimated_bytes: tileCount * avgTileBytes,
    estimated_mb: Math.round((tileCount * avgTileBytes) / 1_048_576),
  };
}

/**
 * Pin a region for offline use:
 *  1. Request cache manifest from backend
 *  2. Pre-fetch and cache all tile URLs via Cache API
 *  3. Fetch and store events, tracks, environmental, webcam data in IndexedDB
 *  4. Fetch and store event snapshots
 */
export async function pinRegionOffline(name, bbox, timeStart, timeEnd, onProgress) {
  const manifest = await api.postOfflinePackage({
    bbox,
    time_start: timeStart,
    time_end: timeEnd,
  });

  const regionId = await addPinnedRegion({
    name,
    bbox,
    time_start: timeStart,
    time_end: timeEnd,
    tile_count: manifest.tile_count,
    event_count: manifest.event_count,
  });

  await updatePinnedRegion(regionId, { status: "downloading" });

  const total = manifest.urls.length;
  let completed = 0;
  let totalBytes = 0;

  const cache = await caches.open(TILE_CACHE_NAME);
  const bboxStr = bbox.join(",");

  // Phase 1: Cache all manifest URLs (tiles + API endpoints)
  for (const url of manifest.urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const cloned = response.clone();
        await cache.put(url, cloned);

        const buf = await response.arrayBuffer();
        totalBytes += buf.byteLength;
      }
    } catch { /* skip failed items */ }
    completed++;
    onProgress?.(completed, total, "tiles");
  }

  // Phase 2: Fetch and cache structured data into IndexedDB
  onProgress?.(completed, total, "events");
  try {
    const params = { bbox: bboxStr, limit: "5000" };
    if (timeStart) params.time_start = timeStart;
    if (timeEnd) params.time_end = timeEnd;

    const events = await api.getEvents(params);
    await cacheEvents(events);

    // Cache snapshots for each event
    for (const feature of events.features.slice(0, 200)) {
      try {
        const snaps = await api.getEventSnapshots(feature.id);
        if (snaps?.length) await cacheSnapshots(snaps);
      } catch { /* skip */ }
    }
  } catch (e) { console.warn("Offline event cache failed:", e); }

  onProgress?.(completed, total, "aircraft");
  try {
    const aircraft = await api.getAircraft({ bbox: bboxStr, live: "false", time_start: timeStart, time_end: timeEnd });
    await cacheTracks("aircraft", aircraft);
  } catch (e) { console.warn("Offline aircraft cache failed:", e); }

  onProgress?.(completed, total, "ships");
  try {
    const ships = await api.getShips({ bbox: bboxStr, live: "false", time_start: timeStart, time_end: timeEnd });
    await cacheTracks("ship", ships);
  } catch (e) { console.warn("Offline ship cache failed:", e); }

  onProgress?.(completed, total, "webcams");
  try {
    const webcams = await api.getWebcams({ bbox: bboxStr });
    await cacheWebcams(webcams);
  } catch (e) { console.warn("Offline webcam cache failed:", e); }

  await updatePinnedRegion(regionId, {
    status: "ready",
    size_bytes: totalBytes,
    last_synced: new Date().toISOString(),
  });

  return regionId;
}

/**
 * Refresh an already-pinned region's data (re-download).
 */
export async function refreshOfflineRegion(regionId) {
  const region = await db.pinned_regions.get(regionId);
  if (!region) throw new Error("Region not found");

  await updatePinnedRegion(regionId, { status: "downloading" });

  await pinRegionOffline(
    region.name,
    region.bbox,
    region.time_start,
    region.time_end,
    null,
  );
}

/**
 * Remove a pinned region and its cached tile data.
 */
export async function removeOfflineRegion(regionId) {
  await deletePinnedRegion(regionId);
}

/**
 * Export cached offline data for a region as a downloadable JSON blob.
 * For full ZIP export, use the backend /api/offline/export endpoint.
 */
export async function exportRegionData(bbox, timeStart, timeEnd) {
  const bboxStr = bbox.join(",");

  try {
    const url = `/api/offline/export?bbox=${bboxStr}` +
      (timeStart ? `&time_start=${timeStart}` : "") +
      (timeEnd ? `&time_end=${timeEnd}` : "");

    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Export failed");

    const blob = await resp.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `osint-export-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    return true;
  } catch (e) {
    console.error("Export error:", e);
    return false;
  }
}

/**
 * Import a previously exported JSON archive into the local IndexedDB cache.
 */
export async function importRegionData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const data = JSON.parse(text);

        if (data.events) {
          const geojson = {
            type: "FeatureCollection",
            features: data.events.map((ev) => ({
              type: "Feature",
              id: ev.id,
              geometry: ev.geometry,
              properties: ev,
            })),
          };
          await cacheEvents(geojson);
        }

        if (data.environmental) {
          await cacheEnvironmental(data.environmental);
        }

        if (data.webcams) {
          const geojson = {
            type: "FeatureCollection",
            features: data.webcams.map((w) => ({
              type: "Feature",
              id: w.id,
              geometry: w.geometry,
              properties: w,
            })),
          };
          await cacheWebcams(geojson);
        }

        resolve(true);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/**
 * Process any pending sync queue items (user bookmarks, annotations, etc.)
 * when connectivity is restored.
 */
export async function processSyncQueue() {
  const { getSyncQueue, clearSyncQueue } = await import("./localDb");
  const queue = await getSyncQueue();
  if (!queue.length) return 0;

  let synced = 0;
  for (const item of queue) {
    try {
      if (item.action === "bookmark_event") {
        // Future: POST /api/bookmarks with item.payload
      }
      synced++;
    } catch { /* leave in queue on failure */ }
  }

  if (synced === queue.length) {
    await clearSyncQueue();
  }
  return synced;
}

export async function estimateStorageUsage() {
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    return { used: est.usage || 0, quota: est.quota || 0 };
  }
  return { used: 0, quota: 0 };
}

export { getCacheStats, clearAllCaches };
