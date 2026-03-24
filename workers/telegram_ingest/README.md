# Telegram channel ingest

## Environment (repo root `.env`)

Required:

- `TELEGRAM_API_ID` — numeric, from [my.telegram.org/apps](https://my.telegram.org/apps)
- `TELEGRAM_API_HASH` — string, same page

One of:

- **`TELEGRAM_SESSION_STRING`** — Pyrogram string session (best for Docker `up -d` without TTY), or
- **Session file** — after one interactive login, `{TELEGRAM_SESSION_NAME}.session` under `TELEGRAM_WORKDIR` (default `/data` in Docker, mapped to volume `telegram_session`).

Optional: `TELEGRAM_SESSION_NAME` (default `osint_telegram`), `TELEGRAM_INGEST_ENABLED=false` to skip.

**History backfill (on each container start):** `TELEGRAM_HISTORY_DAYS` (default `5`, max `365`) pulls older channel posts down to that age before live ingest runs. Set `0` to disable. Duplicates are skipped (`ON CONFLICT`). Backfill does not publish `telegram:new` for every row (avoids flooding the UI); refresh the map or widen the timeline. Optional `TELEGRAM_HISTORY_TRANSLATE=true` translates during backfill (slower).

Channels: edit `workers/config/telegram_channels.yaml` (mounted in compose).

## Get `TELEGRAM_SESSION_STRING` (local Python, same API id/hash)

```bash
cd workers
pip install -r requirements-telegram.txt
# TELEGRAM_API_ID / TELEGRAM_API_HASH in env or export them
python -m telegram_ingest.export_session
```

Copy the printed line into `.env`:

```
TELEGRAM_SESSION_STRING=...
```

## Interactive login inside Docker (session file)

```bash
cd infrastructure
docker compose run --rm -it telegram-ingest
```

Enter phone, Telegram code, and 2FA if prompted. Then Ctrl+C and:

```bash
docker compose up -d telegram-ingest
```

The session file persists in the `telegram_session` volume.
