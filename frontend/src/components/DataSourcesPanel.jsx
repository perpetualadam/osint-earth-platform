import React, { useState } from "react";

const FEEDS = [
  { name: "GDELT", desc: "Global news & event CSV exports", cadence: "~15 min worker interval", link: "https://www.gdeltproject.org/" },
  { name: "ACLED", desc: "Armed conflict events (optional API key)", cadence: "With EVENT worker", link: "https://acleddata.com/" },
  { name: "UCDP GED", desc: "Uppsala georeferenced violence events", cadence: "UCDP_POLL_HOURS (default 24h)", link: "https://ucdp.uu.se/" },
  { name: "NASA FIRMS", desc: "Wildfire thermal hotspots", cadence: "WILDFIRE_POLL_MINUTES", link: "https://firms.modaps.eosdis.nasa.gov/" },
  { name: "USGS", desc: "Earthquake feed", cadence: "EARTHQUAKE_POLL_MINUTES", link: "https://earthquake.usgs.gov/" },
  { name: "OpenSky / AIS", desc: "Aircraft & ship tracks", cadence: "AIRCRAFT_POLL_SECONDS / SHIP_POLL_SECONDS", link: "https://opensky-network.org/" },
  { name: "Telegram", desc: "Channel posts (geocoded)", cadence: "Real-time + TELEGRAM_HISTORY_DAYS backfill", link: "https://telegram.org/" },
  { name: "Webcams", desc: "Windy / OpenWebcamDB where configured", cadence: "WEBCAM_POLL_HOURS", link: null },
  { name: "Context layers", desc: "Borders, airports, ports, etc.", cadence: "Static GeoJSON under backend/data/context", link: null },
  { name: "Territorial overlays", desc: "Line-of-control / disputed areas (time-sliced)", cadence: "GeoJSON under backend/data/territorial", link: null },
  { name: "AI anomalies", desc: "Cluster / AIS / loiter scan", cadence: "Manual Scan + AI service", link: null },
];

export default function DataSourcesPanel({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="dsp-backdrop" role="dialog" aria-labelledby="dsp-title">
      <div className="dsp-panel panel">
        <div className="dsp-header">
          <h2 id="dsp-title">Data sources</h2>
          <button type="button" className="dsp-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <p className="dsp-intro">
          Ingestion cadence comes from worker env (see <code>.env.example</code>). This UI reads from your database after workers run.
        </p>
        <ul className="dsp-list">
          {FEEDS.map((f) => (
            <li key={f.name} className="dsp-item">
              <strong>{f.name}</strong>
              {f.link ? (
                <>
                  {" "}
                  —{" "}
                  <a href={f.link} target="_blank" rel="noopener noreferrer">
                    website
                  </a>
                </>
              ) : null}
              <div className="dsp-desc">{f.desc}</div>
              <div className="dsp-cadence">{f.cadence}</div>
            </li>
          ))}
        </ul>
      </div>
      <style>{`
        .dsp-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.55);
          z-index: 200;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 48px 16px;
          overflow-y: auto;
        }
        .dsp-panel {
          width: min(520px, 100%);
          max-height: min(80vh, 720px);
          overflow-y: auto;
          padding: 16px 20px;
          border-radius: 8px;
        }
        .dsp-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        .dsp-header h2 { margin: 0; font-size: 17px; }
        .dsp-close {
          background: none;
          border: none;
          font-size: 22px;
          cursor: pointer;
          color: var(--text-secondary);
          line-height: 1;
        }
        .dsp-close:hover { color: var(--text-primary); }
        .dsp-intro {
          font-size: 12px;
          color: var(--text-secondary);
          margin: 0 0 14px 0;
          line-height: 1.45;
        }
        .dsp-list { margin: 0; padding: 0; list-style: none; }
        .dsp-item {
          padding: 10px 0;
          border-bottom: 1px solid var(--border);
          font-size: 13px;
        }
        .dsp-item:last-child { border-bottom: none; }
        .dsp-desc { color: var(--text-secondary); font-size: 12px; margin-top: 4px; }
        .dsp-cadence { font-size: 11px; color: var(--accent); margin-top: 4px; }
        .dsp-panel a { color: #60a5fa; }
      `}</style>
    </div>
  );
}

export function useDataSourcesPanel() {
  const [open, setOpen] = useState(false);
  return { open, setOpen, toggle: () => setOpen((o) => !o) };
}
