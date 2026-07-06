"""
/api/notifications — alert status, history, test, and persistent log
"""
from datetime import datetime
from fastapi import APIRouter, Query

import config
from services import telegram_service as telegram
from services import alert_checker
from services import alert_log_service as alert_log

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("/status")
def get_status() -> dict:
    """Return notification configuration and last-alert timestamps."""
    return alert_checker.get_status()


@router.get("/history")
def get_history() -> dict:
    """Return the last 50 alerts that were sent (in-memory, resets on restart)."""
    return {"alerts": alert_checker.get_history()}


@router.post("/test")
def send_test() -> dict:
    """Send a test Telegram message to verify the integration."""
    if not telegram.is_configured():
        return {
            "success": False,
            "detail":  "Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in backend/.env",
        }

    now = datetime.now(config.TIMEZONE).strftime("%Y-%m-%d %H:%M:%S")
    msg = (
        f"✅ *Greenhouse Monitor — Test Notification*\n"
        f"Your Telegram alerts are working correctly.\n"
        f"Time: {now}"
    )
    ok = telegram.send_message(msg)
    return {
        "success": ok,
        "detail":  "Message sent successfully" if ok else "Failed — check bot token and chat ID",
    }


@router.post("/check-now")
def trigger_check() -> dict:
    """Manually trigger an immediate alert check (useful for testing thresholds)."""
    try:
        alert_checker.run_all_checks()
        return {"success": True, "detail": "Check completed — see /history for any new alerts"}
    except Exception as exc:
        return {"success": False, "detail": str(exc)}


@router.get("/log")
def get_log(
    farm:       str | None = Query(default=None),
    alert_type: str | None = Query(default=None, alias="type"),
    event:      str | None = Query(default=None),
    days:       int        = Query(default=7,  ge=1, le=365),
    limit:      int        = Query(default=500, ge=1, le=2000),
) -> dict:
    """
    Persistent alert log from SQLite.
    Filter by farm, type (temperature|humidity|empty_tank|long_spray),
    event (alert|reminder|resolved), and days back.
    """
    rows = alert_log.get_logs(
        farm_id    = farm,
        alert_type = alert_type,
        event      = event,
        days       = days,
        limit      = limit,
    )
    return {"logs": rows, "count": len(rows)}


@router.get("/log/summary")
def get_log_summary(
    days: int = Query(default=30, ge=1, le=365),
) -> dict:
    """Aggregated alert counts and average durations for the analytics page."""
    return alert_log.get_summary(days=days)
