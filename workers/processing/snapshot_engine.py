"""
Event snapshot engine.
When an event is detected, this module:
  1. Fetches the nearest satellite tile for that location
  2. Renders annotations (bounding boxes, labels, timestamps)
  3. Stores the annotated image + thumbnail in MinIO
  4. Writes an event_snapshots record
  5. Publishes a notification via Redis
"""
import io
import json
from datetime import datetime, timezone
from PIL import Image, ImageDraw, ImageFont
import requests
import psycopg2
import psycopg2.extras
from minio import Minio
from config import POSTGRES, MINIO, REDIS_URL
import redis as redis_lib


class SnapshotEngine:
    def __init__(self):
        self.conn = psycopg2.connect(**POSTGRES)
        self.conn.autocommit = True
        self.minio = Minio(
            MINIO["endpoint"],
            access_key=MINIO["access_key"],
            secret_key=MINIO["secret_key"],
            secure=MINIO["secure"],
        )
        self.redis = redis_lib.from_url(REDIS_URL, decode_responses=True)
        self.bucket = "snapshots"

    def capture_event_snapshot(self, event_id, lng, lat, event_type, detections=None):
        """
        Capture and store a snapshot for a given event location.
        """
        tile_image = self._fetch_tile(lng, lat)
        if tile_image is None:
            tile_image = self._generate_placeholder(lng, lat, event_type)

        annotated = self._annotate(tile_image, event_type, lng, lat, detections)
        thumbnail = annotated.copy()
        thumbnail.thumbnail((256, 160))

        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        img_key = f"events/{event_id}/{ts}.png"
        thumb_key = f"events/{event_id}/{ts}_thumb.png"

        self._upload_image(annotated, img_key)
        self._upload_image(thumbnail, thumb_key)

        with self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO event_snapshots
                    (event_id, image_url, thumbnail_url, annotations,
                     capture_source, detection_type, confidence, location, captured_at)
                VALUES
                    (%s, %s, %s, %s::jsonb, 'auto', %s, %s,
                     ST_SetSRID(ST_MakePoint(%s, %s), 4326), NOW())
                RETURNING id
            """, (
                event_id, img_key, thumb_key,
                json.dumps(detections or []),
                event_type,
                detections[0].get("confidence", 0.5) if detections else 0.5,
                lng, lat,
            ))
            snap_id = cur.fetchone()["id"]

        self.redis.publish("events:new", json.dumps({
            "type": "snapshot",
            "event_id": event_id,
            "snapshot_id": snap_id,
            "image_url": img_key,
        }))

        return snap_id

    def _fetch_tile(self, lng, lat, zoom=12):
        """Try to fetch an OSM tile for the location as a base image."""
        try:
            x = int((lng + 180) / 360 * (2 ** zoom))
            import math
            y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * (2 ** zoom))
            url = f"https://tile.openstreetmap.org/{zoom}/{x}/{y}.png"
            resp = requests.get(url, timeout=10, headers={"User-Agent": "OSINT-Earth/1.0"})
            if resp.ok:
                return Image.open(io.BytesIO(resp.content)).convert("RGB")
        except Exception:
            pass
        return None

    def _generate_placeholder(self, lng, lat, event_type):
        """Generate a simple placeholder image when no tile is available."""
        img = Image.new("RGB", (512, 512), color=(20, 30, 50))
        draw = ImageDraw.Draw(img)
        draw.text((10, 10), f"{event_type.upper()}", fill=(255, 255, 255))
        draw.text((10, 30), f"Lat: {lat:.4f}  Lng: {lng:.4f}", fill=(180, 180, 180))
        return img

    def _annotate(self, image, event_type, lng, lat, detections=None):
        """Draw annotations onto the image."""
        img = image.copy()
        if img.size[0] < 512:
            img = img.resize((512, 512), Image.LANCZOS)

        draw = ImageDraw.Draw(img)

        label = f"{event_type.upper()} | {lat:.4f}, {lng:.4f} | {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
        draw.rectangle([(0, img.height - 24), (img.width, img.height)], fill=(0, 0, 0, 180))
        draw.text((8, img.height - 20), label, fill=(255, 255, 255))

        if detections:
            for det in detections:
                bbox = det.get("bbox", {})
                if all(k in bbox for k in ("x1", "y1", "x2", "y2")):
                    draw.rectangle(
                        [(bbox["x1"], bbox["y1"]), (bbox["x2"], bbox["y2"])],
                        outline=(255, 50, 50),
                        width=2,
                    )
                    draw.text(
                        (bbox["x1"], bbox["y1"] - 14),
                        f'{det.get("class_name", "")} {det.get("confidence", 0):.0%}',
                        fill=(255, 50, 50),
                    )

        cx, cy = img.width // 2, img.height // 2
        draw.line([(cx - 15, cy), (cx + 15, cy)], fill=(255, 0, 0), width=2)
        draw.line([(cx, cy - 15), (cx, cy + 15)], fill=(255, 0, 0), width=2)

        return img

    def _upload_image(self, image, key):
        buf = io.BytesIO()
        image.save(buf, format="PNG")
        buf.seek(0)
        self.minio.put_object(
            self.bucket, key, buf, length=buf.getbuffer().nbytes,
            content_type="image/png",
        )
