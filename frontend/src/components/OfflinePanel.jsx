import React, { useEffect, useState, useCallback, useRef } from "react";
import { useStore } from "../hooks/useStore";
import { getPinnedRegions } from "../services/localDb";
import {
  pinRegionOffline,
  removeOfflineRegion,
  estimateStorageUsage,
  estimateRegionSize,
  exportRegionData,
  importRegionData,
  getCacheStats,
  clearAllCaches,
} from "../services/offlineManager";

export default function OfflinePanel() {
  const togglePanel = useStore((s) => s.toggleOfflinePanel);
  const [regions, setRegions] = useState([]);
  const [storage, setStorage] = useState({ used: 0, quota: 0 });
  const [stats, setStats] = useState(null);
  const [downloading, setDownloading] = useState(null);
  const [progress, setProgress] = useState({ done: 0, total: 0, phase: "" });
  const [estimate, setEstimate] = useState(null);
  const fileRef = useRef(null);

  const refresh = useCallback(async () => {
    setRegions(await getPinnedRegions());
    setStorage(await estimateStorageUsage());
    setStats(await getCacheStats());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for progress messages from Service Worker
  useEffect(() => {
    const handler = (event) => {
      if (event.data?.type === "CACHE_PROGRESS") {
        setProgress((p) => ({ ...p, done: event.data.completed, total: event.data.total }));
      }
    };
    navigator.serviceWorker?.addEventListener("message", handler);
    return () => navigator.serviceWorker?.removeEventListener("message", handler);
  }, []);

  const handleEstimate = async () => {
    const bboxStr = prompt("Bounding box (west,south,east,north):", "-10,35,30,60");
    if (!bboxStr) return;
    const bbox = bboxStr.split(",").map(Number);
    const est = await estimateRegionSize(bbox);
    setEstimate(est);
  };

  const handlePin = async () => {
    const name = prompt("Region name:");
    if (!name) return;
    const bboxStr = prompt("Bounding box (west,south,east,north):", "-10,35,30,60");
    if (!bboxStr) return;
    const bbox = bboxStr.split(",").map(Number);
    const timeStart = prompt("Start date (YYYY-MM-DD, leave blank for all):", "") || null;
    const timeEnd = prompt("End date (YYYY-MM-DD, leave blank for all):", "") || null;

    setDownloading(name);
    setProgress({ done: 0, total: 0, phase: "tiles" });
    try {
      await pinRegionOffline(name, bbox, timeStart, timeEnd, (done, total, phase) => {
        setProgress({ done, total, phase: phase || "downloading" });
      });
    } catch (err) {
      console.error("Pin region error:", err);
      alert("Failed to pin region: " + err.message);
    }
    setDownloading(null);
    setEstimate(null);
    refresh();
  };

  const handleRemove = async (id) => {
    if (!confirm("Remove this offline region?")) return;
    await removeOfflineRegion(id);
    refresh();
  };

  const handleExport = async (region) => {
    const success = await exportRegionData(
      region.bbox,
      region.time_start,
      region.time_end
    );
    if (!success) alert("Export failed. Server may be unreachable.");
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importRegionData(file);
      alert("Import successful.");
      refresh();
    } catch (err) {
      alert("Import failed: " + err.message);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleClearAll = async () => {
    if (!confirm("Clear all cached offline data? Pinned region records will be kept.")) return;
    await clearAllCaches();
    const allCacheNames = await caches.keys();
    for (const name of allCacheNames) {
      if (name.startsWith("osint-")) await caches.delete(name);
    }
    refresh();
  };

  const fmtBytes = (b) => {
    if (!b) return "0 KB";
    if (b > 1e9) return (b / 1e9).toFixed(1) + " GB";
    if (b > 1e6) return (b / 1e6).toFixed(1) + " MB";
    return (b / 1e3).toFixed(0) + " KB";
  };

  const pctUsed = storage.quota ? ((storage.used / storage.quota) * 100).toFixed(1) : 0;

  return (
    <div className="op-overlay" onClick={togglePanel}>
      <div className="op-panel panel" onClick={(e) => e.stopPropagation()}>
        <div className="op-header">
          <h2>Offline Areas</h2>
          <button className="op-close" onClick={togglePanel}>&times;</button>
        </div>

        {/* Storage bar */}
        <div className="op-storage">
          <div className="op-storage-bar">
            <div className="op-storage-fill" style={{ width: `${Math.min(pctUsed, 100)}%` }} />
          </div>
          <span className="op-storage-label">
            {fmtBytes(storage.used)} / {fmtBytes(storage.quota)} ({pctUsed}%)
          </span>
        </div>

        {/* Cache stats */}
        {stats && (
          <div className="op-stats">
            <span>{stats.events} events</span>
            <span>{stats.tracks} tracks</span>
            <span>{stats.environmental} env</span>
            <span>{stats.snapshots} snaps</span>
            <span>{stats.webcams} cams</span>
            {stats.pending_sync > 0 && (
              <span className="op-pending">{stats.pending_sync} pending sync</span>
            )}
          </div>
        )}

        {/* Download progress */}
        {downloading && (
          <div className="op-progress">
            <div className="op-progress-label">
              Downloading "{downloading}" — {progress.phase}
            </div>
            <div className="op-progress-bar">
              <div
                className="op-progress-fill"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            <span className="op-progress-text">{progress.done} / {progress.total}</span>
          </div>
        )}

        {/* Estimate display */}
        {estimate && (
          <div className="op-estimate">
            Estimated: {estimate.tile_count.toLocaleString()} tiles (~{estimate.estimated_mb} MB)
          </div>
        )}

        {/* Region list */}
        <div className="op-list">
          {regions.map((r) => (
            <div key={r._id} className="op-region">
              <div className="op-region-info">
                <strong>{r.name || "Unnamed"}</strong>
                <span className={`op-status ${r.status}`}>{r.status}</span>
                {r.size_bytes > 0 && (
                  <span className="op-size">{fmtBytes(r.size_bytes)}</span>
                )}
                {r.last_synced && (
                  <span className="op-synced">
                    Synced: {new Date(r.last_synced).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="op-region-actions">
                {r.status === "ready" && (
                  <button className="op-export-btn" onClick={() => handleExport(r)} title="Export">
                    Export
                  </button>
                )}
                <button className="op-remove" onClick={() => handleRemove(r._id)}>Remove</button>
              </div>
            </div>
          ))}
          {!regions.length && <div className="op-empty">No offline areas saved.</div>}
        </div>

        {/* Actions */}
        <div className="op-actions">
          <button className="op-btn op-btn-primary" onClick={handlePin}>+ Pin New Region</button>
          <button className="op-btn op-btn-secondary" onClick={handleEstimate}>Estimate Size</button>
        </div>

        <div className="op-actions">
          <label className="op-btn op-btn-secondary op-import-label">
            Import Archive
            <input type="file" accept=".json,.zip" ref={fileRef} onChange={handleImport} hidden />
          </label>
          <button className="op-btn op-btn-danger" onClick={handleClearAll}>Clear All Cache</button>
        </div>
      </div>

      <style>{`
        .op-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.6);
          z-index: 900;
          display: flex; align-items: center; justify-content: center;
        }
        .op-panel {
          width: 460px; max-height: 80vh;
          overflow-y: auto; padding: 20px;
        }
        .op-header {
          display: flex; justify-content: space-between;
          align-items: center; margin-bottom: 14px;
        }
        .op-header h2 { font-size: 16px; }
        .op-close { background: none; color: var(--text-secondary); font-size: 22px; }

        .op-storage { margin-bottom: 10px; }
        .op-storage-bar {
          height: 6px; background: var(--bg-hover); border-radius: 3px;
          overflow: hidden; margin-bottom: 4px;
        }
        .op-storage-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.3s; }
        .op-storage-label { font-size: 11px; color: var(--text-secondary); }

        .op-stats {
          display: flex; flex-wrap: wrap; gap: 8px;
          font-size: 11px; color: var(--text-secondary);
          margin-bottom: 12px; padding: 8px;
          background: var(--bg-hover); border-radius: 6px;
        }
        .op-pending { color: var(--warning); font-weight: 600; }

        .op-progress { margin-bottom: 12px; }
        .op-progress-label { font-size: 12px; color: var(--accent); margin-bottom: 4px; }
        .op-progress-bar {
          height: 4px; background: var(--bg-hover); border-radius: 2px;
          overflow: hidden; margin-bottom: 4px;
        }
        .op-progress-fill { height: 100%; background: var(--accent); transition: width 0.2s; }
        .op-progress-text { font-size: 11px; color: var(--text-secondary); }

        .op-estimate {
          font-size: 12px; color: var(--warning);
          background: rgba(245,158,11,0.1);
          padding: 8px; border-radius: 6px; margin-bottom: 12px;
        }

        .op-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
        .op-region {
          display: flex; justify-content: space-between; align-items: center;
          padding: 10px; background: var(--bg-hover); border-radius: 6px; font-size: 13px;
        }
        .op-region-info { display: flex; flex-direction: column; gap: 3px; }
        .op-region-actions { display: flex; gap: 6px; }
        .op-status {
          font-size: 10px; padding: 2px 6px;
          border-radius: 3px; text-transform: uppercase; font-weight: 600;
          display: inline-block; width: fit-content;
        }
        .op-status.ready { background: var(--success); color: white; }
        .op-status.pending { background: var(--warning); color: black; }
        .op-status.downloading { background: var(--accent); color: white; }
        .op-status.error { background: var(--danger); color: white; }
        .op-size { font-size: 11px; color: var(--text-secondary); }
        .op-synced { font-size: 10px; color: var(--text-secondary); }
        .op-export-btn {
          background: var(--bg-panel); color: var(--accent);
          padding: 4px 10px; border-radius: 4px; font-size: 11px;
          border: 1px solid var(--accent);
        }
        .op-remove {
          background: var(--danger); color: white;
          padding: 4px 10px; border-radius: 4px; font-size: 11px;
        }
        .op-empty { color: var(--text-secondary); font-size: 13px; text-align: center; padding: 20px; }

        .op-actions { display: flex; gap: 8px; margin-bottom: 8px; }
        .op-btn {
          flex: 1; padding: 10px; border-radius: 6px; font-size: 13px;
          font-weight: 600; text-align: center;
        }
        .op-btn-primary { background: var(--accent); color: white; }
        .op-btn-primary:hover { background: var(--accent-hover); }
        .op-btn-secondary { background: var(--bg-hover); color: var(--text-primary); }
        .op-btn-secondary:hover { background: var(--border); }
        .op-btn-danger { background: transparent; color: var(--danger); border: 1px solid var(--danger); }
        .op-btn-danger:hover { background: var(--danger); color: white; }
        .op-import-label { cursor: pointer; }
      `}</style>
    </div>
  );
}
