const LAYER_KEYS = [
  "satellite",
  "sentinel2",
  "nasa_modis",
  "nasa_blue_marble",
  "aircraft",
  "ships",
  "wildfires",
  "earthquakes",
  "webcams",
  "events",
  "anomalies",
  "heatmap_fires",
  "heatmap_quakes",
  "heatmap_shipping",
  "heatmap_air",
  "telegram",
  "ctx_admin0",
  "ctx_airports",
  "ctx_ports",
  "ctx_military",
  "ctx_crossings",
  "ctx_energy",
  "territorial",
];

export function parseViewFromSearch(search) {
  const params = new URLSearchParams(search || "");
  const out = {};
  const bbox = params.get("bbox");
  if (bbox) {
    const p = bbox.split(",").map(Number);
    if (p.length === 4 && !p.some(Number.isNaN)) out.bbox = p;
  }
  const layers = params.get("layers");
  if (layers) {
    out.layersOn = layers.split(",").map((s) => s.trim()).filter(Boolean);
  }
  const t0 = params.get("t0");
  const t1 = params.get("t1");
  if (t0) out.timeStart = t0;
  if (t1) out.timeEnd = t1;
  const ap = params.get("aircraft_preset");
  if (ap && ["all", "military", "interesting"].includes(ap)) out.aircraftPreset = ap;
  if (params.has("callsign_prefix")) out.callsignPrefix = params.get("callsign_prefix") || "";
  const amin = params.get("alt_min");
  if (amin != null && amin !== "") out.aircraftMinAltitude = amin;
  const amax = params.get("alt_max");
  if (amax != null && amax !== "") out.aircraftMaxAltitude = amax;
  const vmin = params.get("vel_min");
  if (vmin != null && vmin !== "") out.aircraftMinVelocity = vmin;
  return out;
}

export function buildViewSearchParams(state) {
  const params = new URLSearchParams();
  if (state.bbox?.length === 4) params.set("bbox", state.bbox.join(","));
  if (state.layersOn?.length) params.set("layers", state.layersOn.join(","));
  if (state.timeStart) params.set("t0", state.timeStart);
  if (state.timeEnd) params.set("t1", state.timeEnd);
  if (state.aircraftPreset && state.aircraftPreset !== "all") params.set("aircraft_preset", state.aircraftPreset);
  if (state.callsignPrefix) params.set("callsign_prefix", state.callsignPrefix);
  if (state.aircraftMinAltitude != null && String(state.aircraftMinAltitude).trim() !== "") {
    params.set("alt_min", String(state.aircraftMinAltitude).trim());
  }
  if (state.aircraftMaxAltitude != null && String(state.aircraftMaxAltitude).trim() !== "") {
    params.set("alt_max", String(state.aircraftMaxAltitude).trim());
  }
  if (state.aircraftMinVelocity != null && String(state.aircraftMinVelocity).trim() !== "") {
    params.set("vel_min", String(state.aircraftMinVelocity).trim());
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export { LAYER_KEYS };
