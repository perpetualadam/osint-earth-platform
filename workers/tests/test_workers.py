"""
Worker unit and integration tests.
Run: cd workers && python -m pytest tests/ -v

Requires: PostgreSQL+PostGIS running with schema loaded.
Some tests mock external APIs; integration tests hit real endpoints.
"""
import os
import sys
import json
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


# ---------------------------------------------------------------------------
# BaseWorker
# ---------------------------------------------------------------------------
class TestBaseWorker:
    def test_import(self):
        from base_worker import BaseWorker
        assert BaseWorker is not None

    def test_instantiate(self):
        from base_worker import BaseWorker

        class TestWorker(BaseWorker):
            name = "test"
            def run(self):
                pass

        w = TestWorker()
        assert w.name == "test"
        assert w.logger is not None

    def test_retry_succeeds_on_first(self):
        from base_worker import BaseWorker

        class W(BaseWorker):
            name = "retry_test"
            def run(self):
                pass

        w = W()
        result = w.run_with_retry(lambda: 42, max_retries=3, backoff=0)
        assert result == 42

    def test_retry_fails_then_succeeds(self):
        from base_worker import BaseWorker

        class W(BaseWorker):
            name = "retry_test2"
            def run(self):
                pass

        w = W()
        call_count = {"n": 0}

        def flaky():
            call_count["n"] += 1
            if call_count["n"] < 3:
                raise ValueError("flaky")
            return "ok"

        result = w.run_with_retry(flaky, max_retries=3, backoff=0)
        assert result == "ok"
        assert call_count["n"] == 3

    def test_retry_exhausted(self):
        from base_worker import BaseWorker

        class W(BaseWorker):
            name = "retry_test3"
            def run(self):
                pass

        w = W()
        with pytest.raises(ValueError):
            w.run_with_retry(lambda: (_ for _ in ()).throw(ValueError("fail")),
                             max_retries=2, backoff=0)


# ---------------------------------------------------------------------------
# Earthquake Worker (uses real USGS API — integration)
# ---------------------------------------------------------------------------
class TestEarthquakeWorker:
    def test_import(self):
        from ingestion.earthquake_worker import EarthquakeWorker
        assert EarthquakeWorker is not None

    @patch("ingestion.earthquake_worker.requests.get")
    def test_run_with_mock(self, mock_get):
        from ingestion.earthquake_worker import EarthquakeWorker

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "features": [
                {
                    "id": "test1",
                    "geometry": {"type": "Point", "coordinates": [-117.5, 34.2, 10]},
                    "properties": {
                        "mag": 4.5,
                        "place": "10km NW of Test City",
                        "time": int(datetime(2024, 1, 1, tzinfo=timezone.utc).timestamp() * 1000),
                    },
                }
            ]
        }
        mock_get.return_value = mock_response

        w = EarthquakeWorker()
        mock_conn = MagicMock()
        mock_conn.closed = False
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__ = lambda s: mock_cursor
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        w._conn = mock_conn

        w.run()
        assert mock_cursor.execute.called


# ---------------------------------------------------------------------------
# Wildfire Worker
# ---------------------------------------------------------------------------
class TestWildfireWorker:
    def test_import(self):
        from ingestion.wildfire_worker import WildfireWorker
        assert WildfireWorker is not None

    @patch("ingestion.wildfire_worker.FIRMS_MAP_KEY", "")
    def test_run_without_key(self):
        from ingestion.wildfire_worker import WildfireWorker
        w = WildfireWorker()
        # Should not raise, just log and return
        w.run()


# ---------------------------------------------------------------------------
# Aircraft Worker
# ---------------------------------------------------------------------------
class TestAircraftWorker:
    def test_import(self):
        from ingestion.aircraft_worker import AircraftWorker
        assert AircraftWorker is not None

    @patch("ingestion.aircraft_worker.requests.get")
    def test_run_with_mock(self, mock_get):
        from ingestion.aircraft_worker import AircraftWorker

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "states": [
                ["abc123", "TST123 ", "US", 1700000000, 1700000000,
                 -73.9, 40.7, 10000, False, 250, 90, 0, None, 10500, "1234", False, 0]
            ]
        }
        mock_get.return_value = mock_response

        w = AircraftWorker()
        mock_conn = MagicMock()
        mock_conn.closed = False
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__ = lambda s: mock_cursor
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        w._conn = mock_conn
        w._redis = MagicMock()

        w.run()
        assert mock_cursor.execute.called
        assert w._redis.publish.called


# ---------------------------------------------------------------------------
# Event Worker
# ---------------------------------------------------------------------------
class TestEventWorker:
    def test_import(self):
        from ingestion.event_worker import EventWorker
        assert EventWorker is not None


# ---------------------------------------------------------------------------
# Ship Worker
# ---------------------------------------------------------------------------
class TestShipWorker:
    def test_import(self):
        from ingestion.ship_worker import ShipWorker
        assert ShipWorker is not None


# ---------------------------------------------------------------------------
# Satellite Worker
# ---------------------------------------------------------------------------
class TestSatelliteWorker:
    def test_import(self):
        from ingestion.satellite_worker import SatelliteWorker
        assert SatelliteWorker is not None


# ---------------------------------------------------------------------------
# Webcam Worker
# ---------------------------------------------------------------------------
class TestWebcamWorker:
    def test_import(self):
        from ingestion.webcam_worker import WebcamWorker
        assert WebcamWorker is not None

    @patch("ingestion.webcam_worker.WINDY_API_KEY", "")
    def test_run_without_key(self):
        from ingestion.webcam_worker import WebcamWorker
        w = WebcamWorker()
        w.run()  # Should skip gracefully


# ---------------------------------------------------------------------------
# Scheduler
# ---------------------------------------------------------------------------
class TestScheduler:
    def test_import(self):
        import scheduler
        assert hasattr(scheduler, "main")


# ---------------------------------------------------------------------------
# Snapshot Engine
# ---------------------------------------------------------------------------
class TestSnapshotEngine:
    def test_import(self):
        from processing.snapshot_engine import SnapshotEngine
        assert SnapshotEngine is not None


# ---------------------------------------------------------------------------
# Replay Capture
# ---------------------------------------------------------------------------
class TestReplayCapture:
    def test_import(self):
        from processing.replay_capture import ReplayCaptureScheduler, CAPTURE_OFFSETS_SECONDS
        assert len(CAPTURE_OFFSETS_SECONDS) == 6
        assert CAPTURE_OFFSETS_SECONDS[0] == 0

    @patch("processing.snapshot_engine.psycopg2.connect")
    @patch("processing.snapshot_engine.Minio")
    @patch("processing.snapshot_engine.redis_lib.from_url")
    def test_scheduler_init(self, mock_redis, mock_minio, mock_pg):
        mock_pg.return_value = MagicMock()
        mock_minio.return_value = MagicMock()
        mock_redis.return_value = MagicMock()

        # Reset module-level singleton so it recreates with our mocks
        import processing.replay_capture as rc
        rc._scheduler = None
        s = rc.get_replay_scheduler()
        assert s is not None


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
class TestConfig:
    def test_import(self):
        import config
        assert config.POSTGRES["dbname"] == os.getenv("POSTGRES_DB", "osint_earth")
        assert isinstance(config.MINIO, dict)
