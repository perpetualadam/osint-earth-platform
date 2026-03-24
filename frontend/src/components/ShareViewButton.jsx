import React, { useState } from "react";
import { useStore } from "../hooks/useStore";
import { buildViewSearchParams, LAYER_KEYS } from "../utils/urlViewState";

export default function ShareViewButton({ viewerRef }) {
  const [label, setLabel] = useState("");
  const layers = useStore((s) => s.layers);
  const timeStart = useStore((s) => s.timeStart);
  const timeEnd = useStore((s) => s.timeEnd);
  const aircraftPreset = useStore((s) => s.aircraftPreset);
  const aircraftCallsignPrefix = useStore((s) => s.aircraftCallsignPrefix);
  const aircraftMinAltitude = useStore((s) => s.aircraftMinAltitude);
  const aircraftMaxAltitude = useStore((s) => s.aircraftMaxAltitude);
  const aircraftMinVelocity = useStore((s) => s.aircraftMinVelocity);

  const copy = async () => {
    const bboxStr = viewerRef.current?.getViewBounds?.();
    const bbox = bboxStr ? bboxStr.split(",").map(Number) : null;
    const validBbox = bbox?.length === 4 && !bbox.some(Number.isNaN) ? bbox : null;
    const layersOn = LAYER_KEYS.filter((k) => layers[k]);
    const q = buildViewSearchParams({
      bbox: validBbox,
      layersOn: layersOn.length ? layersOn : null,
      timeStart,
      timeEnd,
      aircraftPreset,
      callsignPrefix: aircraftCallsignPrefix,
      aircraftMinAltitude,
      aircraftMaxAltitude,
      aircraftMinVelocity,
    });
    const url = `${window.location.origin}${window.location.pathname}${q}`;
    try {
      await navigator.clipboard.writeText(url);
      setLabel("Copied");
      setTimeout(() => setLabel(""), 2000);
    } catch {
      setLabel("Failed");
      setTimeout(() => setLabel(""), 2000);
    }
  };

  return (
    <button
      type="button"
      className="app-share-btn"
      onClick={copy}
      title="Copy link with map extent, time range, layers, and aircraft filters"
    >
      {label || "Share view"}
    </button>
  );
}
