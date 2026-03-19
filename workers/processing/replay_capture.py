"""
Time-series event capture.
When a major event is detected, this module schedules follow-up
snapshot captures at increasing intervals to build a visual timeline.

Capture schedule:
  t0 — event detected (immediate capture)
  t1 — 10 minutes
  t2 — 30 minutes
  t3 — 1 hour
  t4 — 6 hours
  t5 — 24 hours
"""
import threading
import time
import logging
from processing.snapshot_engine import SnapshotEngine

logger = logging.getLogger("replay_capture")

CAPTURE_OFFSETS_SECONDS = [
    0,        # immediate
    600,      # 10 min
    1800,     # 30 min
    3600,     # 1 hour
    21600,    # 6 hours
    86400,    # 24 hours
]


class ReplayCaptureScheduler:
    def __init__(self):
        self.engine = SnapshotEngine()
        self._timers = []

    def schedule_captures(self, event_id, lng, lat, event_type, detections=None):
        """
        Schedule a series of snapshot captures for a given event.
        The first capture (t0) runs immediately.
        """
        logger.info("Scheduling %d captures for event %s", len(CAPTURE_OFFSETS_SECONDS), event_id)

        for offset in CAPTURE_OFFSETS_SECONDS:
            if offset == 0:
                self._do_capture(event_id, lng, lat, event_type, detections)
            else:
                t = threading.Timer(
                    offset,
                    self._do_capture,
                    args=(event_id, lng, lat, event_type, detections),
                )
                t.daemon = True
                t.start()
                self._timers.append(t)

    def _do_capture(self, event_id, lng, lat, event_type, detections):
        try:
            snap_id = self.engine.capture_event_snapshot(
                event_id, lng, lat, event_type, detections
            )
            logger.info("Captured snapshot %d for event %s", snap_id, event_id)
        except Exception as e:
            logger.error("Snapshot capture failed for event %s: %s", event_id, e)

    def cancel_all(self):
        for t in self._timers:
            t.cancel()
        self._timers.clear()


_scheduler = None


def get_replay_scheduler():
    global _scheduler
    if _scheduler is None:
        _scheduler = ReplayCaptureScheduler()
    return _scheduler
