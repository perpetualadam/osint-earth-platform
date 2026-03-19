const BASE = import.meta.env.VITE_API_URL || "";

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

export const api = {
  getEvents: (params) =>
    fetchJSON(`${BASE}/api/events?${new URLSearchParams(params)}`),

  getEvent: (id) => fetchJSON(`${BASE}/api/events/${id}`),

  getEventSnapshots: (id) => fetchJSON(`${BASE}/api/events/${id}/snapshots`),

  getEventTimeline: (id) => fetchJSON(`${BASE}/api/events/${id}/timeline`),

  getTilesAvailable: (params) =>
    fetchJSON(`${BASE}/api/tiles/available?${new URLSearchParams(params)}`),

  getAircraft: (params) =>
    fetchJSON(`${BASE}/api/aircraft?${new URLSearchParams(params)}`),

  getAircraftHistory: (icao24, params) =>
    fetchJSON(`${BASE}/api/aircraft/${icao24}/history?${new URLSearchParams(params)}`),

  getShips: (params) =>
    fetchJSON(`${BASE}/api/ships?${new URLSearchParams(params)}`),

  getShipHistory: (mmsi, params) =>
    fetchJSON(`${BASE}/api/ships/${mmsi}/history?${new URLSearchParams(params)}`),

  getWebcams: (params) =>
    fetchJSON(`${BASE}/api/webcams?${new URLSearchParams(params)}`),

  getHeatmap: (type) => fetchJSON(`${BASE}/api/heatmaps/${type}`),

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
};
