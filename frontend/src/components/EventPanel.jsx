import React, { useEffect, useState } from "react";
import { useStore } from "../hooks/useStore";
import { offlineApi } from "../services/offlineApi";

export default function EventPanel() {
  const event = useStore((s) => s.selectedEvent);
  const selectEvent = useStore((s) => s.selectEvent);
  const openGallery = useStore((s) => s.openGallery);
  const [snapshots, setSnapshots] = useState([]);

  useEffect(() => {
    if (!event?.id) return;
    offlineApi.getEventTimeline(event.id).then(setSnapshots).catch(() => setSnapshots([]));
  }, [event?.id]);

  if (!event) return null;

  return (
    <aside className="event-panel panel">
      <div className="ep-header">
        <h2 className="ep-title">{event.title || event.event_type}</h2>
        <button className="ep-close" onClick={() => selectEvent(null)}>&times;</button>
      </div>

      <div className="ep-meta">
        <div className="ep-row"><span>Type</span><span>{event.event_type}</span></div>
        <div className="ep-row"><span>Source</span><span>{event.source}</span></div>
        <div className="ep-row"><span>Severity</span><span>{event.severity ?? "—"}</span></div>
        <div className="ep-row"><span>Time</span><span>{new Date(event.occurred_at).toLocaleString()}</span></div>
      </div>

      {event.description && <p className="ep-desc">{event.description}</p>}

      {snapshots.length > 0 && (
        <div className="ep-snapshots">
          <h3 className="ep-snap-title">Snapshots ({snapshots.length})</h3>
          <div className="ep-snap-grid">
            {snapshots.map((s) => (
              <div
                key={s.id}
                className="ep-snap-thumb"
                onClick={() => openGallery(snapshots)}
              >
                <img src={s.thumbnail_url || s.image_url} alt="snapshot" />
                <span className="ep-snap-time">
                  {new Date(s.captured_at).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .event-panel {
          width: 300px;
          overflow-y: auto;
          flex-shrink: 0;
          border-left: 1px solid var(--border);
          border-radius: 0;
          font-size: 13px;
        }
        .ep-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .ep-title { font-size: 15px; font-weight: 600; }
        .ep-close {
          background: none;
          color: var(--text-secondary);
          font-size: 20px;
          padding: 0 4px;
        }
        .ep-meta { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
        .ep-row {
          display: flex;
          justify-content: space-between;
          color: var(--text-secondary);
        }
        .ep-row span:last-child { color: var(--text-primary); font-weight: 500; }
        .ep-desc {
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.5;
          margin-bottom: 12px;
        }
        .ep-snap-title {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }
        .ep-snap-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .ep-snap-thumb {
          position: relative;
          border-radius: 4px;
          overflow: hidden;
          cursor: pointer;
          aspect-ratio: 16/10;
          background: var(--bg-hover);
        }
        .ep-snap-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .ep-snap-time {
          position: absolute;
          bottom: 2px;
          right: 4px;
          font-size: 10px;
          background: rgba(0,0,0,0.7);
          color: white;
          padding: 1px 4px;
          border-radius: 2px;
        }
      `}</style>
    </aside>
  );
}
