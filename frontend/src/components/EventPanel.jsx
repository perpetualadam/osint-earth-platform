import React, { useEffect, useState } from "react";
import { useStore } from "../hooks/useStore";
import { offlineApi } from "../services/offlineApi";
import { api } from "../services/api";

function TelegramPostDetail({ data, onClose }) {
  const ch = data.channel_username || "channel";
  const body = data.text_en || data.text || "—";
  const posted = data.posted_at
    ? new Date(data.posted_at).toLocaleString()
    : "—";
  return (
    <aside className="event-panel panel ep-telegram-detail">
      <div className="ep-header">
        <h2 className="ep-title">@{ch}</h2>
        <button type="button" className="ep-close" onClick={onClose}>&times;</button>
      </div>
      <div className="ep-type-badge ep-badge-telegram">Telegram</div>
      <div className="ep-meta">
        <div className="ep-row"><span>Posted</span><span>{posted}</span></div>
        {data.geo_confidence != null && (
          <div className="ep-row"><span>Geo confidence</span><span>{Number(data.geo_confidence).toFixed(2)}</span></div>
        )}
        <div className="ep-desc" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{body}</div>
        {data.text_en && data.text && data.text !== data.text_en && (
          <details className="ep-desc" style={{ marginTop: 8 }}>
            <summary>Original text</summary>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{data.text}</div>
          </details>
        )}
      </div>
      <style>{`
        .ep-telegram-detail .ep-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
          margin-bottom: 12px;
        }
        .ep-telegram-detail .ep-title { font-size: 15px; font-weight: 600; word-break: break-word; }
        .ep-telegram-detail .ep-close {
          flex-shrink: 0;
          background: none;
          border: none;
          font-size: 22px;
          line-height: 1;
          cursor: pointer;
          color: var(--text-secondary);
          padding: 0 4px;
        }
        .ep-telegram-detail .ep-close:hover { color: var(--text-primary); }
        .ep-telegram-detail .ep-meta { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
        .ep-telegram-detail .ep-row {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          font-size: 12px;
          color: var(--text-secondary);
        }
        .ep-telegram-detail .ep-row span:last-child { color: var(--text-primary); font-weight: 500; }
        .ep-telegram-detail .ep-desc { font-size: 12px; color: var(--text-secondary); }
        .ep-telegram-detail .ep-type-badge {
          display: inline-block;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          padding: 3px 8px;
          border-radius: 4px;
          margin-bottom: 12px;
        }
        .ep-telegram-detail .ep-badge-telegram { background: #38bdf822; color: #38bdf8; border: 1px solid #38bdf844; }
      `}</style>
    </aside>
  );
}

