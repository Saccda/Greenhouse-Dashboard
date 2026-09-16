"""
Data audit — the numbers that decide what ML_METHODOLOGY.md section 0 can claim.

Run this BEFORE fitting anything. Sample size and coverage determine which
stages of the roadmap are reachable; everything else is downstream of that.

Two sources:

  --source postgres   The lab desktop archive (months of history). This is the
                      real training corpus. Postgres listens on localhost and is
                      NOT exposed to the internet, so this only runs ON the lab
                      desktop. That is deliberate — training and inference both
                      live there, so nothing is gained by opening the port.

  --source influx     InfluxDB Cloud. Reachable from anywhere, but holds only a
                      rolling ~30-day window. Useful for developing on a laptop;
                      not a substitute for the archive.

The Postgres schema is written by Node-RED and is not known to this script, so
it introspects rather than assuming. Run with no --table to see what is there.

Usage
-----
    python scripts/audit_data.py --source postgres
    python scripts/audit_data.py --source postgres --table sensor_data
    python scripts/audit_data.py --source influx --farm kampot

Output is plain text, meant to be pasted into a methodology discussion.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd

import config

TZ = config.TZ_NAME
BAR_WIDTH = 40


# ── formatting helpers ───────────────────────────────────────────────────────

def rule(title: str = "") -> None:
    print("\n" + "=" * 74)
    if title:
        print(title)
        print("=" * 74)


def bar(n: int, peak: int) -> str:
    if peak <= 0:
        return ""
    return "#" * min(BAR_WIDTH, int(n / peak * BAR_WIDTH))


# ── the audit itself, source-agnostic ────────────────────────────────────────

def audit_frame(df: pd.DataFrame, label: str) -> None:
    """
    `df` needs a tz-aware 'time' column. Everything reported here is computed
    from that alone, so it applies identically to Influx and Postgres.
    """
    if df.empty:
        print(f"\n  {label}: NO DATA")
        return

    t = pd.to_datetime(df["time"])
    if t.dt.tz is None:
        t = t.dt.tz_localize("UTC")
    t = t.dt.tz_convert(TZ)

    days = t.dt.date
    n_days = days.nunique()
    span = (days.max() - days.min()).days + 1

    rule(f"{label}")
    print(f"  rows            : {len(df):,}")
    print(f"  first / last    : {days.min()}  ->  {days.max()}")
    print(f"  days with data  : {n_days}")
    print(f"  calendar span   : {span} d   ({n_days / span:.0%} of days present)")

    per_day = days.value_counts()
    print(f"  rows per day    : median {per_day.median():.0f}"
          f"   min {per_day.min():.0f}   max {per_day.max():.0f}")

    # ── Hour-of-day coverage. THE decisive number: a model cannot predict an
    #    hour that was never recorded, and no amount of extra history fixes a
    #    gap that comes from the rig being powered down. ────────────────────
    print("\n  Coverage by hour of day")
    print("  (days_seen is what matters - a single freak night is not coverage)")
    hours = t.dt.hour.value_counts().sort_index()
    seen = t.groupby(t.dt.hour).apply(lambda s: s.dt.date.nunique())
    peak = int(hours.max())
    for h in range(24):
        n = int(hours.get(h, 0))
        d = int(seen.get(h, 0))
        flag = "  <-- never observed" if n == 0 else ""
        print(f"   {h:02d}  {n:8,}  {d:4d}/{n_days} days  {bar(n, peak)}{flag}")

    observed = sum(1 for h in range(24) if hours.get(h, 0) > 0)
    print(f"\n  hours of day ever observed : {observed}/24")
    if observed < 24:
        print(f"  >> {24 - observed} hours have NO data. Forecasts into those hours")
        print(f"     would be extrapolation with zero support (ML_METHODOLOGY 1.2).")

    # ── Did the recording schedule ever change? The highest-value question in
    #    this script: an earlier continuously-recording period is the only
    #    night-time evidence that will ever exist without a hardware change. ─
    print("\n  Recording window by month  (did the schedule ever change?)")
    local_naive = t.dt.tz_localize(None)   # month is a local-calendar bucket
    m = pd.DataFrame({"month": local_naive.dt.to_period("M"),
                      "hour": t.dt.hour, "day": days})
    g = m.groupby("month").agg(
        earliest_hr=("hour", "min"),
        latest_hr=("hour", "max"),
        hours_seen=("hour", "nunique"),
        days=("day", "nunique"),
    )
    print(g.to_string())
    if g["hours_seen"].max() > g["hours_seen"].min():
        print("  >> The window CHANGED between months. The widest month is")
        print("     disproportionately valuable - see ML_METHODOLOGY 0.4.")

    # ── Sampling cadence. Sets the usable lag features and, with the
    #    autocorrelation it implies, the effective sample size. ─────────────
    gaps = t.sort_values().diff().dt.total_seconds().dropna()
    intra = gaps[gaps < 3600]
    if len(intra):
        print("\n  Sampling interval (gaps under 1h, i.e. within a session)")
        print(f"   median {intra.median():.0f}s   p90 {intra.quantile(0.9):.0f}s"
              f"   max {intra.max():.0f}s")
        print(f"   >> effective sample size is ~{n_days} DAYS, not {len(df):,} rows")
        print(f"      (ML_METHODOLOGY 1.4 - readings this close are not independent)")


# ── Postgres ─────────────────────────────────────────────────────────────────

def discover(conn) -> None:
    """No --table given: show what the Node-RED flow actually created."""
    q = """
        SELECT table_schema, table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name, ordinal_position
    """
    df = pd.read_sql(q, conn)
    if df.empty:
        print("  No user tables found. Is POSTGRES_URL pointing at the right database?")
        return

    rule("Tables in this database")
    for (schema, table), grp in df.groupby(["table_schema", "table_name"]):
        cols = ", ".join(f"{r.column_name}:{r.data_type}" for r in grp.itertuples())
        print(f"\n  {schema}.{table}")
        print(f"    {cols}")

    ts = df[df.data_type.str.contains("timestamp", case=False, na=False)]
    print("\n  Candidates (tables with a timestamp column):")
    for (schema, table), grp in ts.groupby(["table_schema", "table_name"]):
        print(f"    --table {table}   (time column: {grp.column_name.iloc[0]})")
    print("\n  Re-run with --table <name> to audit one.")


def pick_time_column(conn, table: str) -> str:
    q = """
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = %s
        ORDER BY ordinal_position
    """
    cols = pd.read_sql(q, conn, params=(table,))
    if cols.empty:
        sys.exit(f"Table '{table}' not found.")

    rule(f"Columns in {table}")
    print(cols.to_string(index=False))

    stamps = cols[cols.data_type.str.contains("timestamp", case=False, na=False)]
    if stamps.empty:
        sys.exit(f"No timestamp column in '{table}' - cannot audit it.")

    # Prefer a conventionally-named one, else the first timestamp column.
    for preferred in ("time", "timestamp", "ts", "created_at", "recorded_at"):
        if preferred in set(stamps.column_name):
            return preferred
    return stamps.column_name.iloc[0]


def audit_postgres(table: str | None) -> None:
    if not config.POSTGRES_URL:
        sys.exit(
            "POSTGRES_URL is not set.\n\n"
            "Add it to backend/.env ON THE LAB DESKTOP, e.g.\n"
            "  POSTGRES_URL=postgresql://user:password@localhost:5432/greenhouse\n\n"
            "Keep it on localhost. Postgres does not need to be reachable from\n"
            "the internet — training and inference both run on this machine, and\n"
            "only the HTTP API crosses the tunnel (ML_METHODOLOGY 5.1)."
        )
    try:
        import psycopg2
    except ImportError:
        sys.exit("psycopg2 missing. Run: .venv\\Scripts\\pip.exe install -r requirements.txt")

    conn = psycopg2.connect(config.POSTGRES_URL)
    try:
        if not table:
            discover(conn)
            return

        tcol = pick_time_column(conn, table)
        print(f"\n  using time column: {tcol}")

        df = pd.read_sql(f'SELECT "{tcol}" AS time FROM "{table}"', conn)
        audit_frame(df, f"postgres: {table}")

        # Long format (field/value per row, the usual Node-RED shape) reports
        # per-field extent too — one field can stop while the others continue.
        names = pd.read_sql(
            "SELECT column_name FROM information_schema.columns WHERE table_name = %s",
            conn, params=(table,),
        ).column_name.tolist()
        for candidate in ("field", "_field", "name", "measurement", "topic"):
            if candidate in names:
                rule(f"Per-{candidate} extent in {table}")
                q = f'''
                    SELECT "{candidate}" AS field,
                           count(*)      AS rows,
                           min("{tcol}") AS first,
                           max("{tcol}") AS last
                    FROM "{table}" GROUP BY 1 ORDER BY 2 DESC
                '''
                print(pd.read_sql(q, conn).to_string(index=False))
                break
    finally:
        conn.close()


# ── InfluxDB ─────────────────────────────────────────────────────────────────

def audit_influx(farm: str, days: int) -> None:
    from services.influxdb_service import _run_query

    if farm not in config.FARMS:
        sys.exit(f"Unknown farm '{farm}'. Known: {', '.join(config.FARMS)}")
    measurement = config.FARMS[farm]["measurement"]

    df = _run_query(f'''
from(bucket: "{config.INFLUXDB_BUCKET}")
  |> range(start: -{days}d)
  |> filter(fn: (r) => r._measurement == "{measurement}" and r._field == "temperature")
''')
    audit_frame(df, f"influx: {farm} / {measurement}  (last {days}d)")
    print("\n  NOTE: InfluxDB Cloud holds a rolling window, not an archive.")
    print("        Re-run against Postgres before trusting any sample-size claim.")


# ── entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", choices=("postgres", "influx"), default="postgres")
    ap.add_argument("--table", help="postgres: table to audit; omit to list tables")
    ap.add_argument("--farm", default="kampot", help="influx: which farm")
    ap.add_argument("--days", type=int, default=365, help="influx: lookback window")
    args = ap.parse_args()

    print(f"Data audit - {datetime.now(config.TIMEZONE):%Y-%m-%d %H:%M %Z}")
    print(f"source: {args.source}   timezone: {TZ}")

    if args.source == "postgres":
        audit_postgres(args.table)
    else:
        audit_influx(args.farm, args.days)

    rule("Done")
    print("  Paste this output into the methodology discussion - section 0 of")
    print("  ML_METHODOLOGY.md is provisional until it is based on these numbers.")


if __name__ == "__main__":
    main()
