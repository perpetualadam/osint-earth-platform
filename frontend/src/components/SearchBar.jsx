import React, { useState, useCallback } from "react";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

async function searchPlace(query) {
  if (!query || query.trim().length < 2) return [];
  const params = new URLSearchParams({
    q: query.trim(),
    format: "json",
    limit: "5",
    addressdetails: "1",
  });
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { "User-Agent": "OSINT-Earth-Platform/1.0" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((r) => ({
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    display_name: r.display_name,
    type: r.type,
  }));
}

function parseCoords(input) {
  const trimmed = input.trim();
  const match = trimmed.match(/^(-?\d+\.?\d*)\s*[,;\s]\s*(-?\d+\.?\d*)$/);
  if (match) return { lat: parseFloat(match[2]), lon: parseFloat(match[1]) };
  const match2 = trimmed.match(/^lat\s*[:=]?\s*(-?\d+\.?\d*)\s*[,;\s]\s*lon\s*[:=]?\s*(-?\d+\.?\d*)$/i);
  if (match2) return { lat: parseFloat(match2[1]), lon: parseFloat(match2[2]) };
  return null;
}

export default function SearchBar({ viewerRef, onFlyTo }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);

  const doSearch = useCallback(async () => {
    const coords = parseCoords(query);
    if (coords) {
      onFlyTo?.(coords.lon, coords.lat);
      viewerRef?.current?.flyTo?.(coords.lon, coords.lat);
      setQuery("");
      setResults([]);
      return;
    }
    setLoading(true);
    setResults([]);
    try {
      const items = await searchPlace(query);
      setResults(items);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, viewerRef, onFlyTo]);

  const handleSelect = useCallback(
    (item) => {
      onFlyTo?.(item.lon, item.lat);
      viewerRef?.current?.flyTo?.(item.lon, item.lat);
      setQuery("");
      setResults([]);
      setFocused(false);
    },
    [viewerRef, onFlyTo]
  );

  return (
    <div className="search-bar">
      <div className="search-bar-input-wrap">
        <input
          type="text"
          className="search-bar-input"
          placeholder="Search place or lat, lon"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          aria-label="Search place or coordinates"
        />
        <button type="button" className="search-bar-btn" onClick={doSearch} aria-label="Search">
          &#128269;
        </button>
      </div>
      {focused && (results.length > 0 || loading) && (
        <div className="search-bar-results">
          {loading && <div className="search-bar-loading">Searching…</div>}
          {!loading && results.map((r, i) => (
            <button
              key={i}
              type="button"
              className="search-bar-result"
              onClick={() => handleSelect(r)}
            >
              {r.display_name}
            </button>
          ))}
        </div>
      )}
      <style>{`
        .search-bar {
          position: absolute;
          top: 8px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 20;
          width: min(320px, 90vw);
        }
        .search-bar-input-wrap {
          display: flex;
          background: rgba(0,0,0,0.85);
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.2);
          overflow: hidden;
        }
        .search-bar-input {
          flex: 1;
          padding: 8px 12px;
          border: none;
          background: transparent;
          color: #fff;
          font-size: 14px;
        }
        .search-bar-input::placeholder { color: #888; }
        .search-bar-btn {
          padding: 8px 12px;
          background: var(--accent);
          border: none;
          color: white;
          cursor: pointer;
          font-size: 16px;
        }
        .search-bar-results {
          margin-top: 4px;
          background: rgba(0,0,0,0.9);
          border-radius: 6px;
          max-height: 200px;
          overflow-y: auto;
        }
        .search-bar-loading { padding: 12px; color: #aaa; font-size: 13px; }
        .search-bar-result {
          display: block;
          width: 100%;
          padding: 10px 12px;
          text-align: left;
          background: none;
          border: none;
          color: #eee;
          font-size: 13px;
          cursor: pointer;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .search-bar-result:hover { background: rgba(255,255,255,0.1); }
      `}</style>
    </div>
  );
}
