import requests
from base_worker import BaseWorker
from config import WINDY_API_KEY

WINDY_URL = "https://api.windy.com/webcams/api/v3/webcams"


class WebcamWorker(BaseWorker):
    name = "webcam"

    def run(self):
        self.logger.info("Fetching webcam directory…")

        if not WINDY_API_KEY:
            self.logger.warning("WINDY_API_KEY not set — skipping webcam sync")
            return

        offset = 0
        limit = 50
        total_inserted = 0

        while True:
            def fetch(off=offset):
                resp = requests.get(WINDY_URL, params={
                    "limit": limit,
                    "offset": off,
                    "include": "location,urls",
                }, headers={
                    "x-windy-api-key": WINDY_API_KEY,
                }, timeout=30)
                resp.raise_for_status()
                return resp.json()

            try:
                data = self.run_with_retry(fetch)
            except Exception as e:
                self.logger.warning("Windy fetch failed at offset %d: %s", offset, e)
                break

            webcams = data.get("webcams", [])
            if not webcams:
                break

            with self.conn.cursor() as cur:
                for cam in webcams:
                    loc = cam.get("location", {})
                    lat = loc.get("latitude")
                    lng = loc.get("longitude")
                    if lat is None or lng is None:
                        continue

                    name = cam.get("title", "")
                    country = loc.get("country", "")
                    urls = cam.get("urls", {})
                    stream_url = urls.get("detail", "")
                    thumb_url = urls.get("preview", "")

                    cur.execute("""
                        INSERT INTO webcams
                            (name, location, stream_url, thumbnail_url, camera_type, source, country, active, last_checked)
                        VALUES
                            (%s, ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                             %s, %s, 'live', 'windy', %s, TRUE, NOW())
                        ON CONFLICT DO NOTHING
                    """, (name, lng, lat, stream_url, thumb_url, country))
                    total_inserted += 1

            offset += limit
            if len(webcams) < limit:
                break

        self.logger.info("Synced %d webcams", total_inserted)