function AircraftDetail({ data, onClose }) {
  const [typeInfo, setTypeInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!data.icao24) return;
    setLoading(true);
    api.getAircraftType(data.icao24)
      .then(setTypeInfo)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [data.icao24]);

  const typeName = typeInfo?.manufacturer && typeInfo?.type
    ? `${typeInfo.manufacturer} ${typeInfo.type}`
    : null;
  const badgeLabel = typeName || data.category || "Aircraft";
  const usage = typeInfo?.usage || "";
  const usageBadgeClass = {
    Military: "ep-badge-military",
    Government: "ep-badge-government",
    Commercial: "ep-badge-commercial",
    Private: "ep-badge-private",
  }[usage] || "";

  return (
    <aside className="event-panel panel">
      <div className="ep-header">
        <h2 className="ep-title">{data.callsign || data.icao24}</h2>
        <button className="ep-close" onClick={onClose}>&times;</button>
      </div>
      <div className="ep-badge-row">
        <div className="ep-type-badge ep-badge-aircraft">{badgeLabel}</div>
        {usage && <div className={`ep-type-badge ${usageBadgeClass}`}>{usage}</div>}
      </div>
      <div className="ep-meta">
        <div className="ep-row ep-row-highlight">
          <span>Aircraft</span>
          <span>{loading ? "Looking up..." : (typeName || "Unknown")}</span>
        </div>
        {typeInfo?.registration && (
          <div className="ep-row ep-row-highlight">
            <span>Registration</span><span>{typeInfo.registration}</span>
          </div>
        )}
        {typeInfo?.operator && (
          <div className="ep-row ep-row-highlight">
            <span>Operator</span><span>{typeInfo.operator}</span>
          </div>
        )}
        <div className="ep-row"><span>ICAO24</span><span>{data.icao24}</span></div>
        <div className="ep-row"><span>Callsign</span><span>{data.callsign || "—"}</span></div>
        {typeInfo?.icao_type && <div className="ep-row"><span>Type Code</span><span>{typeInfo.icao_type}</span></div>}
        {data.origin_country && <div className="ep-row"><span>Country</span><span>{data.origin_country}</span></div>}
        {data.category && <div className="ep-row"><span>Category</span><span>{data.category}</span></div>}
        <div className="ep-row"><span>Altitude</span><span>{data.altitude != null ? `${Math.round(data.altitude).toLocaleString()} m / ${Math.round(data.altitude * 3.281).toLocaleString()} ft` : "—"}</span></div>
        <div className="ep-row"><span>Speed</span><span>{data.velocity != null ? `${Math.round(data.velocity * 1.944)} kts / ${Math.round(data.velocity * 3.6)} km/h / ${Math.round(data.velocity * 2.237)} mph` : "—"}</span></div>
        {data.vertical_rate != null && data.vertical_rate !== 0 && (
          <div className="ep-row"><span>Climb Rate</span><span>{Math.round(data.vertical_rate * 196.85)} ft/min</span></div>
        )}
        <div className="ep-row"><span>Heading</span><span>{data.heading != null ? `${Math.round(data.heading)}°` : "—"}</span></div>
        {data.squawk && <div className="ep-row"><span>Squawk</span><span>{data.squawk}</span></div>}
        <div className="ep-row"><span>On Ground</span><span>{data.on_ground ? "Yes" : "No"}</span></div>
      </div>
    </aside>
  );
}

