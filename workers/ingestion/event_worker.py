import csv
import io
import json
import os
import time as _time
import zipfile
import requests
from datetime import datetime, timedelta, timezone
from base_worker import BaseWorker
from config import ACLED_API_KEY, ACLED_EMAIL

GDELT_LASTUPDATE = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt"
ACLED_URL = "https://api.acleddata.com/acled/read"

CAMEO_CONFLICT = {
    "14": "protest",
    "15": "protest",
    "17": "conflict",
    "18": "conflict",
    "19": "conflict",
    "20": "conflict",
}

CAMEO_NEWS = {
    "01": "news", "02": "news", "03": "news", "04": "news", "05": "news",
    "06": "news", "07": "news", "08": "news", "09": "news", "10": "news",
    "11": "news", "12": "news", "13": "news", "16": "news",
}

NEWS_MIN_MENTIONS = 5

GDELT_CACHE_FILE = os.path.join(os.path.dirname(__file__), ".gdelt_last_url")
GDELT_MIN_INTERVAL_SECS = 900  # 15 minutes minimum between fetches
GDELT_MAX_REQUESTS_PER_HOUR = 4


class EventWorker(BaseWorker):
    name = "event"
    _gdelt_request_times = []

    def run(self):
        self.logger.info("Fetching global events…")
        self._fetch_gdelt()
        if ACLED_API_KEY:
            self._fetch_acled()

    def _gdelt_rate_ok(self):
        """Enforce max requests per hour to GDELT."""
        now = _time.time()
        self._gdelt_request_times = [t for t in self._gdelt_request_times if now - t < 3600]
        if len(self._gdelt_request_times) >= GDELT_MAX_REQUESTS_PER_HOUR:
            self.logger.info("GDELT rate limit: %d/%d requests in last hour, skipping",
                             len(self._gdelt_request_times), GDELT_MAX_REQUESTS_PER_HOUR)
            return False
        return True

    def _gdelt_already_fetched(self, url):
        """Check if this exact GDELT file was already processed."""
        try:
            if os.path.exists(GDELT_CACHE_FILE):
                with open(GDELT_CACHE_FILE, "r") as f:
                    cached = f.read().strip()
                if cached == url:
                    self.logger.info("GDELT file already processed: %s", url.split("/")[-1])
                    return True
        except OSError:
            pass
        return False

    def _gdelt_mark_fetched(self, url):
        try:
            with open(GDELT_CACHE_FILE, "w") as f:
                f.write(url)
        except OSError:
            pass

    def _fetch_gdelt(self):
        """Download latest GDELT event file and extract geolocated conflict/protest events."""
        if not self._gdelt_rate_ok():
            return

        try:
            resp = requests.get(GDELT_LASTUPDATE, timeout=15)
            resp.raise_for_status()
        except Exception as e:
            self.logger.warning("GDELT lastupdate fetch failed: %s", e)
            return

        export_url = None
        for line in resp.text.strip().split("\n"):
            parts = line.strip().split()
            if len(parts) >= 3 and parts[2].endswith(".export.CSV.zip"):
                export_url = parts[2]
                break

        if not export_url:
            self.logger.warning("No GDELT export URL found")
            return

        if self._gdelt_already_fetched(export_url):
            return

        self.logger.info("Downloading GDELT export: %s", export_url.split("/")[-1])
        self._gdelt_request_times.append(_time.time())

        try:
            dl = requests.get(export_url, timeout=60)
            dl.raise_for_status()
        except Exception as e:
            self.logger.warning("GDELT export download failed: %s", e)
            return

        self._gdelt_mark_fetched(export_url)

        total = 0
        with zipfile.ZipFile(io.BytesIO(dl.content)) as zf:
            for name in zf.namelist():
                if not name.endswith(".CSV"):
                    continue
                with zf.open(name) as f:
                    reader = csv.reader(io.TextIOWrapper(f, encoding="utf-8"), delimiter="\t")
                    with self.conn.cursor() as cur:
                        for row in reader:
                            if len(row) < 58:
                                continue
                            root_code = row[28].strip() if row[28] else ""

                            event_type = CAMEO_CONFLICT.get(root_code)
                            is_news = False
                            if not event_type:
                                event_type = CAMEO_NEWS.get(root_code)
                                is_news = True
                            if not event_type:
                                continue

                            try:
                                num_mentions = int(row[31].strip()) if row[31].strip() else 1
                            except (ValueError, IndexError):
                                num_mentions = 1

                            if is_news and num_mentions < NEWS_MIN_MENTIONS:
                                continue

                            try:
                                lat = float(row[56]) if row[56].strip() else None
                                lng = float(row[57]) if row[57].strip() else None
                            except (ValueError, IndexError):
                                continue
                            if lat is None or lng is None or (lat == 0 and lng == 0):
                                continue

                            actor1 = (row[6][:200] if row[6] else "").strip()
                            actor2 = (row[16][:200] if row[16] else "").strip()
                            date_str = row[1].strip() if row[1] else ""
                            source_url = (row[60].strip() if len(row) > 60 and row[60] else "")[:500]
                            goldstein = row[30].strip() if row[30].strip() else "0"
                            geo_name = (row[52].strip() if len(row) > 52 and row[52] else "")[:200]
                            geo_country = (row[53].strip() if len(row) > 53 and row[53] else "")[:10]

                            try:
                                ts = datetime.strptime(date_str, "%Y%m%d").replace(tzinfo=timezone.utc)
                            except (ValueError, TypeError):
                                ts = datetime.now(timezone.utc)

                            title = f"{actor1} → {actor2}" if actor2 else actor1 or event_type
                            meta = json.dumps({
                                "actor1": actor1, "actor2": actor2,
                                "goldstein": float(goldstein),
                                "mentions": num_mentions,
                                "url": source_url[:500],
                                "location_name": geo_name,
                                "country_code": geo_country,
                            })

                            cur.execute("""
                                INSERT INTO events
                                    (event_type, title, location, source, source_id, occurred_at, metadata)
                                VALUES
                                    (%s, %s,
                                     ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                                     'gdelt', %s, %s, %s::jsonb)
                                ON CONFLICT DO NOTHING
                            """, (event_type, title, lng, lat, source_url[:500], ts.isoformat(), meta))
                            total += 1

        self.logger.info("Inserted %d GDELT events (conflict/protest/news)", total)

    def _fetch_acled(self):
        """Fetch conflict events from ACLED."""
        now = datetime.now(timezone.utc)
        since = (now - timedelta(days=7)).strftime("%Y-%m-%d")

        def fetch():
            resp = requests.get(ACLED_URL, params={
                "key": ACLED_API_KEY,
                "email": ACLED_EMAIL,
                "event_date": since,
                "event_date_where": ">=",
                "limit": "500",
            }, timeout=30)
            resp.raise_for_status()
            return resp.json()

        try:
            data = self.run_with_retry(fetch)
        except Exception as e:
            self.logger.warning("ACLED fetch failed: %s", e)
            return

        events = data.get("data", [])
        self.logger.info("ACLED returned %d events", len(events))
        count = 0

        with self.conn.cursor() as cur:
            for ev in events:
                lat = ev.get("latitude")
                lng = ev.get("longitude")
                if not lat or not lng:
                    continue

                cur.execute("""
                    INSERT INTO events
                        (event_type, title, description, location, severity, source, source_id, occurred_at, metadata)
                    VALUES
                        ('conflict', %s, %s,
                         ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                         %s, 'acled', %s, %s, %s::jsonb)
                    ON CONFLICT DO NOTHING
                """, (
                    ev.get("event_type", ""),
                    ev.get("notes", "")[:1000],
                    float(lng), float(lat),
                    ev.get("fatalities"),
                    str(ev.get("data_id", "")),
                    ev.get("event_date", now.isoformat()),
                    f'{{"country": "{ev.get("country", "")}", "actor1": "{ev.get("actor1", "")}"}}'
                ))
                count += 1

        self.logger.info("Inserted %d ACLED conflict events", count)
