import os
import json
import time as _time
import requests
from base_worker import BaseWorker
from config import WINDY_API_KEY, OPENWEBCAMDB_API_KEY

WINDY_URL = "https://api.windy.com/webcams/api/v3/webcams"
OWDB_URL = "https://openwebcamdb.com/api/v1/webcams"
OWDB_DETAIL_URL = "https://openwebcamdb.com/api/v1/webcams"

OWDB_CACHE_FILE = os.path.join(os.path.dirname(__file__), ".owdb_cache.json")
OWDB_CACHE_MAX_AGE = 3600  # 1 hour max cache per free tier rules
OWDB_MAX_REQUESTS_PER_DAY = 45  # stay under 50/day limit
OWDB_MIN_REQUEST_INTERVAL = 12  # ~5/min => 12s between requests


class WebcamWorker(BaseWorker):
    name = "webcam"
    _owdb_daily_count = 0
    _owdb_day_start = 0
    _owdb_last_request = 0

    def run(self):
        self.logger.info("Fetching webcam directory…")
        windy_count = 0
        owdb_count = 0

        if WINDY_API_KEY:
            windy_count = self._fetch_windy()
        else:
            self.logger.info("WINDY_API_KEY not set — skipping Windy webcams")

        if OPENWEBCAMDB_API_KEY:
            owdb_count = self._fetch_openwebcamdb()
        else:
            self.logger.info("OPENWEBCAMDB_API_KEY not set — skipping OpenWebcamDB")

        self.logger.info("Webcam sync complete: %d Windy + %d OpenWebcamDB", windy_count, owdb_count)

    # ── Windy ────────────────────────────────────────────────────────────

    def _fetch_windy(self):
        self.logger.info("Fetching Windy webcams (free tier, max offset 1000)…")
        offset = 0
        limit = 50
        total = 0

        while offset < 1000:
            def fetch(off=offset):
                resp = requests.get(WINDY_URL, params={
                    "limit": limit,
                    "offset": off,
                    "include": "location,urls,images",
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
                    city = loc.get("city", "")
                    region = loc.get("region", "")
                    urls = cam.get("urls", {})
                    detail_url = urls.get("detail", "")
                    images = cam.get("images", {})
                    current = images.get("current", {})
                    thumb_url = current.get("thumbnail", current.get("preview", ""))

                    meta = json.dumps({
                        "city": city, "region": region,
                        "country_code": loc.get("country_code", ""),
                        "continent": loc.get("continent", ""),
                        "webcam_id": cam.get("webcamId"),
                        "view_count": cam.get("viewCount", 0),
                        "status": cam.get("status", ""),
                    })

                    cur.execute("""
                        INSERT INTO webcams
                            (name, location, stream_url, thumbnail_url, camera_type,
                             source, country, active, last_checked, metadata)
                        VALUES
                            (%s, ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                             %s, %s, 'live', 'windy', %s, TRUE, NOW(), %s::jsonb)
                        ON CONFLICT (name, source) DO UPDATE SET
                            thumbnail_url = EXCLUDED.thumbnail_url,
                            stream_url = EXCLUDED.stream_url,
                            last_checked = NOW(),
                            active = TRUE
                    """, (name, lng, lat, detail_url, thumb_url, country, meta))
                    total += 1

            offset += limit
            if len(webcams) < limit:
                break

        self.logger.info("Synced %d Windy webcams", total)
        return total

    # ── OpenWebcamDB ─────────────────────────────────────────────────────

    def _owdb_rate_check(self):
        """Enforce free tier: 50 req/day, 5 req/min."""
        now = _time.time()
        if now - self._owdb_day_start > 86400:
            self._owdb_daily_count = 0
            self._owdb_day_start = now

        if self._owdb_daily_count >= OWDB_MAX_REQUESTS_PER_DAY:
            self.logger.info("OpenWebcamDB daily limit reached (%d), stopping", self._owdb_daily_count)
            return False

        wait = OWDB_MIN_REQUEST_INTERVAL - (now - self._owdb_last_request)
        if wait > 0:
            _time.sleep(wait)

        return True

    def _owdb_request(self, url, params=None):
        if not self._owdb_rate_check():
            return None

        self._owdb_last_request = _time.time()
        self._owdb_daily_count += 1

        resp = requests.get(url, params=params, headers={
            "Authorization": f"Bearer {OPENWEBCAMDB_API_KEY}",
        }, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def _owdb_cache_valid(self):
        try:
            if os.path.exists(OWDB_CACHE_FILE):
                mtime = os.path.getmtime(OWDB_CACHE_FILE)
                if _time.time() - mtime < OWDB_CACHE_MAX_AGE:
                    self.logger.info("OpenWebcamDB cache still valid (< 1hr), skipping fetch")
                    return True
        except OSError:
            pass
        return False

    def _owdb_save_cache(self):
        try:
            with open(OWDB_CACHE_FILE, "w") as f:
                json.dump({"fetched_at": _time.time()}, f)
        except OSError:
            pass

    def _fetch_openwebcamdb(self):
        if self._owdb_cache_valid():
            return 0

        self.logger.info("Fetching OpenWebcamDB webcams (free tier, 50 req/day)…")
        page = 1
        total = 0

        while True:
            try:
                data = self._owdb_request(OWDB_URL, params={
                    "per_page": 50,
                    "page": page,
                })
            except Exception as e:
                self.logger.warning("OpenWebcamDB fetch failed page %d: %s", page, e)
                break

            if data is None:
                break

            webcams = data.get("data", [])
            if not webcams:
                break

            with self.conn.cursor() as cur:
                for cam in webcams:
                    lat = cam.get("latitude")
                    lng = cam.get("longitude")
                    if not lat or not lng:
                        continue
                    try:
                        lat = float(lat)
                        lng = float(lng)
                    except (ValueError, TypeError):
                        continue

                    name = cam.get("title", "")
                    slug = cam.get("slug", "")
                    desc = cam.get("description", "")
                    stream_type = cam.get("stream_type", "")
                    thumb_url = cam.get("thumbnail_url", "")
                    permalink = cam.get("permalink", "")
                    country_data = cam.get("country", {})
                    country_name = country_data.get("name", "") if isinstance(country_data, dict) else ""
                    country_code = country_data.get("iso_code", "") if isinstance(country_data, dict) else ""
                    categories = cam.get("categories", [])
                    cat_names = [c.get("name", "") for c in categories if isinstance(c, dict)]

                    meta = json.dumps({
                        "slug": slug,
                        "description": desc[:500],
                        "stream_type": stream_type,
                        "permalink": permalink,
                        "country_code": country_code,
                        "categories": cat_names,
                        "attribution": "Powered by OpenWebcamDB.com",
                    })

                    cur.execute("""
                        INSERT INTO webcams
                            (name, location, stream_url, thumbnail_url, camera_type,
                             source, country, active, last_checked, metadata)
                        VALUES
                            (%s, ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                             %s, %s, %s, 'openwebcamdb', %s, TRUE, NOW(), %s::jsonb)
                        ON CONFLICT (name, source) DO UPDATE SET
                            thumbnail_url = EXCLUDED.thumbnail_url,
                            stream_url = EXCLUDED.stream_url,
                            last_checked = NOW(),
                            active = TRUE,
                            metadata = EXCLUDED.metadata
                    """, (name, lng, lat, permalink, thumb_url, stream_type, country_name, meta))
                    total += 1

            page += 1
            if len(webcams) < 50:
                break

        self._owdb_save_cache()
        self.logger.info("Synced %d OpenWebcamDB webcams", total)
        return total