function EventDetail({ data, onClose, snapshots, openGallery, selectEvent }) {
  const meta = data.metadata || {};
  const badgeClass = `ep-badge-${data.event_type || "news"}`;
  const label = (data.event_type || "event").replace(/^\w/, (c) => c.toUpperCase());
  const [news, setNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsLangs, setNewsLangs] = useState("english");
  const [newsTranslate, setNewsTranslate] = useState(false);
  const [relatedEvents, setRelatedEvents] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  useEffect(() => {
    if (!data.id) return;
    setNewsLoading(true);
    const params = { langs: newsLangs };
    if (newsTranslate) params.translate = "true";
    api.getEventNews(data.id, params)
      .then((d) => setNews(d.articles || []))
      .catch(() => setNews([]))
      .finally(() => setNewsLoading(false));
  }, [data.id, newsLangs, newsTranslate]);

  useEffect(() => {
    if (data.lat == null || data.lon == null) return;
    const { lat, lon } = data;
    setRelatedLoading(true);
    const pad = 0.5;
    const bbox = [lon - pad, lat - pad, lon + pad, lat + pad].join(",");
    const timeStart = data.occurred_at ? new Date(new Date(data.occurred_at).getTime() - 86400000 * 2).toISOString() : "";
    const timeEnd = data.occurred_at ? new Date(new Date(data.occurred_at).getTime() + 86400000 * 2).toISOString() : "";
    api.getEvents({ bbox, time_start: timeStart, time_end: timeEnd, limit: 10, dedupe: "1" })
      .then((g) => setRelatedEvents((g.features || []).filter((f) => f.properties?.id !== data.id)))
      .catch(() => setRelatedEvents([]))
      .finally(() => setRelatedLoading(false));
  }, [data.id, data.lat, data.lon, data.occurred_at]);

  return (
    <aside className="event-panel panel">
      <div className="ep-header">
        <h2 className="ep-title">{data.title || label}</h2>
        <button className="ep-close" onClick={onClose}>&times;</button>
      </div>
      <div className={`ep-type-badge ${badgeClass}`}>{label}</div>
      <div className="ep-meta">
        {data.merged_count > 1 && (
          <div className="ep-row ep-row-highlight"><span>Merged</span><span>{data.merged_count} events from same article/location</span></div>
        )}
        {meta.location_name && <div className="ep-row"><span>Location</span><span>{meta.location_name}</span></div>}
        {data.source && <div className="ep-row"><span>Source</span><span>{data.source.toUpperCase()}</span></div>}
        {data.occurred_at && <div className="ep-row"><span>Time</span><span>{new Date(data.occurred_at).toLocaleString()}</span></div>}
        {meta.actor1 && <div className="ep-row"><span>Actor 1</span><span>{meta.actor1}</span></div>}
        {meta.actor2 && <div className="ep-row"><span>Actor 2</span><span>{meta.actor2}</span></div>}
        {meta.goldstein != null && <div className="ep-row"><span>Goldstein</span><span>{meta.goldstein}</span></div>}
        {meta.mentions != null && <div className="ep-row"><span>Mentions</span><span>{meta.mentions}</span></div>}
        {meta.country && <div className="ep-row"><span>Country</span><span>{meta.country}</span></div>}
        {meta.country_code && !meta.country && <div className="ep-row"><span>Country</span><span>{meta.country_code}</span></div>}
        {data.severity != null && <div className="ep-row"><span>Fatalities</span><span>{data.severity}</span></div>}
      </div>
      {data.description && <p className="ep-desc">{data.description}</p>}
      {meta.url && (
        <a href={meta.url} target="_blank" rel="noopener noreferrer" className="ep-link">
          Open source article
        </a>
      )}

      <div className="ep-news-options">
        <label>
          <span>Languages:</span>
          <select value={newsLangs} onChange={(e) => setNewsLangs(e.target.value)}>
            <option value="english">English only</option>
            <option value="english,spanish">English + Spanish</option>
            <option value="english,spanish,french">English + Spanish + French</option>
            <option value="english,spanish,french,arabic">+ Arabic</option>
            <option value="english,spanish,french,german,chinese,russian">All major</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={newsTranslate} onChange={(e) => setNewsTranslate(e.target.checked)} />
          Translate to English
        </label>
      </div>
      {newsLoading && <p className="ep-news-loading">Loading related news...</p>}
      {data.lat != null && data.lon != null && (
        <div className="ep-related-section">
          <h3 className="ep-snap-title">Related events nearby</h3>
          {relatedLoading && <p className="ep-news-loading">Loading…</p>}
          {!relatedLoading && relatedEvents.length === 0 && <p className="ep-news-loading">None found</p>}
          {!relatedLoading && relatedEvents.map((f) => {
            const p = f.properties || {};
            const coords = f.geometry?.coordinates || [];
            const ev = { ...p, _layerType: "events", lat: coords[1], lon: coords[0] };
            return (
              <button
                key={p.id}
                type="button"
                className="ep-related-btn"
                onClick={() => selectEvent(ev)}
              >
                <span className="ep-related-title">{p.title || p.event_type || "Event"}</span>
                <span className="ep-related-meta">
                  {p.event_type} · {p.occurred_at ? new Date(p.occurred_at).toLocaleDateString() : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {news.length > 0 && (
        <div className="ep-news-section">
          <h3 className="ep-snap-title">Related News</h3>
          {news.map((article, i) => (
            <a key={i} href={article.url} target="_blank" rel="noopener noreferrer" className="ep-news-card">
              {article.image && <img src={article.image} alt="" className="ep-news-img" onError={(e) => e.target.style.display = "none"} />}
              <div className="ep-news-text">
                <span className="ep-news-title">{article.titleTranslated || article.title}</span>
                {article.titleTranslated && article.title !== article.titleTranslated && (
                  <span className="ep-news-original" title={article.title}>{article.title}</span>
                )}
                <span className="ep-news-domain">{article.domain}{article.language ? ` (${article.language})` : ""}</span>
              </div>
            </a>
          ))}
        </div>
      )}

      {snapshots?.length > 0 && (
        <div className="ep-snapshots">
          <h3 className="ep-snap-title">Snapshots ({snapshots.length})</h3>
          <div className="ep-snap-grid">
            {snapshots.map((s) => (
              <div key={s.id} className="ep-snap-thumb" onClick={() => openGallery(snapshots)}>
                <img src={s.thumbnail_url || s.image_url} alt="snapshot" />
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function WebcamDetail({ data, onClose }) {
  const meta = data.metadata || {};
  const isOwdb = data.source === "openwebcamdb";

  return (
    <aside className="event-panel panel">
      <div className="ep-header">
        <h2 className="ep-title">{data.name || "Webcam"}</h2>
        <button className="ep-close" onClick={onClose}>&times;</button>
      </div>
      <div className="ep-type-badge ep-badge-webcam">Webcam</div>

      {data.thumbnail_url && (
        <img
          src={data.thumbnail_url}
          alt={data.name}
          className="ep-webcam-thumb"
          onError={(e) => e.target.style.display = "none"}
        />
      )}

      <div className="ep-meta">
        {data.country && <div className="ep-row"><span>Country</span><span>{data.country}</span></div>}
        {meta.city && <div className="ep-row"><span>City</span><span>{meta.city}</span></div>}
        {meta.region && <div className="ep-row"><span>Region</span><span>{meta.region}</span></div>}
        {data.camera_type && <div className="ep-row"><span>Type</span><span>{data.camera_type}</span></div>}
        {data.source && <div className="ep-row"><span>Source</span><span>{data.source}</span></div>}
        {meta.categories?.length > 0 && (
          <div className="ep-row"><span>Category</span><span>{meta.categories.join(", ")}</span></div>
        )}
        {meta.view_count > 0 && (
          <div className="ep-row"><span>Views</span><span>{meta.view_count.toLocaleString()}</span></div>
        )}
      </div>

      {meta.description && <p className="ep-desc">{meta.description}</p>}

      {data.stream_url && (
        <a href={data.stream_url} target="_blank" rel="noopener noreferrer" className="ep-link">
          Open live feed
        </a>
      )}

      {isOwdb && (
        <div className="ep-attribution">
          Powered by <a href="https://openwebcamdb.com" target="_blank" rel="noopener noreferrer">OpenWebcamDB.com</a>
        </div>
      )}
    </aside>
  );
}

function EnvironmentalDetail({ data, onClose }) {
  const meta = data.metadata || {};
  const evType = (data.event_type || "wildfire").replace(/^\w/, (c) => c.toUpperCase());
  const badgeClass = data.event_type === "earthquake" ? "ep-badge-disaster" : "ep-badge-conflict";

  return (
    <aside className="event-panel panel">
      <div className="ep-header">
        <h2 className="ep-title">{evType} #{data.id}</h2>
        <button className="ep-close" onClick={onClose}>&times;</button>
      </div>
      <div className={`ep-type-badge ${badgeClass}`}>{evType}</div>
      <div className="ep-meta">
        {data.data_source && <div className="ep-row"><span>Source</span><span>{data.data_source}</span></div>}
        {data.started_at && <div className="ep-row"><span>Started</span><span>{new Date(data.started_at).toLocaleString()}</span></div>}
        {data.severity != null && (
          <div className="ep-row">
            <span>{data.event_type === "earthquake" ? "Magnitude" : "Severity"}</span>
            <span>{data.severity}</span>
          </div>
        )}
        {meta.bright_ti4 && <div className="ep-row"><span>Brightness (K)</span><span>{meta.bright_ti4}</span></div>}
        {meta.frp && <div className="ep-row"><span>FRP (MW)</span><span>{meta.frp}</span></div>}
        {meta.depth && <div className="ep-row"><span>Depth (km)</span><span>{meta.depth}</span></div>}
      </div>
      {meta.url && (
        <a href={meta.url} target="_blank" rel="noopener noreferrer" className="ep-link">
          View source
        </a>
      )}
    </aside>
  );
}

function roundCoord1(x) {
  return Math.round(x * 10) / 10;
}

function AnomalyDetail({ data, onClose, selectEvent }) {
  const meta = data.metadata || {};
  const typeLabel = (data.anomaly_type || "anomaly").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  const timeStart = useStore((s) => s.timeStart);
  const timeEnd = useStore((s) => s.timeEnd);
  const layers = useStore((s) => s.layers);
  const toggleLayer = useStore((s) => s.toggleLayer);

  const [cellState, setCellState] = useState(null);

  useEffect(() => {
    setCellState(null);
  }, [data.id]);

  const loadCellEvents = async () => {
    let lng = data.lon;
    let lat = data.lat;
    if (typeof lng !== "number" || typeof lat !== "number") {
      try {
        const a = await api.getAnomaly(data.id);
        const c = a.geometry?.coordinates;
        if (c?.length >= 2) {
          lng = c[0];
          lat = c[1];
        }
      } catch {
        setCellState({ error: "Could not load anomaly location." });
        return;
      }
    }
    if (typeof lng !== "number" || typeof lat !== "number") {
      setCellState({ error: "No coordinates for this anomaly." });
      return;
    }

    setCellState({ loading: true });
    const half = 0.05;
    const bbox = `${lng - half},${lat - half},${lng + half},${lat + half}`;
    const gridLng = roundCoord1(lng);
    const gridLat = roundCoord1(lat);

    try {
      const fc = await api.getEvents({
        bbox,
        time_start: timeStart,
        time_end: timeEnd,
        limit: 2000,
      });
      const features = (fc.features || []).filter((f) => {
        const coords = f.geometry?.coordinates;
        if (!coords || coords.length < 2) return false;
        return roundCoord1(coords[0]) === gridLng && roundCoord1(coords[1]) === gridLat;
      });
      setCellState({ ok: true, features });
      if (!layers.events) toggleLayer("events");
    } catch (e) {
      setCellState({ error: e.message || "Request failed" });
    }
  };

  const isCluster = data.anomaly_type === "event_cluster";

  return (
    <aside className="event-panel panel">
      <div className="ep-header">
        <h2 className="ep-title">{typeLabel} #{data.id}</h2>
        <button type="button" className="ep-close" onClick={onClose}>&times;</button>
      </div>
      <div className="ep-type-badge ep-badge-anomaly">{typeLabel}</div>
      <div className="ep-meta">
        {data.detection_method && <div className="ep-row"><span>Method</span><span>{data.detection_method}</span></div>}
        {data.score != null && <div className="ep-row"><span>Score</span><span>{data.score.toFixed(2)}</span></div>}
        {data.detected_at && <div className="ep-row"><span>Detected</span><span>{new Date(data.detected_at).toLocaleString()}</span></div>}
        {data.baseline_value != null && <div className="ep-row"><span>Baseline</span><span>{data.baseline_value}</span></div>}
        {data.observed_value != null && <div className="ep-row"><span>Observed</span><span>{data.observed_value}</span></div>}
        {typeof data.lon === "number" && typeof data.lat === "number" && (
          <div className="ep-row"><span>Grid center</span><span>{data.lat.toFixed(1)}°, {data.lon.toFixed(1)}°</span></div>
        )}
      </div>
      {meta.description && <p className="ep-desc">{meta.description}</p>}

      {isCluster && (
        <div className="ep-cell-events">
          <p className="ep-desc ep-cell-hint">
            Load OSINT events in the same 0.1° cell using the map timeline ({new Date(timeStart).toLocaleDateString()} – {new Date(timeEnd).toLocaleDateString()}).
          </p>
          <button type="button" className="ep-cell-load-btn" onClick={loadCellEvents} disabled={cellState?.loading}>
            {cellState?.loading ? "Loading…" : "Load events in this cell"}
          </button>
          {cellState?.error && <p className="ep-cell-error">{cellState.error}</p>}
          {cellState?.ok && (
            <>
              <h3 className="ep-snap-title">Events ({cellState.features.length})</h3>
              {cellState.features.length === 0 ? (
                <p className="ep-desc">None in this cell for the current timeline. Widen the timeline or zoom the time bar.</p>
              ) : (
                <ul className="ep-cluster-list">
                  {cellState.features.map((f) => {
                    const p = f.properties || {};
                    const coords = f.geometry?.coordinates || [];
                    const ev = { ...p, _layerType: "events", lat: coords[1], lon: coords[0] };
                    return (
                      <li key={p.id} className="ep-cluster-item">
                        <button
                          type="button"
                          className="ep-cluster-btn"
                          onClick={() => selectEvent(ev)}
                        >
                          <span className="ep-cluster-label">{p.title || p.event_type || `Event #${p.id}`}</span>
                          <span className="ep-cluster-type">
                            {p.event_type}
                            {p.occurred_at ? ` · ${new Date(p.occurred_at).toLocaleString()}` : ""}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <style>{`
        .ep-cell-events { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border); }
        .ep-cell-hint { margin: 0 0 10px 0; font-size: 11px; line-height: 1.4; }
        .ep-cell-load-btn {
          width: 100%;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border-radius: 4px;
          border: 1px solid var(--border);
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .ep-cell-load-btn:hover:not(:disabled) { background: var(--accent); color: #fff; border-color: var(--accent); }
        .ep-cell-load-btn:disabled { opacity: 0.6; cursor: wait; }
        .ep-cell-error { color: #f87171; font-size: 12px; margin: 8px 0 0 0; }
      `}</style>
    </aside>
  );
}

function ShipDetail({ data, onClose }) {
  const name = data.vessel_name || data.name || "";
  const type = data.vessel_type || data.ship_type || "";
  return (
    <aside className="event-panel panel">
      <div className="ep-header">
        <h2 className="ep-title">{name || data.mmsi}</h2>
        <button className="ep-close" onClick={onClose}>&times;</button>
      </div>
      <div className="ep-type-badge ep-badge-ship">Ship</div>
      <div className="ep-meta">
        <div className="ep-row"><span>MMSI</span><span>{data.mmsi}</span></div>
        {name && <div className="ep-row"><span>Name</span><span>{name}</span></div>}
        {data.imo && <div className="ep-row"><span>IMO</span><span>{data.imo}</span></div>}
        {data.callsign && <div className="ep-row"><span>Callsign</span><span>{data.callsign}</span></div>}
        <div className="ep-row"><span>Speed</span><span>{data.speed != null ? `${data.speed} kn` : "—"}</span></div>
        <div className="ep-row"><span>Course</span><span>{data.course != null ? `${Math.round(data.course)}°` : "—"}</span></div>
        <div className="ep-row"><span>Heading</span><span>{data.heading != null ? `${Math.round(data.heading)}°` : "—"}</span></div>
        {type && <div className="ep-row"><span>Type</span><span>{type}</span></div>}
        {data.destination && <div className="ep-row"><span>Destination</span><span>{data.destination}</span></div>}
      </div>
    </aside>
  );
}

export default function EventPanel() {
  const event = useStore((s) => s.selectedEvent);
  const selectEvent = useStore((s) => s.selectEvent);
  const openGallery = useStore((s) => s.openGallery);
  const [snapshots, setSnapshots] = useState([]);

  useEffect(() => {
    if (!event?.id || !event?._layerType) return;
    if (event._layerType !== "events") {
      setSnapshots([]);
      return;
    }
    offlineApi.getEventTimeline(event.id).then(setSnapshots).catch(() => setSnapshots([]));
  }, [event?.id, event?._layerType]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") selectEvent(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectEvent]);

  if (!event) return null;

  const onClose = () => selectEvent(null);

  if (event._cluster && Array.isArray(event.entities)) {
    return (
      <aside className="event-panel panel ep-cluster-panel">
        <div className="ep-cluster-top">
          <div className="ep-header">
            <h2 className="ep-title">Cluster — {event.entities.length} items</h2>
            <button className="ep-close" onClick={onClose}>&times;</button>
          </div>
          <p className="ep-desc ep-cluster-hint">
            Markers at the same or nearby location. Click one to see details.
          </p>
        </div>
        <div className="ep-cluster-scroll">
          <ul className="ep-cluster-list">
            {event.entities.map((item, i) => {
              const label = item.name || item.title || item.vessel_name || item.callsign || item.event_type || item.anomaly_type || `Item ${i + 1}`;
              const typeLabel = (item._layerType || item.event_type || item.anomaly_type || "unknown").replace(/_/g, " ");
              return (
                <li key={i} className="ep-cluster-item">
                  <button
                    type="button"
                    className="ep-cluster-btn"
                    onClick={() => selectEvent(item)}
                  >
                    <span className="ep-cluster-label">{label}</span>
                    <span className="ep-cluster-type">{typeLabel}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <style>{`
          .ep-cluster-panel.event-panel {
            width: 300px;
            max-height: min(85vh, calc(100vh - 56px));
            display: flex;
            flex-direction: column;
            overflow: hidden;
            flex-shrink: 0;
            border-left: 1px solid var(--border);
            font-size: 13px;
          }
          .ep-cluster-top { flex-shrink: 0; }
          .ep-cluster-panel .ep-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 8px;
            margin-bottom: 0;
          }
          .ep-cluster-panel .ep-title { font-size: 15px; font-weight: 600; word-break: break-word; }
          .ep-cluster-panel .ep-close {
            flex-shrink: 0;
            background: none;
            border: none;
            font-size: 22px;
            line-height: 1;
            cursor: pointer;
            color: var(--text-secondary);
            padding: 0 4px;
          }
          .ep-cluster-panel .ep-close:hover { color: var(--text-primary); }
          .ep-cluster-hint { margin: 0 0 10px 0; font-size: 12px; color: var(--text-secondary); }
          .ep-cluster-scroll {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
            padding-right: 4px;
            margin-right: -2px;
          }
          .ep-cluster-list { list-style: none; margin: 0; padding: 0; }
          .ep-cluster-item { margin-bottom: 4px; }
          .ep-cluster-btn {
            width: 100%;
            text-align: left;
            padding: 8px 12px;
            background: var(--bg-hover);
            border: 1px solid var(--border);
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .ep-cluster-btn:hover { background: var(--accent); color: white; }
          .ep-cluster-label { font-weight: 500; word-break: break-word; }
          .ep-cluster-type { font-size: 11px; opacity: 0.8; }
        `}</style>
      </aside>
    );
  }

  if (event._layerType === "telegram") {
    return <TelegramPostDetail data={event} onClose={onClose} />;
  }
  if (event._layerType === "aircraft" || event.icao24) {
    return <AircraftDetail data={event} onClose={onClose} />;
  }
  if (event._layerType === "ships" || event.mmsi) {
    return <ShipDetail data={event} onClose={onClose} />;
  }
  if (event._layerType === "webcams" || (event.stream_url && event.camera_type)) {
    return <WebcamDetail data={event} onClose={onClose} />;
  }
  if (event._layerType === "environmental" || (event.data_source && ["wildfire", "earthquake"].includes(event.event_type))) {
    return <EnvironmentalDetail data={event} onClose={onClose} />;
  }
  if (event._layerType === "anomalies" || event.anomaly_type) {
    return <AnomalyDetail data={event} onClose={onClose} selectEvent={selectEvent} />;
  }
  if (event._layerType?.startsWith("heatmap_")) {
    return (
      <aside className="event-panel panel">
        <div className="ep-header">
          <h2 className="ep-title">{event.label || event.heatmap_type || "Heatmap"}</h2>
          <button className="ep-close" onClick={onClose}>&times;</button>
        </div>
        <div className="ep-meta">
          {event.weight != null && <div className="ep-row"><span>Intensity</span><span>{event.weight}</span></div>}
          <div className="ep-row"><span>Type</span><span>{event.heatmap_type || event._layerType}</span></div>
        </div>
      </aside>
    );
  }
  if (event._layerType === "events" || event.event_type) {
    return <EventDetail data={event} onClose={onClose} snapshots={snapshots} openGallery={openGallery} selectEvent={selectEvent} />;
  }

  return (
    <aside className="event-panel panel">
      <div className="ep-header">
        <h2 className="ep-title">{event.title || event.event_type || "Detail"}</h2>
        <button className="ep-close" onClick={onClose}>&times;</button>
      </div>

      <div className="ep-meta">
        {event.event_type && <div className="ep-row"><span>Type</span><span>{event.event_type}</span></div>}
        {event.source && <div className="ep-row"><span>Source</span><span>{event.source}</span></div>}
        {event.severity != null && <div className="ep-row"><span>Severity</span><span>{event.severity}</span></div>}
        {event.occurred_at && <div className="ep-row"><span>Time</span><span>{new Date(event.occurred_at).toLocaleString()}</span></div>}
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
        .ep-title { font-size: 15px; font-weight: 600; word-break: break-word; }
        .ep-type-badge {
          display: inline-block;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          padding: 3px 8px;
          border-radius: 4px;
          margin-bottom: 12px;
        }
        .ep-badge-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
        .ep-badge-row .ep-type-badge { margin-bottom: 4px; }
        .ep-badge-aircraft { background: #00e5ff22; color: #00e5ff; border: 1px solid #00e5ff44; }
        .ep-badge-ship { background: #ffd60022; color: #ffd600; border: 1px solid #ffd60044; }
        .ep-badge-conflict { background: #ef444422; color: #ef4444; border: 1px solid #ef444444; }
        .ep-badge-protest { background: #f9731622; color: #f97316; border: 1px solid #f9731644; }
        .ep-badge-disaster { background: #eab30822; color: #eab308; border: 1px solid #eab30844; }
        .ep-badge-news { background: #3b82f622; color: #3b82f6; border: 1px solid #3b82f644; }
        .ep-badge-webcam { background: #10b98122; color: #10b981; border: 1px solid #10b98144; }
        .ep-badge-telegram { background: #38bdf822; color: #38bdf8; border: 1px solid #38bdf844; }
        .ep-badge-anomaly { background: #a855f722; color: #a855f7; border: 1px solid #a855f744; }
        .ep-badge-military { background: #ef444422; color: #ef4444; border: 1px solid #ef444444; }
        .ep-badge-government { background: #a855f722; color: #a855f7; border: 1px solid #a855f744; }
        .ep-badge-commercial { background: #3b82f622; color: #3b82f6; border: 1px solid #3b82f644; }
        .ep-badge-private { background: #10b98122; color: #10b981; border: 1px solid #10b98144; }
        .ep-webcam-thumb {
          width: 100%;
          border-radius: 6px;
          margin-bottom: 10px;
          max-height: 160px;
          object-fit: cover;
        }
        .ep-attribution {
          font-size: 10px;
          color: var(--text-secondary);
          margin-top: 8px;
          padding-top: 6px;
          border-top: 1px solid var(--border, #333);
        }
        .ep-attribution a {
          color: #10b981;
          text-decoration: underline;
        }
        .ep-link {
          display: inline-block;
          color: #60a5fa;
          font-size: 12px;
          margin-bottom: 12px;
          text-decoration: underline;
          word-break: break-all;
        }
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
        .ep-row-highlight {
          background: rgba(255,255,255,0.04);
          padding: 4px 6px;
          margin: -2px -6px;
          border-radius: 4px;
        }
        .ep-row-highlight span:last-child { color: #fff; font-weight: 600; font-size: 13px; }
        .ep-desc {
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.5;
          margin-bottom: 12px;
        }
        .ep-news-options {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 10px;
          font-size: 12px;
          color: var(--text-secondary);
        }
        .ep-news-options label { display: flex; align-items: center; gap: 6px; }
        .ep-news-options select {
          padding: 4px 8px;
          border-radius: 4px;
          background: var(--bg-hover);
          color: var(--text-primary);
          border: 1px solid var(--border);
        }
        .ep-news-original {
          display: block;
          font-size: 10px;
          color: var(--text-secondary);
          margin-top: 2px;
          font-style: italic;
        }
        .ep-news-loading {
          font-size: 11px;
          color: var(--text-secondary);
          font-style: italic;
          margin-bottom: 8px;
        }
        .ep-related-section { margin-bottom: 12px; }
        .ep-related-btn {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          width: 100%;
          padding: 8px 10px;
          margin-bottom: 6px;
          background: var(--bg-hover);
          border: 1px solid var(--border);
          border-radius: 4px;
          cursor: pointer;
          text-align: left;
          color: inherit;
        }
        .ep-related-btn:hover { background: var(--accent); color: white; }
        .ep-related-title { font-size: 12px; font-weight: 500; }
        .ep-related-meta { font-size: 10px; opacity: 0.8; }
        .ep-news-section {
          margin-bottom: 12px;
        }
        .ep-news-card {
          display: flex;
          gap: 8px;
          padding: 6px;
          margin-bottom: 6px;
          border-radius: 4px;
          background: var(--bg-hover, #ffffff08);
          text-decoration: none;
          color: inherit;
          transition: background 0.15s;
        }
        .ep-news-card:hover {
          background: var(--bg-active, #ffffff14);
        }
        .ep-news-img {
          width: 50px;
          height: 38px;
          object-fit: cover;
          border-radius: 3px;
          flex-shrink: 0;
        }
        .ep-news-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .ep-news-title {
          font-size: 11px;
          font-weight: 500;
          color: var(--text-primary);
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .ep-news-domain {
          font-size: 10px;
          color: var(--text-secondary);
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
