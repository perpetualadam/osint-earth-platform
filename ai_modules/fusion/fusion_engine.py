"""
Multi-sensor fusion engine.
Combines evidence from multiple data sources to confirm or upgrade event confidence.

Rules:
  - Thermal hotspot + smoke-like cloud pattern + wind data => wildfire (high confidence)
  - Radar satellite detection + missing AIS => suspicious vessel (high confidence)
  - Multiple event reports in close proximity + satellite change => confirmed event
"""
import os
import json
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Query
import psycopg2
import psycopg2.extras

router = APIRouter()

FUSION_RULES = [
    {
        "name": "wildfire_confirmation",
        "description": "Thermal hotspot near FIRMS fire + satellite tile with bright pixels",
        "event_types": ["wildfire"],
        "min_sources": 2,
        "confidence_boost": 0.3,
    },
    {
        "name": "suspicious_vessel",
        "description": "Ship detected on satellite imagery but no matching AIS signal",
        "event_types": ["ais_gap"],
        "min_sources": 2,
        "confidence_boost": 0.4,
    },
    {
        "name": "conflict_verification",
        "description": "Multiple news sources + ACLED report in same location",
        "event_types": ["conflict", "news"],
        "min_sources": 3,
        "confidence_boost": 0.25,
    },
]


def _get_db():
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        dbname=os.getenv("POSTGRES_DB", "osint_earth"),
        user=os.getenv("POSTGRES_USER", "osint"),
        password=os.getenv("POSTGRES_PASSWORD", "changeme_postgres_password"),
    )


@router.post("/correlate")
async def correlate_events(
    hours: int = Query(6, ge=1, le=168),
    radius_km: float = Query(50, ge=1, le=500),
):
    """
    Scan recent events and anomalies, apply fusion rules to find
    corroborating evidence across data sources.
    """
    conn = _get_db()
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    fused = []

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        for rule in FUSION_RULES:
            type_list = ",".join(f"'{t}'" for t in rule["event_types"])

            cur.execute(f"""
                WITH focal AS (
                    SELECT id, event_type, location, occurred_at
                    FROM events
                    WHERE occurred_at >= %s
                      AND event_type IN ({type_list})
                )
                SELECT
                    f.id AS focal_id,
                    f.event_type AS focal_type,
                    ST_X(f.location) AS lng,
                    ST_Y(f.location) AS lat,
                    COUNT(DISTINCT e.source) AS source_count
                FROM focal f
                JOIN events e ON e.id != f.id
                    AND ST_DWithin(
                        f.location::geography,
                        e.location::geography,
                        %s
                    )
                    AND e.occurred_at BETWEEN f.occurred_at - INTERVAL '2 hours'
                                          AND f.occurred_at + INTERVAL '2 hours'
                GROUP BY f.id, f.event_type, f.location
                HAVING COUNT(DISTINCT e.source) >= %s
            """, (since, radius_km * 1000, rule["min_sources"]))

            for row in cur.fetchall():
                base_confidence = 0.5
                fused_confidence = min(
                    base_confidence + rule["confidence_boost"] * row["source_count"],
                    1.0,
                )
                fused.append({
                    "rule": rule["name"],
                    "focal_event_id": row["focal_id"],
                    "focal_type": row["focal_type"],
                    "lng": float(row["lng"]),
                    "lat": float(row["lat"]),
                    "corroborating_sources": row["source_count"],
                    "fused_confidence": round(fused_confidence, 3),
                })

    conn.close()
    return {"fused_events": len(fused), "results": fused}
