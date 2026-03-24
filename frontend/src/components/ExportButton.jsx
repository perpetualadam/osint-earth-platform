import React, { useState } from "react";
import { api } from "../services/api";
import { useStore } from "../hooks/useStore";

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ExportButton({ viewerRef }) {
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState("csv");
  const timeStart = useStore((s) => s.timeStart);
  const timeEnd = useStore((s) => s.timeEnd);
  const eventFilters = useStore((s) => s.eventFilters);

  const handleExport = async () => {
    setExporting(true);
    try {
      const bbox = viewerRef?.current?.getViewBounds?.() ?? "-180,-90,180,90";
      const params = {
        limit: 5000,
        bbox,
        time_start: timeStart,
        time_end: timeEnd,
        dedupe: eventFilters.dedupe ? "1" : "0",
      };
      if (eventFilters.event_type) params.event_type = eventFilters.event_type;
      if (eventFilters.source) params.source = eventFilters.source;

      const geojson = await api.getEvents(params);
      const features = geojson.features || [];

      if (format === "geojson") {
        const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/json" });
        downloadBlob(blob, `osint-events-${Date.now()}.geojson`);
      } else {
        const headers = ["id", "event_type", "title", "lat", "lon", "occurred_at", "source", "merged_count"];
        const rows = features.map((f) => {
          const p = f.properties || {};
          const coords = f.geometry?.coordinates || [];
          return [
            p.id,
            p.event_type,
            (p.title || "").replace(/"/g, '""'),
            coords[1] ?? "",
            coords[0] ?? "",
            p.occurred_at ?? "",
            p.source ?? "",
            p.merged_count ?? "",
          ];
        });
        const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        downloadBlob(blob, `osint-events-${Date.now()}.csv`);
      }
    } catch (err) {
      console.warn("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="export-btn-wrap">
      <select
        className="export-format"
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        aria-label="Export format"
      >
        <option value="csv">CSV</option>
        <option value="geojson">GeoJSON</option>
      </select>
      <button
        type="button"
        className="export-btn"
        onClick={handleExport}
        disabled={exporting}
        title="Export visible events"
        aria-label="Export events"
      >
        {exporting ? "Exporting…" : "Export"}
      </button>
      <style>{`
        .export-btn-wrap { display: flex; gap: 4px; }
        .export-format {
          padding: 4px 8px;
          font-size: 11px;
          border-radius: 4px;
          background: var(--bg-hover);
          color: var(--text);
          border: 1px solid var(--border);
        }
        .export-btn {
          padding: 4px 10px;
          font-size: 11px;
          border-radius: 4px;
          background: var(--accent);
          color: white;
          border: none;
          cursor: pointer;
        }
        .export-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
