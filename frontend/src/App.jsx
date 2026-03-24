import React, { useRef, useEffect, useState } from "react";
import GlobeViewer from "./components/GlobeViewer";
import LayerManager from "./components/LayerManager";
import TimelineBar from "./components/TimelineBar";
import ReplayControls from "./components/ReplayControls";
import EventPanel from "./components/EventPanel";
import SnapshotGallery from "./components/SnapshotGallery";
import ConnectionStatus from "./components/ConnectionStatus";
import OfflinePanel from "./components/OfflinePanel";
import MapLegend from "./components/MapLegend";
import SearchBar from "./components/SearchBar";
import ExportButton from "./components/ExportButton";
import ShareViewButton from "./components/ShareViewButton";
import DataSourcesPanel from "./components/DataSourcesPanel";
import { useStore } from "./hooks/useStore";
import { useNotifications } from "./hooks/useNotifications";
import { api } from "./services/api";
import { parseViewFromSearch, LAYER_KEYS } from "./utils/urlViewState";
import "./App.css";

export default function App() {
  const viewerRef = useRef(null);
  const selectedEvent = useStore((s) => s.selectedEvent);
  const selectEvent = useStore((s) => s.selectEvent);
  const showOffline = useStore((s) => s.showOfflinePanel);
  const webcamsOn = useStore((s) => s.layers.webcams);
  const darkTheme = useStore((s) => s.darkTheme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const layerPanelOpen = useStore((s) => s.layerPanelOpen);
  const toggleLayerPanel = useStore((s) => s.toggleLayerPanel);
  const notificationsEnabled = useStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useStore((s) => s.setNotificationsEnabled);
  useNotifications(notificationsEnabled);
  const [dataSourcesOpen, setDataSourcesOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("osint-theme");
    const isLight = saved === "light";
    document.documentElement.classList.toggle("light-theme", isLight);
    useStore.setState({ darkTheme: !isLight });
  }, []);

  useEffect(() => {
    const search = window.location.search;
    const params = new URLSearchParams(search);
    const eventId = params.get("event");
    const anomalyId = params.get("anomaly");

    const flyBboxFromView = (bbox) => {
      if (!bbox || bbox.length !== 4 || bbox.some((x) => typeof x !== "number" || Number.isNaN(x))) return;
      const [w, s, e, n] = bbox;
      const t = setInterval(() => {
        if (viewerRef.current?.flyToBounds) {
          viewerRef.current.flyToBounds(w, s, e, n);
          clearInterval(t);
        }
      }, 200);
      setTimeout(() => clearInterval(t), 8000);
    };

    const applyParsedView = (view) => {
      if (view.timeStart !== undefined || view.timeEnd !== undefined) {
        const st = useStore.getState();
        useStore.getState().setTimeRange(
          view.timeStart !== undefined ? view.timeStart : st.timeStart,
          view.timeEnd !== undefined ? view.timeEnd : st.timeEnd
        );
      }
      if (view.layersOn !== undefined) {
        useStore.setState((st) => {
          const next = { ...st.layers };
          for (const k of LAYER_KEYS) next[k] = view.layersOn.includes(k);
          return { layers: next };
        });
      }
      if (view.aircraftPreset !== undefined) useStore.getState().setAircraftPreset(view.aircraftPreset);
      if (view.callsignPrefix !== undefined) useStore.getState().setAircraftCallsignPrefix(view.callsignPrefix);
      if (view.aircraftMinAltitude !== undefined) useStore.getState().setAircraftMinAltitude(view.aircraftMinAltitude);
      if (view.aircraftMaxAltitude !== undefined) useStore.getState().setAircraftMaxAltitude(view.aircraftMaxAltitude);
      if (view.aircraftMinVelocity !== undefined) useStore.getState().setAircraftMinVelocity(view.aircraftMinVelocity);
      if (view.bbox) flyBboxFromView(view.bbox);
    };

    const flyAndSelect = (lon, lat, payload, layerType) => {
      selectEvent({ ...payload, _layerType: layerType, lat, lon });
      if (typeof lon === "number" && typeof lat === "number") {
        const t = setInterval(() => {
          if (viewerRef.current?.flyTo) {
            viewerRef.current.flyTo(lon, lat);
            clearInterval(t);
          }
        }, 200);
        setTimeout(() => clearInterval(t), 5000);
      }
    };

    if (eventId) {
      api.getEvent(eventId)
        .then((ev) => {
          const coords = ev.geometry?.coordinates || ev.location?.coordinates;
          const [lon, lat] = Array.isArray(coords) ? coords : [];
          flyAndSelect(lon, lat, ev, "events");
        })
        .catch(() => {})
        .finally(() => window.history.replaceState({}, "", window.location.pathname));
      return;
    }
    if (anomalyId) {
      api.getAnomaly(anomalyId)
        .then((a) => {
          const coords = a.geometry?.coordinates;
          const [lon, lat] = Array.isArray(coords) ? coords : [];
          flyAndSelect(lon, lat, { ...a, anomaly_type: a.anomaly_type }, "anomalies");
        })
        .catch(() => {})
        .finally(() => window.history.replaceState({}, "", window.location.pathname));
      return;
    }

    if (telegramPostId) {
      api.getTelegramPost(telegramPostId)
        .then((row) => {
          const lon = row.lon != null ? Number(row.lon) : NaN;
          const lat = row.lat != null ? Number(row.lat) : NaN;
          const payload = {
            id: row.id,
            channel_username: row.channel_username,
            text: row.text,
            text_en: row.text_en,
            posted_at: row.posted_at,
            geo_confidence: row.geo_confidence,
            metadata: row.metadata,
            _layerType: "telegram",
          };
          flyAndSelect(lon, lat, payload, "telegram");
        })
        .catch(() => {})
        .finally(() => window.history.replaceState({}, "", window.location.pathname));
      return;
    }

    const view = parseViewFromSearch(search);
    if (Object.keys(view).length > 0) applyParsedView(view);
  }, [selectEvent]);

  return (
    <div className="app">
      <a href="#app-main" className="skip-link">Skip to main content</a>
      <header className="app-header">
        <h1 className="app-title">OSINT Earth</h1>
        <div className="app-header-actions">
          <button
            className="app-theme-btn"
            onClick={toggleTheme}
            title={darkTheme ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={darkTheme ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkTheme ? "\u263C" : "\u263E"}
          </button>
          <button
            className={`app-theme-btn ${notificationsEnabled ? "active" : ""}`}
            onClick={() => setNotificationsEnabled(!notificationsEnabled)}
            title={notificationsEnabled ? "Notifications on" : "Enable notifications for new events"}
            aria-label="Toggle notifications"
          >
            &#128276;
          </button>
          <button
            type="button"
            className="app-sources-btn"
            onClick={() => setDataSourcesOpen(true)}
            title="Data sources and update cadence"
            aria-label="Open data sources"
          >
            Sources
          </button>
          <ShareViewButton viewerRef={viewerRef} />
          <button
            className="app-layers-toggle"
            onClick={toggleLayerPanel}
            title={layerPanelOpen ? "Hide layers" : "Show layers"}
            aria-label={layerPanelOpen ? "Hide layers" : "Show layers"}
            aria-expanded={layerPanelOpen}
          >
            {layerPanelOpen ? "\u226A" : "\u226B"}
          </button>
          <ExportButton viewerRef={viewerRef} />
          <ConnectionStatus />
        </div>
      </header>

      <div className="app-body">
        {layerPanelOpen && <LayerManager />}

        <main id="app-main" className="app-globe" tabIndex={-1}>
          <GlobeViewer ref={viewerRef} />
          <SearchBar viewerRef={viewerRef} />
          <MapLegend />
          <TimelineBar viewerRef={viewerRef} />
          <ReplayControls viewerRef={viewerRef} />
          {webcamsOn && (
            <div className="app-attribution">
              Webcam data powered by{" "}
              <a href="https://openwebcamdb.com" target="_blank" rel="noopener noreferrer">OpenWebcamDB.com</a>
            </div>
          )}
        </main>

        {selectedEvent && (
          <div
            className="entity-popup-backdrop"
            role="presentation"
            onClick={() => selectEvent(null)}
            onKeyDown={(e) => e.key === "Escape" && selectEvent(null)}
          >
            <div
              className="entity-popup"
              role="dialog"
              aria-modal="true"
              aria-label="Selected map item"
              onClick={(e) => e.stopPropagation()}
            >
              <EventPanel />
            </div>
          </div>
        )}
      </div>

      <SnapshotGallery />
      {showOffline && <OfflinePanel />}
      <DataSourcesPanel open={dataSourcesOpen} onClose={() => setDataSourcesOpen(false)} />
    </div>
  );
}
