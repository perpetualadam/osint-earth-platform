import React from "react";
import { useStore } from "../hooks/useStore";

export default function SnapshotGallery() {
  const show = useStore((s) => s.showGallery);
  const snapshots = useStore((s) => s.gallerySnapshots);
  const close = useStore((s) => s.closeGallery);

  if (!show || !snapshots.length) return null;

  return (
    <div className="sg-overlay" onClick={close}>
      <div className="sg-container" onClick={(e) => e.stopPropagation()}>
        <div className="sg-header">
          <h2>Event Snapshots</h2>
          <button className="sg-close" onClick={close}>&times;</button>
        </div>
        <div className="sg-grid">
          {snapshots.map((s) => (
            <div key={s.id} className="sg-card">
              <img src={s.image_url} alt={s.detection_type || "snapshot"} className="sg-img" />
              <div className="sg-info">
                <span className="sg-type">{s.detection_type || "capture"}</span>
                {s.confidence != null && (
                  <span className="sg-conf">{(s.confidence * 100).toFixed(0)}%</span>
                )}
                <span className="sg-time">{new Date(s.captured_at).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .sg-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.8);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .sg-container {
          background: var(--bg-panel);
          border: 1px solid var(--border);
          border-radius: 12px;
          width: 90vw;
          max-width: 900px;
          max-height: 80vh;
          overflow-y: auto;
          padding: 20px;
        }
        .sg-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .sg-header h2 { font-size: 16px; }
        .sg-close {
          background: none;
          color: var(--text-secondary);
          font-size: 24px;
        }
        .sg-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 12px;
        }
        .sg-card {
          border-radius: 8px;
          overflow: hidden;
          background: var(--bg-hover);
        }
        .sg-img {
          width: 100%;
          aspect-ratio: 16/10;
          object-fit: cover;
          display: block;
        }
        .sg-info {
          padding: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          font-size: 11px;
        }
        .sg-type {
          background: var(--accent);
          color: white;
          padding: 2px 6px;
          border-radius: 3px;
          text-transform: uppercase;
          font-weight: 600;
        }
        .sg-conf { color: var(--success); font-weight: 600; }
        .sg-time { color: var(--text-secondary); margin-left: auto; }
      `}</style>
    </div>
  );
}
