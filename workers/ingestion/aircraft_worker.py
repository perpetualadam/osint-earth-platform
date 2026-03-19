import requests
from base_worker import BaseWorker
from config import OPENSKY_USERNAME, OPENSKY_PASSWORD

OPENSKY_URL = "https://opensky-network.org/api/states/all"


class AircraftWorker(BaseWorker):
    name = "aircraft"

    def run(self):
        self.logger.info("Fetching live aircraft from OpenSky…")

        def fetch():
            auth = (OPENSKY_USERNAME, OPENSKY_PASSWORD) if OPENSKY_USERNAME else None
            resp = requests.get(OPENSKY_URL, auth=auth, timeout=30)
            resp.raise_for_status()
            return resp.json()

        data = self.run_with_retry(fetch)
        states = data.get("states") or []
        self.logger.info("Received %d aircraft states", len(states))

        if not states:
            return

        values = []
        features = []
        for s in states:
            icao24 = s[0]
            callsign = (s[1] or "").strip()
            lng, lat = s[5], s[6]
            if lng is None or lat is None:
                continue
            altitude = s[7]  # baro_altitude
            velocity = s[9]
            heading = s[10]
            on_ground = s[8]
            ts = s[3]  # time_position

            values.append((
                icao24, callsign, lng, lat, altitude, velocity, heading, on_ground
            ))
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lng, lat]},
                "properties": {
                    "icao24": icao24,
                    "callsign": callsign,
                    "altitude": altitude,
                    "velocity": velocity,
                    "heading": heading,
                    "on_ground": on_ground,
                },
            })

        sql = """
            INSERT INTO aircraft_tracks
                (icao24, callsign, location, altitude, velocity, heading, on_ground, recorded_at)
            VALUES
                (%(icao24)s, %(callsign)s,
                 ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326),
                 %(alt)s, %(vel)s, %(hdg)s, %(gnd)s, NOW())
        """
        with self.conn.cursor() as cur:
            for v in values:
                cur.execute(sql, {
                    "icao24": v[0], "callsign": v[1],
                    "lng": v[2], "lat": v[3],
                    "alt": v[4], "vel": v[5], "hdg": v[6], "gnd": v[7],
                })

        geojson = {"type": "FeatureCollection", "features": features[:500]}
        self.publish("aircraft:live", geojson)
        self.logger.info("Inserted %d aircraft positions", len(values))
