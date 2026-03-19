import requests
from base_worker import BaseWorker

AIS_URL = "https://data.aishub.net/ws.php"


class ShipWorker(BaseWorker):
    name = "ship"

    def run(self):
        self.logger.info("Fetching AIS ship data…")

        def fetch():
            resp = requests.get(AIS_URL, params={
                "username": "AH_DEMO",
                "format": "1",
                "output": "json",
                "compress": "0",
            }, timeout=30)
            resp.raise_for_status()
            return resp.json()

        try:
            data = self.run_with_retry(fetch)
        except Exception as e:
            self.logger.warning("AIS fetch failed (demo key may be rate-limited): %s", e)
            return

        records = data if isinstance(data, list) else data.get("records", data.get("data", []))
        if isinstance(records, list) and len(records) > 1 and isinstance(records[0], dict):
            pass
        else:
            self.logger.info("No valid AIS records received")
            return

        self.logger.info("Received %d AIS records", len(records))
        features = []

        with self.conn.cursor() as cur:
            for r in records:
                mmsi = str(r.get("MMSI", r.get("mmsi", "")))
                lng = r.get("LONGITUDE", r.get("longitude"))
                lat = r.get("LATITUDE", r.get("latitude"))
                if not mmsi or lng is None or lat is None:
                    continue

                lng = float(lng) / 600000 if abs(float(lng)) > 180 else float(lng)
                lat = float(lat) / 600000 if abs(float(lat)) > 90 else float(lat)

                speed = r.get("SPEED", r.get("speed"))
                course = r.get("COURSE", r.get("course"))
                heading = r.get("HEADING", r.get("heading"))
                name = r.get("NAME", r.get("name", ""))
                ship_type = r.get("TYPE", r.get("type", ""))

                cur.execute("""
                    INSERT INTO ship_tracks
                        (mmsi, vessel_name, vessel_type, location, speed, course, heading, recorded_at)
                    VALUES
                        (%s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s, %s, NOW())
                """, (mmsi, name, ship_type, lng, lat, speed, course, heading))

                features.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lng, lat]},
                    "properties": {"mmsi": mmsi, "vessel_name": name, "speed": speed},
                })

        if features:
            self.publish("ships:live", {"type": "FeatureCollection", "features": features[:500]})
        self.logger.info("Inserted %d ship positions", len(features))
