"""
One-shot: log in interactively and print TELEGRAM_SESSION_STRING for .env
Run from repo root: pip install -r workers/requirements-telegram.txt && python -m telegram_ingest.export_session
(execute with cwd=workers, or set TELEGRAM_* in environment)
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from pyrogram import Client
from pyrogram.errors import SessionRevoked

_root = Path(__file__).resolve().parents[2]
load_dotenv(_root / ".env")
load_dotenv()


def _remove_stale_session_files(workdir: str, name: str) -> int:
    wd = Path(workdir)
    n = 0
    if not wd.is_dir():
        return 0
    for p in wd.glob(f"{name}.session*"):
        try:
            p.unlink()
            n += 1
            print(f"Removed stale session file: {p}", file=sys.stderr)
        except OSError as e:
            print(f"Could not remove {p}: {e}", file=sys.stderr)
    return n


def main():
    api_id = os.getenv("TELEGRAM_API_ID", "").strip()
    api_hash = os.getenv("TELEGRAM_API_HASH", "").strip()
    if not api_id or not api_hash:
        print("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env or environment.", file=sys.stderr)
        sys.exit(1)
    name = os.getenv("TELEGRAM_SESSION_NAME", "osint_telegram")
    workdir = os.getenv("TELEGRAM_WORKDIR", ".")
    os.makedirs(workdir, exist_ok=True)
    workdir_abs = str(Path(workdir).resolve())

    app = None
    for attempt in range(2):
        app = Client(name, api_id=int(api_id), api_hash=api_hash, workdir=workdir)
        try:
            app.start()
            break
        except SessionRevoked:
            print(
                "\nTelegram rejected this login (SESSION_REVOKED). That happens after “Terminate all other sessions” "
                "or similar — the old Pyrogram session is dead.\n",
                file=sys.stderr,
            )
            print(
                f"Session files are named {name}.session* under TELEGRAM_WORKDIR.\n"
                f"On your machine that folder resolves to: {workdir_abs}\n",
                file=sys.stderr,
            )
            _remove_stale_session_files(workdir, name)
            if attempt == 0:
                print("Retrying once with a clean session (you should get phone / code prompts next)…\n", file=sys.stderr)
                continue
            print(
                "Still failing after cleanup. Then:\n"
                "1) Delete or empty TELEGRAM_SESSION_STRING in repo-root .env (old string is dead for the worker too)\n"
                "2) Run this script again\n"
                "3) For Docker ingest: docker compose -f infrastructure/docker-compose.yml run --rm telegram-ingest "
                "rm -f /data/*.session\n"
                "   then docker compose up -d --force-recreate telegram-ingest\n",
                file=sys.stderr,
            )
            sys.exit(2)

    s = app.export_session_string()
    app.stop()
    print("Add this line to your repo-root .env (single line, no quotes needed if no spaces):")
    print()
    print(f"TELEGRAM_SESSION_STRING={s}")
    print()


if __name__ == "__main__":
    main()
