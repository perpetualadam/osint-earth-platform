"""
Telegram channel ingest (Pyrogram). Exits 0 if disabled or credentials missing.
"""
import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import redis
from dotenv import load_dotenv
from pyrogram import Client, filters, idle
from pyrogram.errors import FloodWait
from pyrogram.types import Message

from telegram_ingest.channels import load_channel_list
from telegram_ingest.db_ops import connect_pg, insert_post
from telegram_ingest.geo_enrich import enrich_location

load_dotenv()

logging.basicConfig(
    level=os.getenv("WORKER_LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] [telegram_ingest] %(message)s",
)
logger = logging.getLogger("telegram_ingest")


def pg_cfg():
    return {
        "host": os.getenv("POSTGRES_HOST", "localhost"),
        "port": int(os.getenv("POSTGRES_PORT", "5432")),
        "dbname": os.getenv("POSTGRES_DB", "osint_earth"),
        "user": os.getenv("POSTGRES_USER", "osint"),
        "password": os.getenv("POSTGRES_PASSWORD", ""),
    }


def redis_url():
    pw = os.getenv("REDIS_PASSWORD", "")
    host = os.getenv("REDIS_HOST", "localhost")
    port = os.getenv("REDIS_PORT", "6379")
    return f"redis://:{pw}@{host}:{port}/0"


def maybe_translate(text):
    if not text or len(text.strip()) < 2:
        return None
    url = os.getenv("LIBRETRANSLATE_URL", "https://libretranslate.com").rstrip("/")
    try:
        import httpx

        with httpx.Client(timeout=12.0) as c:
            r = c.post(
                f"{url}/translate",
                json={"q": text[:5000], "source": "auto", "target": "en"},
            )
            if r.status_code != 200:
                return None
            data = r.json()
            en = data.get("translatedText")
            if en and en != text:
                return en
    except Exception:
        pass
    return None


def _posted_at(message):
    d = message.date
    if d is None:
        return None
    if d.tzinfo is None:
        return d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc)


def ingest_one_message(message: Message, conn, rds, min_geo, *, do_translate: bool, publish: bool) -> bool:
    """
    Parse, optionally translate, geocode, insert. Returns True if a new DB row was inserted.
    """
    if not message.text:
        return False
    text = message.text or ""
    text_en = maybe_translate(text) if do_translate else None
    lon, lat, gconf = enrich_location(text, min_confidence=min_geo)
    posted = _posted_at(message)
    if posted is None:
        return False
    row = {
        "telegram_message_id": message.id,
        "channel_id": message.chat.id,
        "channel_username": (message.chat.username or "")[:255] or None,
        "text": text[:20000],
        "text_en": text_en,
        "posted_at": posted,
        "lon": lon,
        "lat": lat,
        "geo_confidence": gconf if lon is not None else None,
        "metadata": json.dumps(
            {
                "message_id": message.id,
                "chat_id": message.chat.id,
                "views": getattr(message, "views", None),
            }
        ),
    }
    try:
        inserted = insert_post(conn, row)
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error("DB insert failed: %s", e)
        return False
    if inserted and publish:
        try:
            rds.publish(
                "telegram:new",
                json.dumps(
                    {
                        "channel_id": message.chat.id,
                        "message_id": message.id,
                        "lat": lat,
                        "lon": lon,
                    }
                ),
            )
        except Exception as e:
            logger.warning("Redis publish failed: %s", e)
    return inserted


async def backfill_channel_history(app, conn, rds, channel_username, cutoff_utc, min_geo, *, translate: bool) -> int:
    """Fetch channel messages down to cutoff_utc (history is newest-first). Returns count of new DB rows."""
    inserted = 0
    try:
        chat = await app.get_chat(channel_username)
    except Exception as e:
        logger.warning("Backfill: skip chat %r: %s", channel_username, e)
        return 0

    for attempt in range(4):
        try:
            async for message in app.get_chat_history(chat.id, limit=0):
                if not message.text:
                    continue
                posted = _posted_at(message)
                if posted is not None and posted < cutoff_utc:
                    break
                if ingest_one_message(
                    message, conn, rds, min_geo, do_translate=translate, publish=False
                ):
                    inserted += 1
                await asyncio.sleep(0)
            break
        except FloodWait as e:
            wait_s = int(e.value) + 1
            logger.warning("Backfill FloodWait %ss for %r (attempt %s)", wait_s, channel_username, attempt + 1)
            await asyncio.sleep(wait_s)
        except Exception as e:
            logger.warning("Backfill history failed for %r: %s", channel_username, e)
            break

    if inserted:
        logger.info("Backfill: %r — %s new row(s)", channel_username, inserted)
    return inserted


