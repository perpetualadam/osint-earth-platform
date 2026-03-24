import os
from pathlib import Path

import yaml


def load_channel_list():
    """Resolve YAML path from TELEGRAM_CHANNELS_CONFIG or default next to this package."""
    default = Path(__file__).resolve().parent.parent / "config" / "telegram_channels.yaml"
    path = Path(os.getenv("TELEGRAM_CHANNELS_CONFIG", str(default)))
    if not path.is_file():
        raise FileNotFoundError(f"Telegram channels config not found: {path}")
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    raw = data.get("channels") or data.get("channel_list") or []
    out = []
    for item in raw:
        if isinstance(item, str):
            u = item.strip().lstrip("@")
            if u and not u.startswith("#"):
                out.append(u)
        elif isinstance(item, dict):
            u = (item.get("username") or item.get("channel") or "").strip().lstrip("@")
            if u:
                out.append(u)
    return out
