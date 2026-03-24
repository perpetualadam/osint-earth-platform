import React, { useEffect, useState } from "react";
import { useStore } from "../hooks/useStore";
import { getCacheStats } from "../services/localDb";
import { api } from "../services/api";

const LAYER_GROUPS = [
  {
    label: "Base Map",
    layers: [
      { key: "satellite", label: "Satellite View", cacheField: null },
      { key: "sentinel2", label: "Sentinel-2 (ESA)", cacheField: null, requiresIon: true },
    ],
  },
  {
    label: "Context",
    layers: [
      {
        key: "ctx_admin0",
        label: "Country borders",
        cacheField: null,
        tooltip: "Admin-0 polygons (Natural Earth 110m from API or backend/data/context/admin0_countries.geojson)",
      },
      { key: "ctx_airports", label: "Airports", cacheField: null, tooltip: "Sample points; replace with your dataset" },
      { key: "ctx_ports", label: "Ports", cacheField: null, tooltip: "Sample points" },
      {
        key: "ctx_military",
        label: "Military installations",
        cacheField: null,
        tooltip: "Placeholder GeoJSON — verify license before production use",
      },
      { key: "ctx_crossings", label: "Border crossings", cacheField: null },
      { key: "ctx_energy", label: "Dams / energy / industrial", cacheField: null },
      {
        key: "territorial",
        label: "Territorial / LoC",
        cacheField: null,
        tooltip: "Time-sliced polygons from backend/data/territorial; uses timeline end as “as of” time",
      },
    ],
  },
  {
    label: "Tracking",
    layers: [
      { key: "aircraft", label: "Aircraft", cacheField: "tracks" },
      { key: "ships", label: "Ships", cacheField: "tracks" },
    ],
  },
  {
    label: "Environment",
    layers: [
      { key: "wildfires", label: "Wildfires", cacheField: "environmental", tooltip: "NASA FIRMS hotspots (run seed script or workers)" },
      { key: "earthquakes", label: "Earthquakes", cacheField: "environmental", tooltip: "USGS seismic events (run seed script or workers)" },
    ],
  },
  {
    label: "Intelligence",
    layers: [
      { key: "events", label: "Events", cacheField: "events", tooltip: "GDELT/ACLED news & conflict events (separate from wildfires/earthquakes)" },
      { key: "anomalies", label: "Anomalies", cacheField: null, tooltip: "AI-detected (AIS gaps, loitering, clusters). Toggle shows existing data; run AI scan to populate." },
      { key: "webcams", label: "Webcams", cacheField: "webcams" },
      {
        key: "telegram",
        label: "Telegram posts",
        cacheField: null,
        tooltip: "Geocoded channel posts (ingest + TELEGRAM_SESSION_STRING or interactive login). API: /api/telegram/geojson.",
      },
    ],
  },
  {
    label: "Heatmaps",
    layers: [
      { key: "heatmap_fires", label: "Fire Density", cacheField: null, tooltip: "Spatial density of wildfire hotspots (last 7 days). Enable Wildfires for clickable markers." },
      { key: "heatmap_quakes", label: "Seismic Activity", cacheField: null, tooltip: "Earthquake density (last 30 days)" },
      { key: "heatmap_shipping", label: "Shipping Density", cacheField: null, tooltip: "Ship positions (last hour)" },
      { key: "heatmap_air", label: "Air Traffic", cacheField: null, tooltip: "Aircraft positions (last 5 min)" },
    ],
  },
];

const hasIonToken = !!import.meta.env.VITE_CESIUM_ION_TOKEN;

