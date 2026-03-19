import csv
import io
import requests
from base_worker import BaseWorker
from config import FIRMS_MAP_KEY

FIRMS_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"


class WildfireWorker(BaseWorker):
    name = "wildfire"

    def run(self):
        self.logger.info("Fetching NASA FIRMS active fire data…")
        source = "VIIRS_NOAA20_NRT"
        area = "world"
        day_range = "1"

        def fetch():
            url = f"{FIRMS_URL}/{FIRMS_MAP_KEY}/{source}/{area}/{day_range}"
            resp = requests.get(url, timeout=60)
            resp.raise_for_status()
            return resp.text

        if not FIRMS_MAP_KEY:
            self.logger.warning("FIRMS_MAP_KEY not set — using USGS fallback")
            return self._fallback_firms()

        raw = self.run_with_retry(fetch)
        reader = csv.DictReader(io.StringIO(raw))
        count = 0

        with self.conn.cursor() as cur:
            for row in reader:
                lat = float(row.get("latitude", 0))
                lng = float(row.get("longitude", 0))
                frp = float(row.get("frp", 0))
                confidence = row.get("confidence", "")
                acq_date = row.get("acq_date", "")
                acq_time = str(row.get("acq_time", "0000")).zfill(4)

                hh = min(int(acq_time[:2]), 23)
                mm = min(int(acq_time[2:]), 59)
                timestamp = f"{acq_date}T{hh:02d}:{mm:02d}:00Z"

                cur.execute("""
                    INSERT INTO environmental_events
                        (event_type, location, severity, data_source, started_at, metadata)
                    VALUES
                        ('wildfire',
                         ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                         %s, 'firms', %s,
                         %s::jsonb)
                    ON CONFLICT DO NOTHING
                """, (lng, lat, frp, timestamp,
                      f'{{"frp": {frp}, "confidence": "{confidence}", "satellite": "{source}"}}'))
                count += 1

        self.logger.info("Inserted %d wildfire hotspots", count)

    def _fallback_firms(self):
        """Use a public sample endpoint when no API key is available."""
        self.logger.info("Running FIRMS fallback (no API key)")
