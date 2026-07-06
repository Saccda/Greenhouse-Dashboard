"""
Telegram Bot notification service.

Uses only the `requests` library (already a dependency) — no Telegram SDK needed.
Configure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env to enable.

How to get your credentials:
  1. Open Telegram → search for @BotFather → /newbot → follow prompts
  2. Copy the token BotFather gives you → TELEGRAM_BOT_TOKEN
  3. Send any message to your new bot, then visit:
     https://api.telegram.org/bot<TOKEN>/getUpdates
     and copy the "chat":{"id": ...} value → TELEGRAM_CHAT_ID
"""
from __future__ import annotations

import requests
import config

_API = "https://api.telegram.org/bot{token}/sendMessage"


def is_configured() -> bool:
    return bool(config.TELEGRAM_BOT_TOKEN and config.TELEGRAM_CHAT_ID)


def _chat_ids() -> list[str]:
    """
    Parse TELEGRAM_CHAT_ID into a list.
    Supports a single ID or comma-separated IDs, e.g.:
        644817923
        644817923,-1001234567890
    """
    raw = config.TELEGRAM_CHAT_ID
    return [cid.strip() for cid in raw.split(",") if cid.strip()]


def send_message(text: str) -> bool:
    """
    Send a Markdown-formatted message to all configured chat IDs.
    Returns True if every send succeeded, False if any failed.
    """
    if not is_configured():
        print("[Telegram] Not configured — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env")
        return False

    token    = config.TELEGRAM_BOT_TOKEN
    chat_ids = _chat_ids()
    all_ok   = True

    for chat_id in chat_ids:
        try:
            resp = requests.post(
                _API.format(token=token),
                json={
                    "chat_id":    chat_id,
                    "text":       text,
                    "parse_mode": "Markdown",
                },
                timeout=10,
            )
            if not resp.ok:
                print(f"[Telegram] Send to {chat_id} failed: {resp.status_code} — {resp.text[:200]}")
                all_ok = False
        except Exception as exc:
            print(f"[Telegram] Error sending to {chat_id}: {exc}")
            all_ok = False

    return all_ok
