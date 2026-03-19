"""
Statistical anomaly detection engine.
Computes z-scores against rolling baselines to flag unusual patterns
in AIS gaps, aircraft loitering, sudden event clusters, etc.
"""
import os
import json
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Query
import psycopg2
import psycopg2.extras
import redis as redis_lib

router = APIRouter()


def _get_db():
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        dbname=os.getenv("POSTGRES_DB", "osint_earth"),
        user=os.getenv("POSTGRES_USER", "osint"),
        password=os.getenv("POSTGRES_PASSWORD", "changeme_postgres_password"),
    )


def _get_redis():
    return redis_lib.from_url(
        f"redis://:{os.getenv('REDIS_PASSWORD', '')}@{os.getenv('REDIS_HOST', 'localhost')}:6379/0",
        decode_responses=True,
    )


@router.post("/scan")
async def scan_anomalies(
    anomaly_type: str = Query("all"),
    hours: int = Query(6, ge=1, le=168),
):
    """
    Scan recent data for anomalies and store detections.
    Supported types: ais_gap, loiter, event_cluster, all.
    """
    conn = _get_db()
    r = _get_redis()
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=hours)
    results = []

    if anomaly_type in ("ais_gap", "all"):
        results.extend(_detect_ais_gaps(conn, since))

    if anomaly_type in ("loiter", "all"):
        results.extend(_detect_loitering(conn, since))

    if anomaly_type in ("event_cluster", "all"):
        results.extend(_detect_event_clusters(conn, since))

    with conn.cursor() as cur:
        for a in results:
            cur.execute("""
                INSERT INTO anomalies
                    (anomaly_type, location, score, baseline_value, observed_value,
                     detection_method, detected_at, metadata)
                VALUES
                    (%s, ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                     %s, %s, %s, %s, NOW(), %s::jsonb)
            """, (
                a["type"], a["lng"], a["lat"], a["score"],
                a.get("baseline"), a.get("observed"),
                a["method"], json.dumps(a.get("meta", {})),
            ))
    conn.commit()

    for a in results:
        r.publish("anomalies:new", json.dumps(a, default=str))

    conn.close()
    return {"anomalies_detected": len(results), "results": results}


def _detect_ais_gaps(conn, since):
    """Ships that were recently active but stopped transmitting."""
    anomalies = []
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            WITH recent AS (
                SELECT mmsi, MAX(recorded_at) AS last_seen,
                       ST_X(location) AS lng, ST_Y(location) AS lat
                FROM (
                    SELECT DISTINCT ON (mmsi) mmsi, recorded_at, location
                    FROM ship_tracks
                    WHERE recorded_at >= %s
                    ORDER BY mmsi, recorded_at DESC
                ) sub
                GROUP BY mmsi, location
            )
            SELECT mmsi, last_seen, lng, lat
            FROM recent
            WHERE last_seen < NOW() - INTERVAL '30 minutes'
        """, (since,))

        for row in cur.fetchall():
            gap_minutes = (datetime.now(timezone.utc) - row["last_seen"].replace(tzinfo=timezone.utc)).total_seconds() / 60
            score = min(gap_minutes / 60, 10.0)
            anomalies.append({
                "type": "ais_gap",
                "lng": float(row["lng"]),
                "lat": float(row["lat"]),
                "score": round(score, 2),
                "baseline": 0,
                "observed": round(gap_minutes, 1),
                "method": "ais_gap_detector",
                "meta": {"mmsi": row["mmsi"], "gap_minutes": round(gap_minutes, 1)},
            })
    return anomalies


def _detect_loitering(conn, since):
    """Aircraft that have many position reports in a small area (circling)."""
    anomalies = []
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT icao24, COUNT(*) AS reports,
                   AVG(ST_X(location)) AS avg_lng,
                   AVG(ST_Y(location)) AS avg_lat,
                   ST_MaxDistance(
                       ST_Collect(location), ST_Centroid(ST_Collect(location))
                   ) AS max_dist_deg
            FROM aircraft_tracks
            WHERE recorded_at >= %s AND on_ground = FALSE
            GROUP BY icao24
            HAVING COUNT(*) >= 10
               AND ST_MaxDistance(
                   ST_Collect(location), ST_Centroid(ST_Collect(location))
               ) < 0.05
        """, (since,))

        for row in cur.fetchall():
            score = min(float(row["reports"]) / 20, 10.0)
            anomalies.append({
                "type": "loiter",
                "lng": float(row["avg_lng"]),
                "lat": float(row["avg_lat"]),
                "score": round(score, 2),
                "baseline": 2,
                "observed": int(row["reports"]),
                "method": "loiter_detector",
                "meta": {"icao24": row["icao24"], "reports": int(row["reports"])},
            })
    return anomalies


def _detect_event_clusters(conn, since):
    """Unusual spatial clustering of events."""
    anomalies = []
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT
                ROUND(ST_X(location)::numeric, 1) AS grid_lng,
                ROUND(ST_Y(location)::numeric, 1) AS grid_lat,
                COUNT(*) AS event_count
            FROM events
            WHERE occurred_at >= %s
            GROUP BY grid_lng, grid_lat
            HAVING COUNT(*) >= 10
        """, (since,))

        for row in cur.fetchall():
            score = min(float(row["event_count"]) / 20, 10.0)
            anomalies.append({
                "type": "event_cluster",
                "lng": float(row["grid_lng"]),
                "lat": float(row["grid_lat"]),
                "score": round(score, 2),
                "baseline": 3,
                "observed": int(row["event_count"]),
                "method": "spatial_cluster_detector",
                "meta": {"grid_events": int(row["event_count"])},
            })
    return anomalies
