"""
UCDP Georeferenced Event Dataset (GED) via the UCDP REST API.

Docs: https://ucdp.uu.se/apidocs/
- Authenticated requests: header ``x-ucdp-access-token`` (token from UCDP maintainer).
- Versioned URLs: ``/api/gedevents/<version>?pagesize=&page=&StartDate=&EndDate=...``
- StartDate/EndDate filter on ``date_end`` (YYYY-MM-DD).

Quota: 5000 requests/day (errors count). This worker caps pages per run via UCDP_MAX_PAGES_PER_RUN.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone

import requests

from base_worker import BaseWorker
from config import UCDP_API_BASE, UCDP_API_VERSION

UCDP_GED_SOURCE = "ucdp_ged"


def _violence_label(code: int | None) -> str:
    if code == 1:
        return "state_based"
    if code == 2:
        return "non_state"
    if code == 3:
        return "one_sided"
    return "unknown"


def _severity_from_best(best: int | None) -> int:
    if best is None or best <= 0:
        return 1
    if best <= 5:
        return 2
    if best <= 20:
        return 3
    if best <= 100:
        return 4
    return 5


def _parse_date_end(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        d = datetime.strptime(s[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        return d
    except ValueError:
        return None


class UcdpWorker(BaseWorker):
    name = "ucdp"

    def run(self):
        token = os.getenv("UCDP_ACCESS_TOKEN", "").strip()
        if not token:
            self.logger.info(
                "UCDP GED skipped: set UCDP_ACCESS_TOKEN when your token is issued "
                "(see https://ucdp.uu.se/apidocs/)."
            )
            return

        pagesize = max(1, min(int(os.getenv("UCDP_PAGESIZE", "500")), 1000))
        sync_days = max(1, min(int(os.getenv("UCDP_SYNC_DAYS", "14")), 366))
        max_pages = max(1, min(int(os.getenv("UCDP_MAX_PAGES_PER_RUN", "40")), 500))

        end_d = datetime.now(timezone.utc).date()
        start_d = end_d - timedelta(days=sync_days)
        start_str = start_d.isoformat()
        end_str = end_d.isoformat()

        version = os.getenv("UCDP_API_VERSION", UCDP_API_VERSION or "25.1").strip()
        base = os.getenv("UCDP_API_BASE", UCDP_API_BASE).strip()
        url = f"{base.rstrip('/')}/gedevents/{version}"
        headers = {"x-ucdp-access-token": token}

        inserted = 0
        page = 0

        while page < max_pages:
            page += 1
            params = {
                "pagesize": pagesize,
                "page": page,
                "StartDate": start_str,
                "EndDate": end_str,
            }
            try:
                r = requests.get(url, headers=headers, params=params, timeout=60)
            except requests.RequestException as e:
                self.logger.warning("UCDP request failed (page %s): %s", page, e)
                break

            if r.status_code == 401 or r.status_code == 403:
                self.logger.warning(
                    "UCDP returned %s — check UCDP_ACCESS_TOKEN and API access.",
                    r.status_code,
                )
                break

            if not r.ok:
                self.logger.warning("UCDP HTTP %s: %s", r.status_code, (r.text or "")[:200])
                break

            try:
                payload = r.json()
            except json.JSONDecodeError:
                self.logger.warning("UCDP response was not JSON")
                break

            results = payload.get("Result") or []
            total_pages = int(payload.get("TotalPages") or 0)

            for ev in results:
                if self._insert_event(ev):
                    inserted += 1

            if page >= total_pages or not results:
                break

        if inserted:
            self.logger.info("UCDP GED: inserted %s new event(s) (%s … %s)", inserted, start_str, end_str)
            self.publish("events:new", {"source": UCDP_GED_SOURCE, "count": inserted})
        else:
            self.logger.info("UCDP GED: no new rows (window %s … %s, up to %s pages)", start_str, end_str, max_pages)

    def _insert_event(self, ev: dict) -> bool:
        lat = ev.get("latitude")
        lon = ev.get("longitude")
        if lat is None or lon is None:
            return False
        try:
            lat_f = float(lat)
            lon_f = float(lon)
        except (TypeError, ValueError):
            return False

        relid = ev.get("relid")
        eid = ev.get("id")
        source_id = str(relid).strip() if relid is not None else (str(eid) if eid is not None else "")
        if not source_id:
            return False

        occurred = _parse_date_end(ev.get("date_end")) or _parse_date_end(ev.get("date_start"))
        if occurred is None:
            return False

        tv = ev.get("type_of_violence")
        try:
            tv_int = int(tv) if tv is not None else None
        except (TypeError, ValueError):
            tv_int = None

        title = (ev.get("conflict_name") or ev.get("dyad_name") or "UCDP GED event")[:500]
        desc_parts = [
            ev.get("where_description"),
            ev.get("where_coordinates"),
            ev.get("adm_1"),
        ]
        description = " — ".join(p for p in desc_parts if p)[:2000] or None

        best = ev.get("best")
        try:
            best_int = int(best) if best is not None else None
        except (TypeError, ValueError):
            best_int = None

        meta = {
            "ucdp_id": eid,
            "relid": relid,
            "year": ev.get("year"),
            "country": ev.get("country"),
            "region": ev.get("region"),
            "type_of_violence": tv_int,
            "violence_type": _violence_label(tv_int),
            "dyad_name": ev.get("dyad_name"),
            "side_a": ev.get("side_a"),
            "side_b": ev.get("side_b"),
            "deaths_best": best_int,
            "source_headline": ev.get("source_headline"),
            "source_office": ev.get("source_office"),
            "code_status": ev.get("code_status"),
            "dataset_version": os.getenv("UCDP_API_VERSION", UCDP_API_VERSION or "25.1").strip(),
        }

        severity = _severity_from_best(best_int)

        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO events (
                    event_type, title, description, location, severity,
                    source, source_id, occurred_at, metadata
                )
                SELECT %s, %s, %s,
                       ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                       %s, %s, %s, %s::timestamptz, %s::jsonb
                WHERE NOT EXISTS (
                    SELECT 1 FROM events WHERE source = %s AND source_id = %s
                )
                """,
                (
                    "conflict",
                    title,
                    description,
                    lon_f,
                    lat_f,
                    severity,
                    UCDP_GED_SOURCE,
                    source_id,
                    occurred.isoformat(),
                    json.dumps(meta),
                    UCDP_GED_SOURCE,
                    source_id,
                ),
            )
            return cur.rowcount > 0