def main():
    if os.getenv("TELEGRAM_INGEST_ENABLED", "true").lower() in ("0", "false", "no"):
        logger.info("Telegram ingest disabled (TELEGRAM_INGEST_ENABLED=false). Exiting.")
        sys.exit(0)

    api_id = os.getenv("TELEGRAM_API_ID", "").strip()
    api_hash = os.getenv("TELEGRAM_API_HASH", "").strip()
    if not api_id or not api_hash:
        logger.warning(
            "Telegram ingest skipped: set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env "
            "(https://my.telegram.org/apps). Container exiting."
        )
        sys.exit(0)

    try:
        api_id_int = int(api_id)
    except ValueError:
        logger.error("TELEGRAM_API_ID must be numeric")
        sys.exit(1)

    try:
        channel_usernames = load_channel_list()
    except Exception as e:
        logger.error("Channels config: %s", e)
        sys.exit(1)

    if not channel_usernames:
        logger.warning("No channels in telegram_channels.yaml — edit workers/config/telegram_channels.yaml, then restart. Exiting.")
        sys.exit(0)

    session_name = os.getenv("TELEGRAM_SESSION_NAME", "osint_telegram")
    workdir = os.getenv("TELEGRAM_WORKDIR", "/data")
    os.makedirs(workdir, exist_ok=True)
    session_string = os.getenv("TELEGRAM_SESSION_STRING", "").strip() or None

    session_file = Path(workdir) / f"{session_name}.session"
    has_session = bool(session_string) or session_file.is_file()
    if not has_session:
        if sys.stdin.isatty():
            logger.info("No session file or TELEGRAM_SESSION_STRING — interactive login will run.")
        else:
            logger.error(
                "No Telegram session. Add to repo-root .env:\n"
                "  TELEGRAM_SESSION_STRING=<from Pyrogram export_session_string()>\n"
                "Or run once with a TTY (creates session file in volume):\n"
                "  cd infrastructure && docker compose run --rm -it telegram-ingest\n"
                "See workers/telegram_ingest/README.md"
            )
            sys.exit(0)

    min_geo = float(os.getenv("TELEGRAM_GEO_MIN_CONFIDENCE", "0.25"))

    conn = connect_pg(pg_cfg())
    rds = redis.from_url(redis_url(), decode_responses=True)

    if session_string:
        app = Client(
            session_name,
            api_id=api_id_int,
            api_hash=api_hash,
            session_string=session_string,
        )
    else:
        app = Client(session_name, api_id=api_id_int, api_hash=api_hash, workdir=workdir)

    chats_filter = channel_usernames

    raw_days = os.getenv("TELEGRAM_HISTORY_DAYS", "5").strip()
    try:
        history_days = int(raw_days)
    except ValueError:
        logger.warning("TELEGRAM_HISTORY_DAYS invalid %r — using 5", raw_days)
        history_days = 5
    history_days = max(0, min(history_days, 365))

    translate_backfill = os.getenv("TELEGRAM_HISTORY_TRANSLATE", "false").lower() in (
        "1",
        "true",
        "yes",
    )

    @app.on_message(filters.chat(chats_filter) & filters.channel)
    def on_channel_message(_client, message: Message):
        ingest_one_message(message, conn, rds, min_geo, do_translate=True, publish=True)

    async def main_coro():
        async with app:
            if history_days > 0:
                cutoff = datetime.now(timezone.utc) - timedelta(days=history_days)
                logger.info(
                    "Backfill: loading history back to %s (%d day window; set TELEGRAM_HISTORY_DAYS=0 to skip)",
                    cutoff.isoformat(),
                    history_days,
                )
                total_new = 0
                for uname in chats_filter:
                    total_new += await backfill_channel_history(
                        app, conn, rds, uname, cutoff, min_geo, translate=translate_backfill
                    )
                    await asyncio.sleep(0.15)
                logger.info(
                    "Backfill: finished — %s new row(s) inserted (duplicates skipped); live ingest active",
                    total_new,
                )
                if total_new > 0:
                    try:
                        rds.publish("telegram:new", json.dumps({"backfill": True, "inserted": total_new}))
                    except Exception as e:
                        logger.warning("Redis publish after backfill failed: %s", e)
            await idle()

    logger.info("Starting Telegram ingest for %d channel(s): %s", len(chats_filter), chats_filter)
    app.run(main_coro())


if __name__ == "__main__":
    main()
