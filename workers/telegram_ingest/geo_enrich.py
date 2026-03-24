import logging
import os
import re
import time
import httpx

logger = logging.getLogger(__name__)

_COORD_PAIR = re.compile(
    r"(-?\d{1,3}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)"
)

# "12, 34 killed" style — counts, not coordinates.
_CASUALTY_CTX = re.compile(
    r"\d{1,3}\s*,\s*\d{1,3}\s+(?:dead|killed|injured|wounded|people|victims|missing|hostages)\b",
    re.I,
)

_last_nominatim = 0.0


def _ambiguous_latlon_pair(a: float, b: float, raw_match: str) -> bool:
    """True if (a,b) could be either (lat,lon) or (lon,lat) — easy to misread."""
    if "." in raw_match:
        return False
    if abs(a) > 90 or abs(b) > 90:
        return False
    # Both look like plausible lat/lon components without decimals → ambiguous.
    return abs(a) <= 90 and abs(b) <= 90 and abs(a) >= 5 and abs(b) >= 5


def coords_from_text(text: str):
    """
    Extract explicit coordinates from text. Conservative: skip ambiguous integer
    pairs (e.g. 31, -17 could be Harare lon/lat but old code read as lat/lon → wrong).
    """
    if not text:
        return None, None, 0.0
    for m in _COORD_PAIR.finditer(text):
        raw = m.group(0)
        try:
            a, b = float(m.group(1)), float(m.group(2))
        except ValueError:
            continue
        win = text[max(0, m.start()) : m.end() + 48]
        if _CASUALTY_CTX.search(win):
            continue
        # Tiny integers: often "3, 5" style lists, not map points.
        if "." not in raw and abs(a) <= 11 and abs(b) <= 11:
            continue
        if _ambiguous_latlon_pair(a, b, raw):
            # Let Nominatim use place names instead of guessing order.
            continue
        if -90 <= a <= 90 and -180 <= b <= 180:
            return b, a, 0.85
        if -180 <= a <= 180 and -90 <= b <= 90:
            return a, b, 0.85
    return None, None, 0.0


def clean_for_geocode(line: str) -> str:
    if not line:
        return ""
    s = line.strip()
    s = re.sub(r"https?://\S+", " ", s)
    s = re.sub(r"www\.\S+", " ", s)
    s = re.sub(r"@\w+", " ", s)
    s = re.sub(r"#[\w\u0080-\uFFFF]+", " ", s)
    s = re.sub(r"[\u200b-\u200f\ufeff]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def headline_geocode_candidates(first_line: str, max_parts: int = 5):
    """
    Split headline on common separators. Later segments often carry the place
    (e.g. '… | Harare …'). Try reversed pipe segments first, then full line.
    """
    cleaned = clean_for_geocode(first_line)
    if len(cleaned) < 8:
        return []
    parts = re.split(r"\s*[|│]\s*", cleaned)
    parts = [p.strip() for p in parts if len(p.strip()) >= 6]
    seen = set()
    out = []
    if len(parts) > 1:
        for p in reversed(parts):
            key = p.lower()
            if key not in seen:
                seen.add(key)
                out.append(p[:300])
    key = cleaned.lower()
    if key not in seen:
        out.append(cleaned[:300])
    return out[:max_parts]


def _nominatim_item_score(item: dict) -> float:
    imp = float(item.get("importance") or 0)
    cls = (item.get("class") or "").lower()
    typ = (item.get("type") or "").lower()
    # Down-rank tiny hamlets / admin edges that often mismatch news headlines.
    if typ in ("suburb", "neighbourhood", "hamlet", "isolated_dwelling"):
        imp *= 0.65
    if cls == "highway":
        imp *= 0.5
    if cls in ("place", "boundary", "waterway"):
        imp *= 1.05
    return imp


def nominatim_geocode(query: str, user_agent=None):
    global _last_nominatim
    q = (query or "").strip()
    if len(q) < 6:
        return None, None, 0.0
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
    limit = min(int(os.getenv("TELEGRAM_GEO_NOMINATIM_LIMIT", "5")), 10)
    min_importance = float(os.getenv("TELEGRAM_GEO_MIN_NOMINATIM_IMPORTANCE", "0.28"))
    params = {"q": q[:300], "format": "json", "limit": str(limit)}
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
    best = None
    best_score = -1.0
    for item in data:
        sc = _nominatim_item_score(item)
        if sc < min_importance:
            continue
        if sc > best_score:
            best_score = sc
            best = item
    if not best:
        return None, None, 0.0
    try:
        lat = float(best["lat"])
        lon = float(best["lon"])
    except (KeyError, ValueError, TypeError):
        return None, None, 0.0
    # Confidence scales with Nominatim importance (was flat 0.4).
    conf = max(0.25, min(0.78, 0.28 + best_score * 0.55))
    name = best.get("display_name", "")[:120]
    logger.debug("Nominatim q=%r → %s (importance≈%s, conf=%.2f)", q[:80], name, best.get("importance"), conf)
    return lon, lat, conf


def enrich_location(text, min_confidence=0.25):
    lon, lat, conf = coords_from_text(text or "")
    if conf >= min_confidence:
        return lon, lat, conf
    if os.getenv("TELEGRAM_GEO_FETCH_URLS", "").lower() in ("1", "true", "yes"):
        pass
    first = (text or "").strip().split("\n")[0]
    max_queries = max(1, min(int(os.getenv("TELEGRAM_GEO_MAX_NOMINATIM_QUERIES", "3")), 6))
    candidates = headline_geocode_candidates(first, max_parts=max_queries)
    if not candidates:
        return None, None, 0.0
    best = (None, None, 0.0)
    for q in candidates:
        lon, lat, conf = nominatim_geocode(q)
        if conf > best[2]:
            best = (lon, lat, conf)
        if conf >= 0.72:
            break
    lon, lat, conf = best
    if conf >= min_confidence:
        return lon, lat, conf
    return None, None, 0.0