export default function LayerManager() {
  const layers = useStore((s) => s.layers);
  const toggle = useStore((s) => s.toggleLayer);
  const aircraftPreset = useStore((s) => s.aircraftPreset);
  const setAircraftPreset = useStore((s) => s.setAircraftPreset);
  const aircraftCallsignPrefix = useStore((s) => s.aircraftCallsignPrefix);
  const setAircraftCallsignPrefix = useStore((s) => s.setAircraftCallsignPrefix);
  const aircraftMinAltitude = useStore((s) => s.aircraftMinAltitude);
  const setAircraftMinAltitude = useStore((s) => s.setAircraftMinAltitude);
  const aircraftMaxAltitude = useStore((s) => s.aircraftMaxAltitude);
  const setAircraftMaxAltitude = useStore((s) => s.setAircraftMaxAltitude);
  const aircraftMinVelocity = useStore((s) => s.aircraftMinVelocity);
  const setAircraftMinVelocity = useStore((s) => s.setAircraftMinVelocity);
  const eventFilters = useStore((s) => s.eventFilters);
  const setEventFilters = useStore((s) => s.setEventFilters);
  const triggerAnomaliesRefresh = useStore((s) => s.triggerAnomaliesRefresh);
  const isOnline = useStore((s) => s.isOnline);
  const toggleOffline = useStore((s) => s.toggleOfflinePanel);
  const [cacheStats, setCacheStats] = useState(null);
  const [anomalyScanning, setAnomalyScanning] = useState(false);
  const [anomalyScanError, setAnomalyScanError] = useState(null);

  const runAnomalyScan = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setAnomalyScanError(null);
    setAnomalyScanning(true);
    try {
      const result = await api.scanAnomalies();
      triggerAnomaliesRefresh();
      console.log("Anomaly scan complete:", result?.anomalies_detected ?? 0, "detected");
    } catch (err) {
      const msg = err.message || "AI service unavailable";
      setAnomalyScanError(msg.includes("503") ? "AI service not running. Start: docker compose up ai-service" : msg);
      console.warn("Anomaly scan failed:", err);
    } finally {
      setAnomalyScanning(false);
    }
  };

  useEffect(() => {
    getCacheStats().then(setCacheStats).catch(() => {});
    const interval = setInterval(() => {
      getCacheStats().then(setCacheStats).catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const hasCachedData = (field) => {
    if (!cacheStats || !field) return false;
    return (cacheStats[field] || 0) > 0;
  };

  return (
    <aside className="layer-manager panel">
      <div className="lm-header">
        <h2 className="lm-title" id="layers-heading">Layers</h2>
        <button className="lm-offline-btn" onClick={toggleOffline} title="Manage saved offline areas" aria-label="Manage saved offline areas">
          &#128190; Saved
        </button>
      </div>

      {LAYER_GROUPS.map((group) => (
        <div key={group.label} className="lm-group">
          <h3 className="lm-group-label">{group.label}</h3>
          {group.layers
            .filter((l) => !l.requiresIon || hasIonToken)
            .map((l) => (
              <div key={l.key} className="lm-layer-row">
                <label
                  className="lm-layer"
                  title={l.tooltip || (l.key === "sentinel2" ? "Add asset 3954 to your Cesium Ion account first: ion.cesium.com/assetdepot" : undefined)}
                >
                  <input
                    type="checkbox"
                    checked={layers[l.key]}
                    onChange={() => toggle(l.key)}
                    aria-label={`Toggle ${l.label} layer`}
                  />
                  <span className="lm-layer-name">
                    {l.label}
                    {l.key === "satellite" && (
                      <span className="lm-hint">
                        {layers.satellite ? "(satellite imagery)" : "(street map)"}
                      </span>
                    )}
                  </span>
                  {!isOnline && hasCachedData(l.cacheField) && (
                    <span className="lm-cached-badge" title="Cached data available offline">
                      cached
                    </span>
                  )}
                  {!isOnline && !hasCachedData(l.cacheField) && l.cacheField && (
                    <span className="lm-nocache-badge" title="No cached data for this layer">
                      no data
                    </span>
                  )}
                </label>
                {l.key === "anomalies" && (
                  <>
                    <button
                      type="button"
                      className="lm-scan-btn"
                      onClick={runAnomalyScan}
                      disabled={anomalyScanning}
                      title="Run AI scan to detect anomalies (ship gaps, loitering, clusters). Requires AI service."
                      aria-label="Scan for anomalies"
                    >
                      {anomalyScanning ? "Scanning…" : "Scan"}
                    </button>
                    {anomalyScanError && (
                      <span className="lm-scan-error-wrap">
                        <span className="lm-scan-error" title={anomalyScanError}>{anomalyScanError}</span>
                        <button type="button" className="lm-scan-retry" onClick={runAnomalyScan} disabled={anomalyScanning}>
                          Retry
                        </button>
                      </span>
                    )}
                  </>
                )}
              </div>
            ))}
          {group.label === "Tracking" && layers.aircraft && (
            <div className="lm-aircraft-filters">
              <h4 className="lm-filters-label">Aircraft filters</h4>
              <div className="lm-filter-row">
                <label htmlFor="lm-ac-preset">Preset</label>
                <select
                  id="lm-ac-preset"
                  value={aircraftPreset}
                  onChange={(e) => setAircraftPreset(e.target.value)}
                  aria-label="Aircraft preset"
                >
                  <option value="all">All traffic</option>
                  <option value="military">Military / gov heuristics</option>
                  <option value="interesting">Military + unusual</option>
                </select>
              </div>
              <div className="lm-filter-row">
                <label htmlFor="lm-ac-cs">Callsign prefix</label>
                <input
                  id="lm-ac-cs"
                  type="text"
                  placeholder="e.g. RCH"
                  value={aircraftCallsignPrefix}
                  onChange={(e) => setAircraftCallsignPrefix(e.target.value)}
                  aria-label="Filter callsign prefix"
                  autoComplete="off"
                />
              </div>
              <div className="lm-filter-row">
                <label htmlFor="lm-ac-alt-min">Min alt (ft)</label>
                <input
                  id="lm-ac-alt-min"
                  type="number"
                  placeholder="—"
                  value={aircraftMinAltitude ?? ""}
                  onChange={(e) => setAircraftMinAltitude(e.target.value)}
                  aria-label="Minimum altitude feet"
                />
              </div>
              <div className="lm-filter-row">
                <label htmlFor="lm-ac-alt-max">Max alt (ft)</label>
                <input
                  id="lm-ac-alt-max"
                  type="number"
                  placeholder="—"
                  value={aircraftMaxAltitude ?? ""}
                  onChange={(e) => setAircraftMaxAltitude(e.target.value)}
                  aria-label="Maximum altitude feet"
                />
              </div>
              <div className="lm-filter-row">
                <label htmlFor="lm-ac-vel">Min speed</label>
                <input
                  id="lm-ac-vel"
                  type="number"
                  placeholder="—"
                  value={aircraftMinVelocity ?? ""}
                  onChange={(e) => setAircraftMinVelocity(e.target.value)}
                  aria-label="Minimum ground speed"
                />
              </div>
            </div>
          )}
          {group.label === "Intelligence" && layers.events && (
            <div className="lm-event-filters">
              <h4 className="lm-filters-label">Event filters</h4>
              <label className="lm-filter-row">
                <input
                  type="checkbox"
                  checked={eventFilters.dedupe}
                  onChange={(e) => setEventFilters({ dedupe: e.target.checked })}
                  aria-label="Merge duplicate events"
                />
                <span>Merge duplicates</span>
              </label>
              <div className="lm-filter-row">
                <label htmlFor="lm-event-type">Type</label>
                <select
                  id="lm-event-type"
                  value={eventFilters.event_type}
                  onChange={(e) => setEventFilters({ event_type: e.target.value })}
                  aria-label="Filter by event type"
                >
                  <option value="">All</option>
                  <option value="conflict">Conflict</option>
                  <option value="protest">Protest</option>
                  <option value="disaster">Disaster</option>
                  <option value="news">News</option>
                  <option value="wildfire">Wildfire</option>
                  <option value="earthquake">Earthquake</option>
                </select>
              </div>
              <div className="lm-filter-row">
                <label htmlFor="lm-event-source">Source</label>
                <select
                  id="lm-event-source"
                  value={eventFilters.source}
                  onChange={(e) => setEventFilters({ source: e.target.value })}
                  aria-label="Filter by source"
                >
                  <option value="">All</option>
                  <option value="gdelt">GDELT</option>
                  <option value="acled">ACLED</option>
                </select>
              </div>
              <div className="lm-filter-row">
                <label htmlFor="lm-severity-min">Min severity</label>
                <input
                  id="lm-severity-min"
                  type="number"
                  min="1"
                  max="10"
                  placeholder="—"
                  value={eventFilters.severity_min || ""}
                  onChange={(e) => setEventFilters({ severity_min: e.target.value || "" })}
                  aria-label="Minimum severity (1–10)"
                />
              </div>
            </div>
          )}
        </div>
      ))}

      <style>{`
        .layer-manager {
          width: 260px;
          overflow-y: auto;
          flex-shrink: 0;
          border-right: 1px solid var(--border);
          border-radius: 0;
          font-size: 13px;
        }
        .lm-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .lm-title { font-size: 14px; font-weight: 600; }
        .lm-offline-btn {
          background: var(--bg-hover);
          color: var(--text-secondary);
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
        }
        .lm-offline-btn:hover { background: var(--accent); color: white; }
        .lm-group { margin-bottom: 14px; }
        .lm-group-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: var(--text-secondary);
          margin-bottom: 6px;
        }
        .lm-layer-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          padding: 4px 0;
        }
        .lm-layer {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          cursor: pointer;
        }
        .lm-scan-btn {
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 4px;
          background: var(--accent);
          color: white;
          border: none;
          cursor: pointer;
          white-space: nowrap;
        }
        .lm-scan-btn:hover:not(:disabled) { opacity: 0.9; }
        .lm-scan-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .lm-scan-error-wrap { display: flex; align-items: center; gap: 8px; width: 100%; flex-wrap: wrap; }
        .lm-scan-error {
          font-size: 10px;
          color: var(--error, #ef4444);
          flex: 1;
          min-width: 0;
        }
        .lm-scan-retry {
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 4px;
          background: var(--bg-hover);
          color: var(--text);
          border: 1px solid var(--border);
          cursor: pointer;
        }
        .lm-scan-retry:hover:not(:disabled) { background: var(--accent); color: white; }
        .lm-layer input { accent-color: var(--accent); }
        .lm-layer-name { flex: 1; }
        .lm-hint { font-size: 10px; color: var(--text-secondary); margin-left: 4px; }
        .lm-cached-badge {
          font-size: 9px;
          padding: 1px 5px;
          border-radius: 3px;
          background: var(--success);
          color: white;
          text-transform: uppercase;
          font-weight: 600;
          letter-spacing: 0.3px;
        }
        .lm-nocache-badge {
          font-size: 9px;
          padding: 1px 5px;
          border-radius: 3px;
          background: var(--bg-hover);
          color: var(--text-secondary);
          text-transform: uppercase;
          font-weight: 600;
        }
        .lm-event-filters {
          margin-top: 8px;
          padding: 10px;
          background: var(--bg-hover);
          border-radius: 6px;
          font-size: 12px;
        }
        .lm-filters-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }
        .lm-filter-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }
        .lm-filter-row:last-child { margin-bottom: 0; }
        .lm-filter-row label { min-width: 70px; font-size: 11px; color: var(--text-secondary); }
        .lm-filter-row select, .lm-filter-row input[type="number"], .lm-filter-row input[type="text"] {
          flex: 1;
          padding: 4px 8px;
          font-size: 11px;
          background: var(--bg-panel);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 4px;
        }
        .lm-aircraft-filters {
          margin-top: 8px;
          padding: 10px;
          background: var(--bg-hover);
          border-radius: 6px;
          font-size: 12px;
        }
      `}</style>
    </aside>
  );
}
