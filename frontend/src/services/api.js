const BASE = import.meta.env.VITE_API_URL || "";

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const trimmed = text.trim();
  if (!trimmed) throw new Error(`API returned empty body for ${url}`);
  try {
    return JSON.parse(trimmed);
  } catch {
    const hint =
      trimmed.includes("<!DOCTYPE") || trimmed.includes("<html")
        ? " (got HTML instead of JSON — use same-origin /api: empty VITE_API_URL, then Vite :5173, Docker SPA :8080, or main nginx :80)"
        : "";
    throw new Error(`API response was not JSON for ${url}${hint}`);
  }
}

export const api = {
  getEvents: (params) =>
    fetchJSON(`${BASE}/api/events?${new URLSearchParams(params)}`),

  getEvent: (id) => fetchJSON(`${BASE}/api/events/${id}`),

  getEventSnapshots: (id) => fetchJSON(`${BASE}/api/events/${id}/snapshots`),

  getEventTimeline: (id) => fetchJSON(`${BASE}/api/events/${id}/timeline`),

  getEventNews: (id, params) =>
    fetchJSON(`${BASE}/api/events/${id}/news${params && Object.keys(params).length ? `?${new URLSearchParams(params)}` : ""}`),

  getTilesAvailable: (params) =>
    fetchJSON(`${BASE}/api/tiles/available?${new URLSearchParams(params)}`),

  getAircraft: (params) =>
    fetchJSON(`${BASE}/api/aircraft?${new URLSearchParams(params)}`),

  getAircraftType: (icao24) =>
    fetchJSON(`${BASE}/api/aircraft/${icao24}/type`),

  getAircraftHistory: (icao24, params) =>
    fetchJSON(`${BASE}/api/aircraft/${icao24}/history?${new URLSearchParams(params)}`),

  getShips: (params) =>
    fetchJSON(`${BASE}/api/ships?${new URLSearchParams(params)}`),

  getShipHistory: (mmsi, params) =>
    fetchJSON(`${BASE}/api/ships/${mmsi}/history?${new URLSearchParams(params)}`),

  getWebcams: (params) =>
    fetchJSON(`${BASE}/api/webcams?${new URLSearchParams(params)}`),

  getHeatmap: (type) => fetchJSON(`${BASE}/api/heatmaps/${type}`),

  getEnvironmental: (params) =>
    fetchJSON(`${BASE}/api/environmental?${new URLSearchParams(params)}`),

  getAnomalies: (params) =>
    fetchJSON(`${BASE}/api/anomalies?${new URLSearchParams(params)}`),

  getAnomaly: (id) => fetchJSON(`${BASE}/api/anomalies/${id}`),

  getReplayFrames: (params) =>
    fetchJSON(`${BASE}/api/replay/frames?${new URLSearchParams(params)}`),

  getSnapshots: (params) =>
    fetchJSON(`${BASE}/api/snapshots?${new URLSearchParams(params)}`),

  postOfflinePackage: (body) =>
    fetchJSON(`${BASE}/api/offline/package`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  scanAnomalies: (params = {}) =>
    fetchJSON(`${BASE}/api/ai/anomaly/scan?${new URLSearchParams({ hours: 24, anomaly_type: "all", ...params })}`, {
      method: "POST",
    }),

  getTelegramGeojson: (params) =>
    fetchJSON(`${BASE}/api/telegram/geojson?${new URLSearchParams(params)}`),

  getTelegramPosts: (params) =>
    fetchJSON(`${BASE}/api/telegram/posts?${new URLSearchParams(params)}`),
};
