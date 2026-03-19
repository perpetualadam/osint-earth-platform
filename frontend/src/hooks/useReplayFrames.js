import { useRef, useCallback, useEffect } from "react";
import { JulianDate, GeoJsonDataSource, Color } from "cesium";
import { useStore } from "./useStore";
import { api } from "../services/api";

/**
 * Custom hook that manages the replay frame buffer and drives the CesiumJS
 * viewer through a sequence of historical data frames.
 */
export function useReplayFrames(viewerRef) {
  const frames = useRef([]);
  const idx = useRef(0);
  const intervalRef = useRef(null);
  const isPlaying = useStore((s) => s.isPlaying);
  const speed = useStore((s) => s.playbackSpeed);
  const timeStart = useStore((s) => s.timeStart);
  const timeEnd = useStore((s) => s.timeEnd);

  const loadFrames = useCallback(async () => {
    const viewer = viewerRef?.current?.viewer;
    if (!viewer) return [];

    const rect = viewer.camera.computeViewRectangle();
    if (!rect) return [];

    const toDeg = (r) => (r * 180) / Math.PI;
    const bbox = [toDeg(rect.west), toDeg(rect.south), toDeg(rect.east), toDeg(rect.north)].join(",");

    const data = await api.getReplayFrames({
      bbox,
      time_start: timeStart,
      time_end: timeEnd,
      step_minutes: 60,
    });

    frames.current = data.frames || [];
    idx.current = 0;
    return frames.current;
  }, [viewerRef, timeStart, timeEnd]);

  const renderFrame = useCallback((frame) => {
    const viewer = viewerRef?.current?.viewer;
    if (!viewer || !frame) return;

    viewer.clock.currentTime = JulianDate.fromIso8601(frame.timestamp);

    const existing = viewer.dataSources._dataSources?.filter(
      (d) => d.name?.startsWith("replay_")
    );
    existing?.forEach((d) => viewer.dataSources.remove(d, true));

    if (frame.aircraft?.length) {
      const geojson = {
        type: "FeatureCollection",
        features: frame.aircraft.map((a) => ({
          type: "Feature",
          geometry: a.geometry,
          properties: a,
        })),
      };
      GeoJsonDataSource.load(geojson, { markerColor: Color.CYAN, clampToGround: false })
        .then((ds) => { ds.name = "replay_aircraft"; viewer.dataSources.add(ds); });
    }

    if (frame.ships?.length) {
      const geojson = {
        type: "FeatureCollection",
        features: frame.ships.map((s) => ({
          type: "Feature",
          geometry: s.geometry,
          properties: s,
        })),
      };
      GeoJsonDataSource.load(geojson, { markerColor: Color.YELLOW, clampToGround: true })
        .then((ds) => { ds.name = "replay_ships"; viewer.dataSources.add(ds); });
    }

    if (frame.events?.length) {
      const geojson = {
        type: "FeatureCollection",
        features: frame.events.map((e) => ({
          type: "Feature",
          geometry: e.geometry,
          properties: e,
        })),
      };
      GeoJsonDataSource.load(geojson, { markerColor: Color.RED, clampToGround: true })
        .then((ds) => { ds.name = "replay_events"; viewer.dataSources.add(ds); });
    }

    viewer.scene.requestRender();
  }, [viewerRef]);

  const step = useCallback((dir = 1) => {
    const f = frames.current;
    if (!f.length) return;
    idx.current = Math.max(0, Math.min(f.length - 1, idx.current + dir));
    renderFrame(f[idx.current]);
  }, [renderFrame]);

  useEffect(() => {
    if (isPlaying && frames.current.length) {
      intervalRef.current = setInterval(() => step(1), 1000 / speed);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, speed, step]);

  return { loadFrames, step, renderFrame, frames, idx };
}
