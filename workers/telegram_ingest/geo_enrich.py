import logging
import os
import re
import time
import httpx

logger = logging.getLogger(__name__)

_COORD_PAIR = re.compile(
    r"(-?\d{1,3}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)"
)

_last_nominatim = 0.0


def coords_from_text(text):
    if not text:
        return None, None, 0.0
    m = _COORD_PAIR.search(text)
    if not m:
        return None, None, 0.0
    try:
        a, b = float(m.group(1)), float(m.group(2))
    except ValueError:
        return None, None, 0.0
    # Heuristic: if first is lat-like and second lon-like for US/EU
    if -90 <= a <= 90 and -180 <= b <= 180:
        return b, a, 0.85
    if -180 <= a <= 180 and -90 <= b <= 90:
        return a, b, 0.85
    return None, None, 0.0


def nominatim_geocode(query, user_agent=None):
    global _last_nominatim
    url = os.getenv("NOMINATIM_URL", "https://nominatim.openstreetmap.org").rstrip("/")
    ua = user_agent or os.getenv(
        "NOMINATIM_USER_AGENT",
        "OSINT-Earth-TelegramIngest/1.0",
    )
    min_interval = float(os.getenv("NOMINATIM_MIN_INTERVAL_SEC", "1.1"))
    now = time.monotonic()
    wait = min_interval - (now - _last_nominatim)
    if wait > 0:
        time.sleep(wait)
    _last_nominatim = time.monotonic()
    params = {"q": query[:300], "format": "json", "limit": 1}
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.get(
                f"{url}/search",
                params=params,
                headers={"User-Agent": ua},
            )
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        logger.debug("Nominatim failed: %s", e)
        return None, None, 0.0
    if not data:
        return None, None, 0.0
    item = data[0]
    try:
        lat = float(item["lat"])
        lon = float(item["lon"])
    except (KeyError, ValueError, TypeError):
        return None, None, 0.0
    return lon, lat, 0.4


def enrich_location(text, min_confidence=0.25):
    lon, lat, conf = coords_from_text(text or "")
    if conf >= min_confidence:
        return lon, lat, conf
    if os.getenv("TELEGRAM_GEO_FETCH_URLS", "").lower() in ("1", "true", "yes"):
        pass
    q = (text or "").strip().split("\n")[0][:200]
    if len(q) < 8:
        return None, None, 0.0
    lon, lat, conf = nominatim_geocode(q)
    if conf >= min_confidence:
        return lon, lat, conf
    return None, None, 0.0
