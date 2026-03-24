import React, { useState } from "react";

const LEGEND_ITEMS = [
  { key: "cluster", label: "White numbers", desc: "Count of markers at same/nearby location. Click to see the list; click an item for details. Some stay clustered when zoomed in (same spot)." },
  { key: "events", label: "Events", desc: "News & conflict (GDELT/ACLED). Red=conflict, orange=protest, yellow=disaster, blue=news." },
  { key: "wildfire", label: "Wildfire", desc: "NASA FIRMS hotspot." },
  { key: "earthquake", label: "Earthquake", desc: "USGS seismic event." },
  { key: "anomaly", label: "Anomaly", desc: "AI-detected (AIS gaps, loitering, clusters)." },
  { key: "aircraft", label: "Aircraft", desc: "Live position (cyan plane icon)." },
  { key: "ship", label: "Ship", desc: "Live position (yellow ship icon)." },
  { key: "webcam", label: "Webcam", desc: "Camera location (green dot)." },
  { key: "heatmap_fires", label: "Fire density", desc: "Red ellipses = wildfire hotspot density." },
  { key: "heatmap_quakes", label: "Seismic activity", desc: "Yellow ellipses = earthquake density." },
  { key: "heatmap_shipping", label: "Shipping density", desc: "Blue ellipses = ship positions." },
  { key: "heatmap_air", label: "Air traffic", desc: "Cyan ellipses = aircraft positions." },
  { key: "altitude", label: "Altitude (bottom center)", desc: "Camera height above ground." },
];

export default function MapLegend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="map-legend">
      <button
        type="button"
        className="map-legend-toggle"
        onClick={() => setOpen((o) => !o)}
        title={open ? "Hide legend" : "Show legend"}
        aria-expanded={open}
      >
        Legend
      </button>
      {open && (
        <div className="map-legend-content">
          <h3 className="map-legend-title">Map symbols &amp; labels</h3>
          <ul className="map-legend-list">
            {LEGEND_ITEMS.map((item) => (
              <li key={item.key} className="map-legend-item">
                <strong>{item.label}</strong> — {item.desc}
              </li>
            ))}
          </ul>
          <h3 className="map-legend-title" style={{ marginTop: 12 }}>How conflicts &amp; events work</h3>
          <p className="map-legend-desc">
            <strong>GDELT</strong> and <strong>ACLED</strong> feed the Events layer. Workers poll GDELT (15 min) and ACLED (with API key), insert into the <code>events</code> table, and the API serves GeoJSON. GlobeViewer renders each event as a marker.
          </p>
          <p className="map-legend-desc">
            <strong>Same article, multiple markers:</strong> GDELT extracts many &quot;events&quot; from one article (e.g. different actors, locations). Each gets its own row and marker. If they share the same city-level location, they cluster and all link to the same source article.
          </p>
          <p className="map-legend-note">
            Cesium Ion limits: check usage at{" "}
            <a href="https://ion.cesium.com/tokens" target="_blank" rel="noopener noreferrer">
              ion.cesium.com/tokens
            </a>
            . Free tier: ~75K tiles/month. Terrain/imagery may fail when exceeded.
          </p>
        </div>
      )}
      <style>{`
        .map-legend {
          position: absolute;
          bottom: 100px;
          left: 8px;
          z-index: 10;
          font-size: 12px;
        }
        .map-legend-toggle {
          padding: 6px 12px;
          background: rgba(0,0,0,0.7);
          color: white;
          border: 1px solid rgba(255,255,255,0.3);
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        }
        .map-legend-toggle:hover { background: rgba(0,0,0,0.85); }
        .map-legend-content {
          margin-top: 6px;
          padding: 12px;
          background: rgba(0,0,0,0.85);
          color: #eee;
          border-radius: 6px;
          max-width: 320px;
          max-height: 70vh;
          overflow-y: auto;
        }
        .map-legend-title { font-size: 13px; margin: 0 0 8px 0; }
        .map-legend-list { margin: 0; padding-left: 18px; }
        .map-legend-item { margin-bottom: 6px; }
        .map-legend-desc { font-size: 11px; color: #ccc; margin: 0 0 8px 0; line-height: 1.4; }
        .map-legend-desc code { font-size: 10px; }
        .map-legend-note {
          margin-top: 12px;
          padding-top: 8px;
          border-top: 1px solid rgba(255,255,255,0.2);
          font-size: 11px;
          color: #aaa;
        }
        .map-legend-note a { color: #60a5fa; }
      `}</style>
    </div>
  );
}
