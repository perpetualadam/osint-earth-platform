import time
import requests
from base_worker import BaseWorker
from config import (
    OPENSKY_USERNAME, OPENSKY_PASSWORD,
    OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET,
)

OPENSKY_URL = "https://opensky-network.org/api/states/all"

CATEGORY_NAMES = {
    0: "", 1: "No ADS-B", 2: "Light", 3: "Small",
    4: "Large", 5: "High Vortex", 6: "Heavy", 7: "High Perf",
    8: "Rotorcraft", 9: "Glider", 10: "Lighter-than-air",
    11: "Parachutist", 12: "Ultralight", 14: "UAV",
    15: "Space vehicle", 16: "Emergency vehicle", 17: "Service vehicle",
    19: "Obstacle",
}
OPENSKY_TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"

_token_cache = {"access_token": None, "expires_at": 0}


def _get_oauth_token():
    if _token_cache["access_token"] and time.time() < _token_cache["expires_at"] - 30:
        return _token_cache["access_token"]
    resp = requests.post(OPENSKY_TOKEN_URL, data={
        "grant_type": "client_credentials",
        "client_id": OPENSKY_CLIENT_ID,
        "client_secret": OPENSKY_CLIENT_SECRET,
    }, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    _token_cache["access_token"] = data["access_token"]
    _token_cache["expires_at"] = time.time() + data.get("expires_in", 300)
    return data["access_token"]


class AircraftWorker(BaseWorker):
    name = "aircraft"

    def run(self):
        self.logger.info("Fetching live aircraft from OpenSky…")

        def fetch():
            if OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET:
                token = _get_oauth_token()
                headers = {"Authorization": f"Bearer {token}"}
                resp = requests.get(OPENSKY_URL, headers=headers, timeout=30)
            elif OPENSKY_USERNAME:
                resp = requests.get(OPENSKY_URL, auth=(OPENSKY_USERNAME, OPENSKY_PASSWORD), timeout=30)
            else:
                resp = requests.get(OPENSKY_URL, timeout=30)
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
            origin_country = s[2] or ""
            lng, lat = s[5], s[6]
            if lng is None or lat is None:
                continue
            # OpenSky: [7]=baro_altitude m, [13]=geo_altitude m — baro is often null while geo is set.
            baro = s[7] if len(s) > 7 else None
            geo_alt = s[13] if len(s) > 13 else None
            altitude = baro if baro is not None else geo_alt
            velocity = s[9]
            heading = s[10]
            on_ground = s[8]
            vertical_rate = s[11]
            squawk = s[14] if len(s) > 14 else None
            category = s[17] if len(s) > 17 else 0
            category_name = CATEGORY_NAMES.get(category, "")

            values.append({
                "icao24": icao24, "callsign": callsign, "lng": lng, "lat": lat,
                "alt": altitude, "vel": velocity, "hdg": heading, "gnd": on_ground,
                "origin_country": origin_country, "category": category_name,
                "vertical_rate": vertical_rate, "squawk": squawk or "",
            })
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
                    "origin_country": origin_country,
                    "vertical_rate": vertical_rate,
                    "squawk": squawk,
                    "category": category_name,
                },
            })

        sql = """
            INSERT INTO aircraft_tracks
                (icao24, callsign, location, altitude, velocity, heading, on_ground,
                 origin_country, category, vertical_rate, squawk, recorded_at)
            VALUES
                (%(icao24)s, %(callsign)s,
                 ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326),
                 %(alt)s, %(vel)s, %(hdg)s, %(gnd)s,
                 %(origin_country)s, %(category)s, %(vertical_rate)s, %(squawk)s, NOW())
        """
        with self.conn.cursor() as cur:
            for v in values:
                cur.execute(sql, v)

        geojson = {"type": "FeatureCollection", "features": features[:500]}
        self.publish("aircraft:live", geojson)
        self.logger.info("Inserted %d aircraft positions", len(values))
