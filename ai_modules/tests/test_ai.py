"""
AI module tests.
Run: cd ai_modules && python -m pytest tests/ -v

Unit tests mock DB connections. Integration tests require running services.
"""
import os
import sys
import io
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
class TestHealth:
    def test_health(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


# ---------------------------------------------------------------------------
# Object Detection
# ---------------------------------------------------------------------------
class TestDetection:
    def _make_image(self, w=256, h=256):
        img = Image.new("RGB", (w, h), color=(100, 150, 200))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return buf

    def test_detect_objects_basic(self):
        """Should return detections list or model_unavailable status."""
        img = self._make_image()
        resp = client.post(
            "/detect/objects",
            files={"file": ("test.png", img, "image/png")},
            params={"confidence": 0.3},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "detections" in data or data.get("status") == "model_unavailable"

    def test_detect_objects_with_geo(self):
        img = self._make_image()
        resp = client.post(
            "/detect/objects",
            files={"file": ("test.png", img, "image/png")},
            params={"confidence": 0.5, "lng": -73.9, "lat": 40.7},
        )
        assert resp.status_code == 200

    def test_detect_objects_confidence_bounds(self):
        img = self._make_image()
        resp = client.post(
            "/detect/objects",
            files={"file": ("test.png", img, "image/png")},
            params={"confidence": 1.5},  # out of bounds
        )
        assert resp.status_code == 422  # validation error


# ---------------------------------------------------------------------------
# Change Detection
# ---------------------------------------------------------------------------
class TestChangeDetection:
    def _make_image(self, w=128, h=128, color=(100, 100, 100)):
        img = Image.new("RGB", (w, h), color=color)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return buf

    def test_identical_images_no_change(self):
        img1 = self._make_image()
        img2 = self._make_image()
        resp = client.post(
            "/change/detect",
            files=[
                ("image_t1", ("t1.png", img1, "image/png")),
                ("image_t2", ("t2.png", img2, "image/png")),
            ],
            params={"threshold": 30.0, "min_area_px": 100},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["change_percentage"] == 0.0
        assert data["region_count"] == 0

    def test_different_images_detect_change(self):
        img1 = self._make_image(color=(50, 50, 50))
        img2 = self._make_image(color=(200, 200, 200))
        resp = client.post(
            "/change/detect",
            files=[
                ("image_t1", ("t1.png", img1, "image/png")),
                ("image_t2", ("t2.png", img2, "image/png")),
            ],
            params={"threshold": 30.0, "min_area_px": 10},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["change_percentage"] > 0

    def test_different_sizes_handled(self):
        img1 = self._make_image(128, 128)
        img2 = self._make_image(200, 200)
        resp = client.post(
            "/change/detect",
            files=[
                ("image_t1", ("t1.png", img1, "image/png")),
                ("image_t2", ("t2.png", img2, "image/png")),
            ],
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Anomaly Detection
# ---------------------------------------------------------------------------
class TestAnomalyDetection:
    @patch("anomaly_detection.anomaly_scorer._get_db")
    @patch("anomaly_detection.anomaly_scorer._get_redis")
    def test_scan_all(self, mock_redis, mock_db):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []
        mock_conn.cursor.return_value.__enter__ = lambda s: mock_cursor
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        mock_db.return_value = mock_conn
        mock_redis.return_value = MagicMock()

        resp = client.post("/anomaly/scan?anomaly_type=all&hours=6")
        assert resp.status_code == 200
        data = resp.json()
        assert "anomalies_detected" in data
        assert isinstance(data["results"], list)


# ---------------------------------------------------------------------------
# Multi-Sensor Fusion
# ---------------------------------------------------------------------------
class TestFusion:
    @patch("fusion.fusion_engine._get_db")
    def test_correlate(self, mock_db):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []
        mock_conn.cursor.return_value.__enter__ = lambda s: mock_cursor
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        mock_db.return_value = mock_conn

        resp = client.post("/fusion/correlate?hours=6&radius_km=50")
        assert resp.status_code == 200
        data = resp.json()
        assert "fused_events" in data
        assert isinstance(data["results"], list)
