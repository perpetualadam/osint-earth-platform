import requests
from base_worker import BaseWorker

USGS_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"


class EarthquakeWorker(BaseWorker):
    name = "earthquake"

    def run(self):
        self.logger.info("Fetching USGS earthquake data…")

        def fetch():
            resp = requests.get(USGS_URL, params={
                "format": "geojson",
                "starttime": self._recent_window(),
                "minmagnitude": "2.5",
                "orderby": "time",
                "limit": "500",
            }, timeout=30)
            resp.raise_for_status()
            return resp.json()

        data = self.run_with_retry(fetch)
        features = data.get("features", [])
        self.logger.info("Received %d earthquake events", len(features))

        count = 0
        with self.conn.cursor() as cur:
            for f in features:
                props = f["properties"]
                coords = f["geometry"]["coordinates"]
                lng, lat, depth = coords[0], coords[1], coords[2] if len(coords) > 2 else None
                mag = props.get("mag")
                place = props.get("place", "")
                event_time = props.get("time")
                source_id = f.get("id", "")

                if event_time:
                    from datetime import datetime, timezone
                    event_time = datetime.fromtimestamp(event_time / 1000, tz=timezone.utc).isoformat()

                cur.execute("""
                    INSERT INTO environmental_events
                        (event_type, location, severity, data_source, started_at, metadata)
                    VALUES
                        ('earthquake',
                         ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                         %s, 'usgs-eq', %s,
                         %s::jsonb)
                    ON CONFLICT DO NOTHING
                """, (
                    lng, lat, mag, event_time,
                    f'{{"place": "{place}", "depth_km": {depth or 0}, "source_id": "{source_id}"}}'
                ))
                count += 1

        self.logger.info("Inserted %d earthquakes", count)

    def _recent_window(self):
        from datetime import datetime, timedelta, timezone
        return (datetime.now(timezone.utc) - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%S")
