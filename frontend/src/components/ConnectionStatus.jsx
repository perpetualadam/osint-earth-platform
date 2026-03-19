import React, { useEffect, useState } from "react";
import { useStore } from "../hooks/useStore";
import { processSyncQueue } from "../services/offlineManager";

async function checkConnectivity() {
  try {
    const r = await fetch("/api/health", { method: "GET", cache: "no-store" });
    return r.ok;
  } catch {
    return navigator.onLine;
  }
}

export default function ConnectionStatus() {
  const isOnline = useStore((s) => s.isOnline);
  const setOnline = useStore((s) => s.setOnline);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    checkConnectivity().then(setOnline);

    const onOnline = async () => {
      const real = await checkConnectivity();
      setOnline(real);
      if (real) {
        setSyncing(true);
        try {
          const synced = await processSyncQueue();
          if (synced > 0) console.log(`Synced ${synced} offline actions`);
        } catch (e) {
          console.warn("Sync queue processing failed:", e);
        }
        setSyncing(false);
      }
    };
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const interval = setInterval(() => {
      checkConnectivity().then(setOnline);
    }, 30_000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(interval);
    };
  }, [setOnline]);

  const statusText = syncing ? "Syncing" : isOnline ? "Live" : "Offline";
  const statusClass = syncing ? "syncing" : isOnline ? "online" : "offline";

  return (
    <div
      className="conn-status"
      title={
        isOnline
          ? syncing
            ? "Syncing offline actions…"
            : "Connected — receiving live data"
          : "Offline — using cached data"
      }
    >
      <span className={`conn-dot ${statusClass}`} />
      <span className="conn-label">{statusText}</span>

      <style>{`
        .conn-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
        }
        .conn-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .conn-dot.online { background: var(--success); box-shadow: 0 0 6px var(--success); }
        .conn-dot.offline { background: var(--danger); box-shadow: 0 0 6px var(--danger); }
        .conn-dot.syncing {
          background: var(--warning);
          box-shadow: 0 0 6px var(--warning);
          animation: pulse 1s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .conn-label { color: var(--text-secondary); font-weight: 500; }
      `}</style>
    </div>
  );
}
