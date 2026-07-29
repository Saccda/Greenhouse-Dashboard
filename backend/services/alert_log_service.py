"""
Persistent alert log — SQLite-backed.

Stores every alert event (alert / reminder / resolved) with enough context
for later analytics:  sensor value, threshold, how long the condition lasted.

DB file: backend/data/alerts.db  (auto-created on first use)
"""
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Generator

# Path relative to this file → backend/data/alerts.db
_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "alerts.db")


@contextmanager
def _conn() -> Generator[sqlite3.Connection, None, None]:
    con = sqlite3.connect(_DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init_db() -> None:
    """Create the alert_log table and indexes; migrate existing DB if needed."""
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    with _conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS alert_log (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                farm_id       TEXT    NOT NULL,
                alert_type    TEXT    NOT NULL,
                event         TEXT    NOT NULL,
                sensor_value  REAL,
                threshold     REAL,
                duration_min  REAL,
                gap_minutes   REAL,
                message       TEXT,
                created_at    TEXT    NOT NULL
            )
        """)
        # Migration: add gap_minutes to existing tables that pre-date this column
        existing = {row[1] for row in con.execute("PRAGMA table_info(alert_log)").fetchall()}
        if "gap_minutes" not in existing:
            con.execute("ALTER TABLE alert_log ADD COLUMN gap_minutes REAL")
            print("[AlertLog] Migrated: added gap_minutes column")
        con.execute("""
            CREATE INDEX IF NOT EXISTS idx_alert_created
            ON alert_log(created_at DESC)
        """)
        con.execute("""
            CREATE INDEX IF NOT EXISTS idx_alert_farm_type
            ON alert_log(farm_id, alert_type)
        """)
    print(f"[AlertLog] DB ready at {os.path.abspath(_DB_PATH)}")


def log_alert(
    farm_id:      str,
    alert_type:   str,
    event:        str,
    sensor_value: float | None = None,
    threshold:    float | None = None,
    duration_min: float | None = None,
    gap_minutes:  float | None = None,
    message:      str = "",
) -> None:
    """
    Insert one alert event row.
    gap_minutes: total offline time excluded from duration_min (0 or None = exact duration).
    """
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as con:
        con.execute(
            """
            INSERT INTO alert_log
              (farm_id, alert_type, event, sensor_value, threshold,
               duration_min, gap_minutes, message, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (farm_id, alert_type, event, sensor_value, threshold,
             duration_min, gap_minutes, message, now),
        )


def get_logs(
    farm_id:    str | list[str] | None = None,
    alert_type: str | None = None,
    event:      str | None = None,
    days:       int        = 7,
    limit:      int        = 500,
) -> list[dict]:
    """
    Return alert log rows as dicts, newest first.
    All filters are optional. farm_id accepts a single farm, a list of farms
    (e.g. restricting an unscoped query to a caller's allowed farms), or None.
    """
    clauses = [f"created_at >= datetime('now', '-{days} days')"]
    params:  list = []

    if isinstance(farm_id, list):
        if farm_id:
            clauses.append(f"farm_id IN ({','.join('?' * len(farm_id))})")
            params.extend(farm_id)
        else:
            clauses.append("1=0")   # scoped to zero farms -> match nothing, not everything
    elif farm_id:
        clauses.append("farm_id = ?")
        params.append(farm_id)
    if alert_type:
        clauses.append("alert_type = ?")
        params.append(alert_type)
    if event:
        clauses.append("event = ?")
        params.append(event)

    where = " AND ".join(clauses)
    params.append(limit)

    with _conn() as con:
        rows = con.execute(
            f"SELECT * FROM alert_log WHERE {where} ORDER BY created_at DESC LIMIT ?",
            params,
        ).fetchall()

    return [dict(r) for r in rows]


def get_summary(days: int = 30, farm_ids: list[str] | None = None) -> dict:
    """
    Aggregated counts useful for the analytics page.
    Returns counts by alert_type and by event type.
    farm_ids restricts the aggregation to those farms; None means unrestricted
    (only pass a caller's own allowed-farms list here, never blindly "all").
    """
    farm_clause = ""
    farm_params: list = []
    if farm_ids is not None:
        if farm_ids:
            farm_clause = f"AND farm_id IN ({','.join('?' * len(farm_ids))})"
            farm_params = list(farm_ids)
        else:
            farm_clause = "AND 1=0"   # scoped to zero farms -> match nothing

    with _conn() as con:
        by_type = con.execute(f"""
            SELECT alert_type, event, COUNT(*) as count
            FROM alert_log
            WHERE created_at >= datetime('now', ?)
              AND event != 'reminder'
              {farm_clause}
            GROUP BY alert_type, event
            ORDER BY alert_type, event
        """, (f"-{days} days", *farm_params)).fetchall()

        avg_duration = con.execute(f"""
            SELECT alert_type, ROUND(AVG(duration_min), 1) as avg_min, COUNT(*) as resolved_count
            FROM alert_log
            WHERE event = 'resolved'
              AND created_at >= datetime('now', ?)
              {farm_clause}
            GROUP BY alert_type
        """, (f"-{days} days", *farm_params)).fetchall()

    return {
        "by_type":     [dict(r) for r in by_type],
        "avg_duration": [dict(r) for r in avg_duration],
    }
