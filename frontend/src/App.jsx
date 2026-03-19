import React, { useRef } from "react";
import GlobeViewer from "./components/GlobeViewer";
import LayerManager from "./components/LayerManager";
import TimelineBar from "./components/TimelineBar";
import ReplayControls from "./components/ReplayControls";
import EventPanel from "./components/EventPanel";
import SnapshotGallery from "./components/SnapshotGallery";
import ConnectionStatus from "./components/ConnectionStatus";
import OfflinePanel from "./components/OfflinePanel";
import { useStore } from "./hooks/useStore";
import "./App.css";

export default function App() {
  const viewerRef = useRef(null);
  const selectedEvent = useStore((s) => s.selectedEvent);
  const showOffline = useStore((s) => s.showOfflinePanel);
  const webcamsOn = useStore((s) => s.layers.webcams);

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">OSINT Earth</h1>
        <ConnectionStatus />
      </header>

      <div className="app-body">
        <LayerManager />

        <main className="app-globe">
          <GlobeViewer ref={viewerRef} />
          <TimelineBar viewerRef={viewerRef} />
          <ReplayControls viewerRef={viewerRef} />
          {webcamsOn && (
            <div className="app-attribution">
              Webcam data powered by{" "}
              <a href="https://openwebcamdb.com" target="_blank" rel="noopener noreferrer">OpenWebcamDB.com</a>
            </div>
          )}
        </main>

        {selectedEvent && <EventPanel />}
      </div>

      <SnapshotGallery />
      {showOffline && <OfflinePanel />}
    </div>
  );
}
