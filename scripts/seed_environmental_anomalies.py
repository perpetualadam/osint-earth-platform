#!/usr/bin/env python3
"""
Populate environmental_events and anomalies from live APIs only (no sample/mock data).
Run from project root: python scripts/seed_environmental_anomalies.py
Requires: psycopg2, requests
"""
import os
import json
import requests
from datetime import datetime, timedelta, timezone

import psycopg2

POSTGRES = {
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "port": int(os.getenv("POSTGRES_PORT", "5432")),
    "dbname": os.getenv("POSTGRES_DB", "osint_earth"),
    "user": os.getenv("POSTGRES_USER", "osint"),
    "password": os.getenv("POSTGRES_PASSWORD", "changeme_postgres_password"),
}

FIRMS_MAP_KEY = os.getenv("FIRMS_MAP_KEY", "")
FIRMS_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8000")


def fetch_usgs_earthquakes():
    """Fetch recent earthquakes from USGS (no API key)."""
    url = "https://earthquake.usgs.gov/fdsnws/event/1/query"
    since = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%S")
    try:
        r = requests.get(
            url,
            params={
                "format": "geojson",
                "starttime": since,
                "minmagnitude": 2.5,
                "orderby": "time",
                "limit": 100,
            },
            timeout=30,
        )
        r.raise_for_status()
        return r.json().get("features", [])
    except Exception as e:
        print(f"USGS fetch failed: {e}")
        return []


def fetch_firms_wildfires():
    """Fetch wildfire hotspots from NASA FIRMS (requires FIRMS_MAP_KEY)."""
    if not FIRMS_MAP_KEY:
        print("FIRMS_MAP_KEY not set — skip wildfires. Get a free key at https://firms.modaps.eosdis.nasa.gov/api/map_key/")
        return []
    url = f"{FIRMS_URL}/{FIRMS_MAP_KEY}/VIIRS_NOAA20_NRT/world/1"
    try:
        r = requests.get(url, timeout=60)
        r.raise_for_status()
        return list(__parse_firms_csv(r.text))
    except Exception as e:
        print(f"FIRMS fetch failed: {e}")
        return []


def __parse_firms_csv(text):
    import csv
    import io

    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        try:
            lat = float(row.get("latitude", 0))
            lng = float(row.get("longitude", 0))
            frp = float(row.get("frp", 0))
            confidence = row.get("confidence", "")
            acq_date = row.get("acq_date", "")
            acq_time = str(row.get("acq_time", "0000")).zfill(4)
            hh = min(int(acq_time[:2]), 23)
            mm = min(int(acq_time[2:]), 59)
            timestamp = f"{acq_date}T{hh:02d}:{mm:02d}:00Z"
            yield (lng, lat, frp, timestamp, confidence)
        except (ValueError, KeyError):
            continue


def trigger_ai_anomaly_scan():
    """Call AI service to scan for anomalies from ship/aircraft/event data."""
    try:
        r = requests.post(
            f"{AI_SERVICE_URL}/anomaly/scan",
            params={"anomaly_type": "all", "hours": 24},
            timeout=60,
        )
        r.raise_for_status()
        data = r.json()
        return data.get("anomalies_detected", 0)
    except Exception as e:
        print(f"AI anomaly scan skipped (service not reachable at {AI_SERVICE_URL}): {e}")
        return 0


def main():
    conn = psycopg2.connect(**POSTGRES)
    cur = conn.cursor()

    env_count = 0

    # Earthquakes from USGS (real data, no API key)
    for f in fetch_usgs_earthquakes():
        try:
            coords = f["geometry"]["coordinates"]
            lng, lat = coords[0], coords[1]
            depth = coords[2] if len(coords) > 2 else 0
            props = f["properties"]
            mag = props.get("mag")
            place = props.get("place", "")
            event_time = props.get("time")
            if event_time:
                ts = datetime.fromtimestamp(event_time / 1000, tz=timezone.utc).isoformat()
            else:
                ts = datetime.now(timezone.utc).isoformat()

            cur.execute(
                """
                INSERT INTO environmental_events
                (event_type, location, severity, data_source, started_at, metadata)
                VALUES ('earthquake', ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, 'usgs-eq', %s, %s::jsonb)
            """,
                (lng, lat, mag, ts, json.dumps({"place": place, "depth_km": depth})),
            )
            env_count += 1
        except Exception as e:
            print(f"Skip earthquake: {e}")

    # Wildfires from NASA FIRMS (real data, requires FIRMS_MAP_KEY)
    for lng, lat, frp, timestamp, confidence in fetch_firms_wildfires():
        try:
            cur.execute(
                """
                INSERT INTO environmental_events
                (event_type, location, severity, data_source, started_at, metadata)
                VALUES ('wildfire', ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, 'firms', %s, %s::jsonb)
            """,
                (lng, lat, frp, timestamp, json.dumps({"frp": frp, "confidence": confidence, "satellite": "VIIRS_NOAA20_NRT"})),
            )
            env_count += 1
        except Exception as e:
            print(f"Skip wildfire: {e}")

    conn.commit()

    # Anomalies: trigger AI scan (requires AI service + ship/aircraft/event data in DB)
    anomaly_count = trigger_ai_anomaly_scan()

    cur.close()
    conn.close()
    print(f"Seeded {env_count} environmental events. Anomalies: {anomaly_count} (from AI scan).")


if __name__ == "__main__":
    main()
