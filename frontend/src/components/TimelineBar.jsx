import React, { useState, useCallback } from "react";
import { JulianDate } from "cesium";
import { useStore } from "../hooks/useStore";

const YEAR_MIN = 2015;
const YEAR_MAX = new Date().getFullYear();

export default function TimelineBar({ viewerRef }) {
  const setTimeRange = useStore((s) => s.setTimeRange);
  const [value, setValue] = useState(100);

  const handleChange = useCallback(
    (e) => {
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
    [setTimeRange, viewerRef]
  );

  const displayDate = () => {
    const totalMonths = (YEAR_MAX - YEAR_MIN) * 12;
    const monthOffset = Math.round((value / 100) * totalMonths);
    const d = new Date(YEAR_MIN, monthOffset, 1);
    return d.toLocaleDateString("en-GB", { year: "numeric", month: "short" });
  };

  return (
    <div className="timeline-bar">
      <span className="tl-label">{YEAR_MIN}</span>
      <input
        type="range"
        className="tl-slider"
        min="0"
        max="100"
        step="0.5"
        value={value}
        onChange={handleChange}
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
