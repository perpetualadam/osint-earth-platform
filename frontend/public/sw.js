const CACHE_STATIC = "osint-static-v1";
const CACHE_TILES = "osint-offline-tiles";
const CACHE_API = "osint-api-v1";
const CACHE_SNAPSHOTS = "osint-snapshots-v1";

const STATIC_ASSETS = ["/", "/index.html", "/manifest.json"];

const MAX_TILE_CACHE_ITEMS = 20_000;
const MAX_API_CACHE_ITEMS = 2_000;
const MAX_SNAPSHOT_CACHE_ITEMS = 5_000;

// ---- Lifecycle events ----

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (k) =>
              k !== CACHE_STATIC &&
              k !== CACHE_TILES &&
              k !== CACHE_API &&
              k !== CACHE_SNAPSHOTS
          )
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ---- Fetch routing ----

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== "GET") return;

  // Tile requests (satellite tiles, heatmap tiles) – cache-first
  if (url.pathname.startsWith("/api/tiles/")) {
    event.respondWith(cacheFirst(event.request, CACHE_TILES, MAX_TILE_CACHE_ITEMS));
    return;
  }

  // Heatmap data – cache-first with short expiry in the API cache
  if (url.pathname.startsWith("/api/heatmaps/")) {
    event.respondWith(cacheFirst(event.request, CACHE_API, MAX_API_CACHE_ITEMS));
    return;
  }

  // Snapshot images – cache-first
  if (url.pathname.match(/\/api\/snapshots\/\d+\/image/)) {
    event.respondWith(cacheFirst(event.request, CACHE_SNAPSHOTS, MAX_SNAPSHOT_CACHE_ITEMS));
    return;
  }

  // Other API requests – network-first, fall back to cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(event.request, CACHE_API, MAX_API_CACHE_ITEMS));
    return;
  }

  // Static assets and app shell – cache-first
  event.respondWith(cacheFirst(event.request, CACHE_STATIC));
});

// ---- Message channel for offline operations ----

self.addEventListener("message", (event) => {
  if (event.data?.type === "CACHE_URLS") {
    event.waitUntil(cacheUrlBatch(event.data.urls, event.data.cacheName || CACHE_TILES));
  }

  if (event.data?.type === "CLEAR_CACHE") {
    event.waitUntil(caches.delete(event.data.cacheName));
  }

  if (event.data?.type === "GET_CACHE_SIZE") {
    getCacheSize(event.data.cacheName || CACHE_TILES).then((size) => {
      event.source.postMessage({ type: "CACHE_SIZE", cacheName: event.data.cacheName, size });
    });
  }
});

// ---- Caching strategies ----

async function cacheFirst(request, cacheName, maxItems) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
      if (maxItems) trimCache(cacheName, maxItems);
    }
    return response;
  } catch {
    return offlineResponse();
  }
}

async function networkFirst(request, cacheName, maxItems) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
      if (maxItems) trimCache(cacheName, maxItems);
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return offlineResponse();
  }
}

function offlineResponse() {
  return new Response(
    JSON.stringify({ error: "offline", message: "No cached data available" }),
    { status: 503, headers: { "Content-Type": "application/json" } }
  );
}

// ---- LRU cache trimming ----

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxItems) return;

  const excess = keys.length - maxItems;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

// ---- Batch URL caching (for region pinning) ----

async function cacheUrlBatch(urls, cacheName) {
  const cache = await caches.open(cacheName);
  let completed = 0;
  const total = urls.length;

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response);
      }
    } catch { /* skip failed */ }
    completed++;
    // Report progress to all clients
    const clients = await self.clients.matchAll();
    for (const client of clients) {
      client.postMessage({
        type: "CACHE_PROGRESS",
        cacheName,
        completed,
        total,
      });
    }
  }
}

async function getCacheSize(cacheName) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  return { items: keys.length };
}
