import React, { useState, useCallback } from "react";
import { JulianDate } from "cesium";
import { useStore } from "../hooks/useStore";

const YEAR_MIN = 2015;
const YEAR_MAX = new Date().getFullYear();

const PRESETS = [
  { key: "24h", label: "24h", hours: 24 },
  { key: "7d", label: "7d", hours: 24 * 7 },
  { key: "30d", label: "30d", hours: 24 * 30 },
];

export default function TimelineBar({ viewerRef }) {
  const setTimeRange = useStore((s) => s.setTimeRange);
  const timePreset = useStore((s) => s.timePreset);
  const setTimePreset = useStore((s) => s.setTimePreset);
  const [value, setValue] = useState(100);

  const applyPreset = useCallback(
    (preset) => {
      setTimePreset(preset.key);
      const now = new Date();
      const start = new Date(now.getTime() - preset.hours * 60 * 60 * 1000);
      setTimeRange(start.toISOString(), now.toISOString());
      const viewer = viewerRef?.current?.viewer;
      if (viewer) {
        viewer.clock.currentTime = JulianDate.fromDate(now);
        viewer.scene.requestRender();
      }
    },
    [setTimeRange, setTimePreset, viewerRef]
  );

  const handleChange = useCallback(
    (e) => {
      setTimePreset(null);
      const pct = Number(e.target.value);
      setValue(pct);

      const totalMonths = (YEAR_MAX - YEAR_MIN) * 12;
      const monthOffset = Math.round((pct / 100) * totalMonths);
      const date = new Date(YEAR_MIN, monthOffset, 1);
      const dateEnd = new Date(YEAR_MIN, monthOffset + 1, 0);

      setTimeRange(date.toISOString(), dateEnd.toISOString());

      const viewer = viewerRef?.current?.viewer;
      if (viewer) {
        viewer.clock.currentTime = JulianDate.fromDate(date);
        viewer.scene.requestRender();
      }
    },
    [setTimeRange, setTimePreset, viewerRef]
  );

  const displayDate = () => {
    if (timePreset) return PRESETS.find((p) => p.key === timePreset)?.label || timePreset;
    const totalMonths = (YEAR_MAX - YEAR_MIN) * 12;
    const monthOffset = Math.round((value / 100) * totalMonths);
    const d = new Date(YEAR_MIN, monthOffset, 1);
    return d.toLocaleDateString("en-GB", { year: "numeric", month: "short" });
  };

  return (
    <div className="timeline-bar" role="region" aria-label="Map time range">
      <span className="tl-heading">Time range</span>
      <div className="tl-presets">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`tl-preset ${timePreset === p.key ? "active" : ""}`}
            onClick={() => applyPreset(p)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <span className="tl-label">{YEAR_MIN}</span>
      <input
        type="range"
        className="tl-slider"
        min="0"
        max="100"
        step="0.5"
        value={value}
        onChange={handleChange}
        aria-label="Time range slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={displayDate()}
      />
      <span className="tl-label">{YEAR_MAX}</span>
      <span className="tl-current">{displayDate()}</span>

      <style>{`
        .timeline-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 16px;
          background: var(--bg-panel);
          border-top: 1px solid var(--border);
          flex-shrink: 0;
        }
        .tl-heading {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-secondary);
          flex-shrink: 0;
        }
        .tl-presets { display: flex; gap: 4px; }
        .tl-preset {
          padding: 4px 10px;
          font-size: 11px;
          border-radius: 4px;
          background: var(--bg-hover);
          color: var(--text-secondary);
          border: 1px solid var(--border);
          cursor: pointer;
        }
        .tl-preset:hover { background: var(--accent); color: white; }
        .tl-preset.active { background: var(--accent); color: white; }
        .tl-slider {
          flex: 1;
          accent-color: var(--accent);
          height: 4px;
        }
        .tl-label {
          font-size: 11px;
          color: var(--text-secondary);
          min-width: 36px;
        }
        .tl-current {
          font-size: 12px;
          font-weight: 600;
          color: var(--accent);
          min-width: 80px;
          text-align: right;
        }
      `}</style>
    </div>
  );
}
