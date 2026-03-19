import requests
from datetime import datetime, timedelta, timezone
from base_worker import BaseWorker
from config import ACLED_API_KEY, ACLED_EMAIL

GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
ACLED_URL = "https://api.acleddata.com/acled/read"


class EventWorker(BaseWorker):
    name = "event"

    def run(self):
        self.logger.info("Fetching global events…")
        self._fetch_gdelt()
        if ACLED_API_KEY:
            self._fetch_acled()

    def _fetch_gdelt(self):
        """Fetch recent geolocated news events from GDELT."""
        def fetch():
            resp = requests.get(GDELT_URL, params={
                "query": "conflict OR disaster OR protest OR military",
                "mode": "artlist",
                "maxrecords": "100",
                "format": "json",
                "timespan": "60min",
            }, timeout=30)
            resp.raise_for_status()
            return resp.json()

        try:
            data = self.run_with_retry(fetch)
        except Exception as e:
            self.logger.warning("GDELT fetch failed: %s", e)
            return

        articles = data.get("articles", [])
        self.logger.info("GDELT returned %d articles", len(articles))
        count = 0

        with self.conn.cursor() as cur:
            for art in articles:
                lat = art.get("sourcelat")
                lng = art.get("sourcelon")
                if not lat or not lng:
                    continue

                title = art.get("title", "")[:500]
                url = art.get("url", "")
                seendate = art.get("seendate", "")

                try:
                    ts = datetime.strptime(seendate[:14], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
                except (ValueError, TypeError):
                    ts = datetime.now(timezone.utc)

                cur.execute("""
                    INSERT INTO events
                        (event_type, title, location, source, source_id, occurred_at, metadata)
                    VALUES
                        ('news', %s,
                         ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                         'gdelt', %s, %s, %s::jsonb)
                    ON CONFLICT DO NOTHING
                """, (title, float(lng), float(lat), url, ts.isoformat(),
                      f'{{"url": "{url}"}}'))
                count += 1

        self.logger.info("Inserted %d GDELT events", count)

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
