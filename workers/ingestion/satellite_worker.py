import requests
from datetime import datetime, timedelta, timezone
from base_worker import BaseWorker
from config import SENTINEL_HUB_CLIENT_ID, SENTINEL_HUB_CLIENT_SECRET

COPERNICUS_ODATA = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"


class SatelliteWorker(BaseWorker):
    name = "satellite"

    def run(self):
        self.logger.info("Fetching satellite imagery metadata…")

        if SENTINEL_HUB_CLIENT_ID:
            self._fetch_sentinel()
        else:
            self._fetch_copernicus_catalog()

    def _fetch_copernicus_catalog(self):
        """Query the free Copernicus Data Space catalog (no auth required for metadata)."""
        now = datetime.now(timezone.utc)
        start = (now - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ")
        end = now.strftime("%Y-%m-%dT%H:%M:%SZ")

        def fetch():
            resp = requests.get(COPERNICUS_ODATA, params={
                "$filter": (
                    f"Collection/Name eq 'SENTINEL-2' and "
                    f"ContentDate/Start gt {start} and "
                    f"ContentDate/Start lt {end}"
                ),
                "$top": "50",
                "$orderby": "ContentDate/Start desc",
            }, timeout=60)
            resp.raise_for_status()
            return resp.json()

        try:
            data = self.run_with_retry(fetch)
        except Exception as e:
            self.logger.warning("Copernicus catalog query failed: %s", e)
            return

        products = data.get("value", [])
        self.logger.info("Found %d Sentinel-2 products", len(products))

        count = 0
        with self.conn.cursor() as cur:
            for p in products:
                name = p.get("Name", "")
                product_id = p.get("Id", "")
                footprint = p.get("GeoFootprint", {}).get("coordinates")
                cloud_cover = p.get("CloudCover")
                acq_date = p.get("ContentDate", {}).get("Start")

                if not footprint or not acq_date:
                    continue

                try:
                    ring = footprint[0] if isinstance(footprint[0][0], list) else footprint
                    wkt_coords = ", ".join(f"{c[0]} {c[1]}" for c in ring)
                    bbox_wkt = f"POLYGON(({wkt_coords}))"
                except (IndexError, TypeError):
                    continue

                cur.execute("""
                    INSERT INTO satellite_tiles
                        (satellite, band, bbox, acquisition_at, cloud_cover, tile_url, metadata)
                    VALUES
                        ('sentinel-2', 'RGB',
                         ST_GeomFromText(%s, 4326),
                         %s, %s, %s, %s::jsonb)
                    ON CONFLICT DO NOTHING
                """, (
                    bbox_wkt, acq_date, cloud_cover,
                    f"https://catalogue.dataspace.copernicus.eu/odata/v1/Products({product_id})",
                    f'{{"name": "{name}", "product_id": "{product_id}"}}'
                ))
                count += 1

        self.logger.info("Inserted %d satellite tile records", count)

    def _fetch_sentinel(self):
        """Use Sentinel Hub API when credentials are available."""
        self.logger.info("Sentinel Hub fetch (credentials available) — stub")
