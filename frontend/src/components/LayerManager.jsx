import React, { useEffect, useState } from "react";
import { useStore } from "../hooks/useStore";
import { getCacheStats } from "../services/localDb";

const LAYER_GROUPS = [
  {
    label: "Base Map",
    layers: [
      { key: "satellite", label: "Satellite View", cacheField: null },
      { key: "sentinel2", label: "Sentinel-2 (ESA)", cacheField: null, requiresIon: true },
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
      { key: "wildfires", label: "Wildfires", cacheField: "environmental" },
      { key: "earthquakes", label: "Earthquakes", cacheField: "environmental" },
    ],
  },
  {
    label: "Intelligence",
    layers: [
      { key: "events", label: "Events", cacheField: "events" },
      { key: "anomalies", label: "Anomalies", cacheField: null },
      { key: "webcams", label: "Webcams", cacheField: "webcams" },
    ],
  },
  {
    label: "Heatmaps",
    layers: [
      { key: "heatmap_fires", label: "Fire Density", cacheField: null },
      { key: "heatmap_quakes", label: "Seismic Activity", cacheField: null },
      { key: "heatmap_shipping", label: "Shipping Density", cacheField: null },
      { key: "heatmap_air", label: "Air Traffic", cacheField: null },
    ],
  },
];

const hasIonToken = !!import.meta.env.VITE_CESIUM_ION_TOKEN;

export default function LayerManager() {
  const layers = useStore((s) => s.layers);
  const toggle = useStore((s) => s.toggleLayer);
  const isOnline = useStore((s) => s.isOnline);
  const toggleOffline = useStore((s) => s.toggleOfflinePanel);
  const [cacheStats, setCacheStats] = useState(null);

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
        <h2 className="lm-title">Layers</h2>
        <button className="lm-offline-btn" onClick={toggleOffline} title="Manage saved offline areas">
          &#128190; Saved
        </button>
      </div>

      {LAYER_GROUPS.map((group) => (
        <div key={group.label} className="lm-group">
          <h3 className="lm-group-label">{group.label}</h3>
          {group.layers
            .filter((l) => !l.requiresIon || hasIonToken)
            .map((l) => (
              <label
                key={l.key}
                className="lm-layer"
                title={l.key === "sentinel2" ? "Add asset 3954 to your Cesium Ion account first: ion.cesium.com/assetdepot" : undefined}
              >
              <input
                type="checkbox"
                checked={layers[l.key]}
                onChange={() => toggle(l.key)}
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
          ))}
        </div>
      ))}

      <style>{`
        .layer-manager {
          width: 230px;
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
        .lm-layer {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 0;
          cursor: pointer;
        }
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
      `}</style>
    </aside>
  );
}
