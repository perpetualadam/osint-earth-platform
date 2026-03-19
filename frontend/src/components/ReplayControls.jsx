import React, { useRef, useCallback, useEffect } from "react";
import { JulianDate } from "cesium";
import { useStore } from "../hooks/useStore";
import { api } from "../services/api";

const SPEEDS = [1, 5, 20, 50];

export default function ReplayControls({ viewerRef }) {
  const isPlaying = useStore((s) => s.isPlaying);
  const speed = useStore((s) => s.playbackSpeed);
  const setPlaying = useStore((s) => s.setPlaying);
  const setSpeed = useStore((s) => s.setPlaybackSpeed);
  const timeStart = useStore((s) => s.timeStart);
  const timeEnd = useStore((s) => s.timeEnd);
  const framesRef = useRef([]);
  const frameIdx = useRef(0);
  const intervalRef = useRef(null);

  const loadFrames = useCallback(async () => {
    const viewer = viewerRef?.current?.viewer;
    if (!viewer) return;

    const rect = viewer.camera.computeViewRectangle();
    if (!rect) return;

    const toDeg = (r) => (r * 180) / Math.PI;
    const bbox = [toDeg(rect.west), toDeg(rect.south), toDeg(rect.east), toDeg(rect.north)].join(",");

    try {
      const data = await api.getReplayFrames({
        bbox,
        time_start: timeStart,
        time_end: timeEnd,
        step_minutes: 60,
      });
      framesRef.current = data.frames || [];
      frameIdx.current = 0;
    } catch (err) {
      console.warn("Replay frame load error:", err);
    }
  }, [viewerRef, timeStart, timeEnd]);

  const stepFrame = useCallback(
    (direction = 1) => {
      const frames = framesRef.current;
      if (!frames.length) return;
      frameIdx.current = Math.max(0, Math.min(frames.length - 1, frameIdx.current + direction));
      const frame = frames[frameIdx.current];
      const viewer = viewerRef?.current?.viewer;
      if (viewer && frame?.timestamp) {
        viewer.clock.currentTime = JulianDate.fromIso8601(frame.timestamp);
        viewer.scene.requestRender();
      }
    },
    [viewerRef]
  );

  useEffect(() => {
    if (isPlaying) {
      if (!framesRef.current.length) loadFrames();
      intervalRef.current = setInterval(() => stepFrame(1), 1000 / speed);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, speed, stepFrame, loadFrames]);

  return (
    <div className="replay-controls">
      <button className="rc-btn" onClick={() => stepFrame(-1)} title="Step Back">&#9664;&#9664;</button>
      <button
        className="rc-btn rc-play"
        onClick={() => { if (!isPlaying) loadFrames(); setPlaying(!isPlaying); }}
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? "\u23F8" : "\u25B6"}
      </button>
      <button className="rc-btn" onClick={() => stepFrame(1)} title="Step Forward">&#9654;&#9654;</button>

      <div className="rc-speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`rc-speed-btn ${speed === s ? "active" : ""}`}
            onClick={() => setSpeed(s)}
          >
            {s}x
          </button>
        ))}
      </div>

      <style>{`
        .replay-controls {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 16px;
          background: var(--bg-panel);
          border-top: 1px solid var(--border);
          flex-shrink: 0;
        }
        .rc-btn {
          background: var(--bg-hover);
          color: var(--text-primary);
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 14px;
        }
        .rc-btn:hover { background: var(--accent); }
        .rc-play { font-size: 18px; padding: 6px 16px; }
        .rc-speed { display: flex; gap: 4px; margin-left: 12px; }
        .rc-speed-btn {
          background: var(--bg-hover);
          color: var(--text-secondary);
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
        }
        .rc-speed-btn.active {
          background: var(--accent);
          color: white;
        }
      `}</style>
    </div>
  );
}
