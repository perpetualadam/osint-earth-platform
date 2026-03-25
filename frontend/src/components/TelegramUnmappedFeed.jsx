import React, { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../hooks/useStore";
import { offlineApi } from "../services/offlineApi";

function snippet(text, max = 140) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t || "—";
  return t.slice(0, max - 1) + "…";
}

function channelLabel(username) {
  if (!username) return "channel";
  const u = String(username).replace(/^@/, "");
  return `@${u}`;
}

export default function TelegramUnmappedFeed() {
  const telegramOn = useStore((s) => s.layers.telegram);
  const selectEvent = useStore((s) => s.selectEvent);

  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [channels, setChannels] = useState([]);
  const [channelFilter, setChannelFilter] = useState("");
  const postsLenRef = useRef(0);
  postsLenRef.current = posts.length;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    offlineApi.getTelegramUnmappedChannels().then((d) => {
      if (!cancelled) setChannels(Array.isArray(d.channels) ? d.channels : []);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const fetchPage = useCallback(
    async (append, channelOverride) => {
      setLoading(true);
      setErr(null);
      const limit = 60;
      const offset = append ? postsLenRef.current : 0;
      const ch = (channelOverride !== undefined ? channelOverride : channelFilter).trim();
      const params = { limit, offset };
      if (ch) params.channel_username = ch;
      try {
        const data = await offlineApi.getTelegramUnmappedPosts(params);
        const next = data.posts || [];
        setTotal(typeof data.total === "number" ? data.total : next.length);
        setPosts((prev) => (append ? [...prev, ...next] : next));
      } catch (e) {
        setErr(e?.message || "Failed to load");
        if (!append) setPosts([]);
      } finally {
        setLoading(false);
      }
    },
    [channelFilter]
  );

  const onToggle = (e) => {
    const nextOpen = e.target.open;
    setOpen(nextOpen);
    if (nextOpen && posts.length === 0 && !loading) fetchPage(false);
  };

  const onChannelChange = (e) => {
    const v = e.target.value;
    setChannelFilter(v);
    setPosts([]);
    setTotal(0);
    fetchPage(false, v);
  };

  const hasMore = posts.length < total;

  const openPost = (row, e) => {
    e.preventDefault();
    e.stopPropagation();
    const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    selectEvent({
      id: row.id,
      channel_username: row.channel_username,
      telegram_message_id: row.telegram_message_id,
      text: row.text,
      text_en: row.text_en,
      posted_at: row.posted_at,
      metadata: meta,
      _layerType: "telegram",
    });
  };

  return (
    <div className="tg-unmapped-feed" role="region" aria-label="Telegram posts without map location">
      <details open={open} onToggle={onToggle}>
        <summary className="tg-unmapped-summary">
          Telegram — text only (no map)
          {total > 0 && <span className="tg-unmapped-count"> ({total})</span>}
        </summary>
        <div className="tg-unmapped-body">
          <div className="tg-unmapped-toolbar">
            <p className="tg-unmapped-hint">
              Ingested posts that are not geocoded (they never appear as pins). Sorted by channel name, then newest.
              {!telegramOn && (
                <span className="tg-unmapped-warn"> Turn on “Telegram posts” in Layers to also load geocoded pins on the globe.</span>
              )}
            </p>
            <button
              type="button"
              className="tg-unmapped-refresh"
              disabled={loading}
              onClick={() => fetchPage(false)}
            >
              Refresh
            </button>
          </div>
          <label className="tg-unmapped-channel-label">
            <span className="tg-unmapped-channel-title">Channel</span>
            <select
              className="tg-unmapped-channel-select"
              value={channelFilter}
              onChange={onChannelChange}
              aria-label="Filter by Telegram channel"
            >
              <option value="">All channels (A–Z)</option>
              {channels.map((c) => (
                <option key={c} value={c}>
                  {channelLabel(c)}
                </option>
              ))}
            </select>
          </label>
          {err && <p className="tg-unmapped-err">{err}</p>}
          {loading && posts.length === 0 && <p className="tg-unmapped-muted">Loading…</p>}
          <ul className="tg-unmapped-list">
            {posts.map((row) => {
              const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
              const tgUrl = meta.telegram_url;
              return (
                <li key={row.id} className="tg-unmapped-item">
                  <button
                    type="button"
                    className="tg-unmapped-open"
                    onClick={(e) => openPost(row, e)}
                  >
                    <span className="tg-unmapped-ch">{channelLabel(row.channel_username)}</span>
                    <span className="tg-unmapped-snippet">{snippet(row.text_en || row.text)}</span>
                    <time className="tg-unmapped-time" dateTime={row.posted_at}>
                      {row.posted_at ? new Date(row.posted_at).toLocaleString() : ""}
                    </time>
                  </button>
                  {tgUrl && (
                    <a
                      href={tgUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tg-unmapped-tglink"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Channel
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          {hasMore && (
            <button
              type="button"
              className="tg-unmapped-more"
              disabled={loading}
              onClick={() => fetchPage(true)}
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      </details>
      <style>{`
        .tg-unmapped-feed {
          position: absolute;
          top: 12px;
          right: 8px;
          bottom: auto;
          z-index: 35;
          font-size: 12px;
          max-width: min(360px, 92vw);
          pointer-events: auto;
        }
        .tg-unmapped-warn {
          display: block;
          margin-top: 6px;
          color: #fbbf24;
          font-size: 10px;
        }
        .tg-unmapped-feed details { margin: 0; }
        .tg-unmapped-summary {
          list-style: none;
          cursor: pointer;
          padding: 6px 12px;
          background: rgba(0,0,0,0.72);
          color: #e2e8f0;
          border: 1px solid rgba(56,189,248,0.35);
          border-radius: 6px;
          font-weight: 600;
          font-size: 12px;
        }
        .tg-unmapped-summary::-webkit-details-marker { display: none; }
        .tg-unmapped-count { font-weight: 500; color: #94a3b8; }
        .tg-unmapped-body {
          margin-top: 6px;
          padding: 10px;
          background: rgba(0,0,0,0.88);
          color: #e2e8f0;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 8px;
          max-height: 55vh;
          overflow-y: auto;
        }
        .tg-unmapped-toolbar {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 8px;
        }
        .tg-unmapped-channel-label {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 10px;
        }
        .tg-unmapped-channel-title {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #94a3b8;
        }
        .tg-unmapped-channel-select {
          width: 100%;
          padding: 6px 8px;
          font-size: 12px;
          border-radius: 6px;
          border: 1px solid rgba(56,189,248,0.4);
          background: rgba(15,23,42,0.95);
          color: #e2e8f0;
          cursor: pointer;
        }
        .tg-unmapped-channel-select:focus {
          outline: 2px solid rgba(56,189,248,0.5);
          outline-offset: 1px;
        }
        .tg-unmapped-hint {
          margin: 0;
          font-size: 11px;
          color: #94a3b8;
          line-height: 1.35;
          flex: 1;
        }
        .tg-unmapped-refresh {
          flex-shrink: 0;
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          background: rgba(56,189,248,0.12);
          color: #38bdf8;
          border: 1px solid rgba(56,189,248,0.35);
          border-radius: 4px;
        }
        .tg-unmapped-refresh:disabled { opacity: 0.5; cursor: default; }
        .tg-unmapped-err { margin: 0 0 8px 0; font-size: 11px; color: #f87171; }
        .tg-unmapped-muted { margin: 0; font-size: 11px; color: #94a3b8; }
        .tg-unmapped-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .tg-unmapped-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          padding-bottom: 6px;
        }
        .tg-unmapped-item:last-child { border-bottom: none; padding-bottom: 0; }
        .tg-unmapped-open {
          flex: 1;
          text-align: left;
          background: transparent;
          border: none;
          color: inherit;
          cursor: pointer;
          padding: 4px 6px;
          margin: -4px -6px;
          border-radius: 4px;
          font: inherit;
        }
        .tg-unmapped-open:hover { background: rgba(56,189,248,0.12); }
        .tg-unmapped-ch {
          display: block;
          font-size: 11px;
          font-weight: 600;
          color: #38bdf8;
          margin-bottom: 2px;
        }
        .tg-unmapped-snippet {
          display: block;
          font-size: 11px;
          line-height: 1.35;
          color: #cbd5e1;
        }
        .tg-unmapped-time {
          display: block;
          font-size: 10px;
          color: #64748b;
          margin-top: 4px;
        }
        .tg-unmapped-tglink {
          flex-shrink: 0;
          align-self: center;
          font-size: 10px;
          color: #38bdf8;
          text-decoration: none;
          padding: 4px 8px;
          border: 1px solid rgba(56,189,248,0.4);
          border-radius: 4px;
        }
        .tg-unmapped-tglink:hover { background: rgba(56,189,248,0.15); }
        .tg-unmapped-more {
          margin-top: 10px;
          width: 100%;
          padding: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          background: rgba(56,189,248,0.15);
          color: #38bdf8;
          border: 1px solid rgba(56,189,248,0.35);
          border-radius: 6px;
        }
        .tg-unmapped-more:disabled { opacity: 0.6; cursor: default; }
        .light-theme .tg-unmapped-summary {
          background: rgba(255,255,255,0.95);
          color: #0f172a;
          border-color: rgba(14,165,233,0.4);
        }
        .light-theme .tg-unmapped-count { color: #64748b; }
        .light-theme .tg-unmapped-body {
          background: rgba(255,255,255,0.97);
          color: #0f172a;
          border-color: rgba(0,0,0,0.1);
        }
        .light-theme .tg-unmapped-hint { color: #64748b; }
        .light-theme .tg-unmapped-channel-select {
          background: #fff;
          color: #0f172a;
          border-color: rgba(14,165,233,0.45);
        }
        .light-theme .tg-unmapped-channel-title { color: #64748b; }
        .light-theme .tg-unmapped-snippet { color: #334155; }
        .light-theme .tg-unmapped-time { color: #64748b; }
        .light-theme .tg-unmapped-warn { color: #b45309; }
      `}</style>
    </div>
  );
}
