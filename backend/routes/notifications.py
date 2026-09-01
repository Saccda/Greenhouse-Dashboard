"""
/api/notifications — alert status, history, test, and persistent log
"""
import csv
import io
from datetime import datetime
from fastapi import APIRouter, Depends, Query, Response

import config
from services import auth_service
from services import telegram_service as telegram
from services import alert_checker
from services import alert_log_service as alert_log

router = APIRouter(
    prefix="/api/notifications",
    tags=["notifications"],
    dependencies=[Depends(auth_service.require_auth)],
)


@router.get("/status")
def get_status() -> dict:
    """Return notification configuration and last-alert timestamps."""
    return alert_checker.get_status()


@router.get("/history")
def get_history() -> dict:
    """Return the last 50 alerts that were sent (in-memory, resets on restart)."""
    return {"alerts": alert_checker.get_history()}


@router.post("/test")
def send_test(_user: dict = Depends(auth_service.require_write_access)) -> dict:
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
def trigger_check(_user: dict = Depends(auth_service.require_write_access)) -> dict:
    """Manually trigger an immediate alert check (useful for testing thresholds)."""
    try:
        alert_checker.run_all_checks()
        return {"success": True, "detail": "Check completed — see /history for any new alerts"}
    except Exception as exc:
        return {"success": False, "detail": str(exc)}


def _farm_filter(user: dict, farm: str | None) -> str | list[str] | None:
    """
    Resolve the effective farm filter for a log query: a specific farm (after
    checking access), or the caller's full allowed-farms list when no farm
    was requested (so an unscoped query never shows farms outside their
    access), or None if the caller is genuinely unrestricted.
    """
    if farm is not None:
        auth_service.require_farm_access(user, farm)
        return farm
    return user.get("farms")


@router.get("/log")
def get_log(
    farm:       str | None = Query(default=None),
    alert_type: str | None = Query(default=None, alias="type"),
    event:      str | None = Query(default=None),
    days:       int        = Query(default=7,  ge=1, le=365),
    limit:      int        = Query(default=500, ge=1, le=2000),
    user:       dict       = Depends(auth_service.require_auth),
) -> dict:
    """
    Persistent alert log from SQLite.
    Filter by farm, type (temperature|humidity|empty_tank|long_spray),
    event (alert|reminder|resolved), and days back.
    """
    rows = alert_log.get_logs(
        farm_id    = _farm_filter(user, farm),
        alert_type = alert_type,
        event      = event,
        days       = days,
        limit      = limit,
    )
    return {"logs": rows, "count": len(rows)}


@router.get("/log/export")
def export_log(
    farm:       str | None = Query(default=None),
    alert_type: str | None = Query(default=None, alias="type"),
    event:      str | None = Query(default=None),
    days:       int        = Query(default=7, ge=1, le=365),
    user:       dict       = Depends(auth_service.require_auth),
) -> Response:
    """
    Download the persistent alert log as CSV. Same filters as /log,
    but not paginated — returns every matching row for the period.
    """
    rows = alert_log.get_logs(
        farm_id    = _farm_filter(user, farm),
        alert_type = alert_type,
        event      = event,
        days       = days,
        limit      = 100_000,
    )

    fields = [
        "created_at", "farm_id", "alert_type", "event",
        "sensor_value", "threshold", "duration_min", "gap_minutes", "message",
    ]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)

    stamp = datetime.now(config.TIMEZONE).strftime("%Y%m%d_%H%M%S")
    name_parts = ["alert_log", f"{days}d"]
    if alert_type:
        name_parts.append(alert_type)
    if event:
        name_parts.append(event)
    name_parts.append(stamp)
    filename = "_".join(name_parts) + ".csv"

    # UTF-8 BOM so Excel on Windows renders the °/emoji in `message` correctly
    # instead of misreading the file as the system codepage.
    csv_text = chr(0xFEFF) + buf.getvalue()

    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/log/summary")
def get_log_summary(
    farm: str | None = Query(default=None),
    days: int        = Query(default=30, ge=1, le=365),
    user: dict       = Depends(auth_service.require_auth),
) -> dict:
    """Aggregated alert counts and average durations for the alert log page."""
    resolved = _farm_filter(user, farm)
    farm_ids = [resolved] if isinstance(resolved, str) else resolved
    return alert_log.get_summary(days=days, farm_ids=farm_ids)
