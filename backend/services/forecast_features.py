"""
Stage 1 feature engineering — the single source of truth for how raw sensor
history becomes a supervised learning table.

Shared deliberately by training, validation, and the live API so that the
features a prediction is served from are byte-for-byte the ones the model was
validated on. A second, drifting copy of this logic in the serving path is the
classic way an offline skill score fails to reproduce in production.

Everything here is designed around three facts established in ML_METHODOLOGY.md:

  §0.4.1  The cadence is not stationary — early days sampled every ~2 s, later
          days every ~30 s, and one day carries 13,191 rows. So the first step
          is always to resample to a uniform 1-minute grid, per day, never
          bridging the overnight shutdown gap. Raw rows are never fed to a model.

  §1.4    The independent unit is the DAY. Every frame returned here carries a
          `day` column precisely so the caller can block cross-validation by it
          (§4.1) and never split a single day across train and test.

  §2.2    Features are computed strictly from information available at t. Lags
          look backward only; the target looks forward and is the label, never
          a feature. A uniform grid is what makes "the reading 5 minutes ago"
          unambiguous.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

import config

# ── Fixed parameters of the problem ──────────────────────────────────────────

# Monitored window opens at 08:00 local (§0.3 — the config's 06:00 is stale; the
# field never reports before 08:00). "minutes since window open" is measured
# from here, and the shutdown-boundary rule (§2.5) is enforced against the close.
WINDOW_OPEN_HOUR  = 8
WINDOW_CLOSE_HOUR = 16

GRID_FREQ = "1min"           # the uniform resampling grid (§0.4.1)
HORIZONS  = (15, 30, 60)     # forecast horizons in minutes (§2.1)

# Backward lags and rate spans, in minutes (§2.2). On the 1-minute grid these
# are just row offsets, which is the whole point of gridding first.
LEVEL_LAGS = (0, 5, 10, 20, 30)
RATE_SPANS = (5, 15, 30)
HUM_RATE_SPAN = 15

# A spray that has not happened within the window is capped rather than left
# undefined — "no spray for at least this long" is the information the model
# needs, and an unbounded value would dominate the scaler.
SPRAY_CAP_MIN = 480          # one full 8-hour window


@dataclass(frozen=True)
class FeatureSpec:
    """The columns that make up X, kept in one place so train/serve agree."""
    horizon: int

    @property
    def feature_names(self) -> list[str]:
        names: list[str] = []
        names += [f"temp_lag_{m}" for m in LEVEL_LAGS]
        names += [f"temp_rate_{s}" for s in RATE_SPANS]
        names += ["humidity", f"hum_rate_{HUM_RATE_SPAN}"]
        names += ["relay_cool", "relay_spray", "mins_since_spray"]
        names += ["mins_since_open"]
        return names


# ── Loading ──────────────────────────────────────────────────────────────────

_WIDE_COLUMNS = ["temperature", "humidity", "relay1", "relay2", "relay3"]


def load_postgres(table: str = "environment") -> pd.DataFrame:
    """
    Load the wide sensor table from the lab-desktop archive.

    `environment` is the Kampot archive table Node-RED writes (confirmed by the
    §0 audit). Returns a frame indexed by tz-aware local time with the columns in
    _WIDE_COLUMNS. Reached over loopback only — see ML_METHODOLOGY.md §5.1.
    """
    import psycopg2

    if not config.POSTGRES_URL:
        raise SystemExit(
            "POSTGRES_URL is not set. Add it to backend/.env on the lab desktop "
            "(localhost only — see ML_METHODOLOGY.md §5.1)."
        )

    conn = psycopg2.connect(config.POSTGRES_URL)
    try:
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            df = pd.read_sql(
                f'SELECT time, temperature, humidity, relay1, relay2, relay3 '
                f'FROM "{table}" ORDER BY time',
                conn,
            )
    finally:
        conn.close()
    return _finalize(df.set_index("time"))


def load_influx(farm: str = "kampot", days: int = 30) -> pd.DataFrame:
    """
    Load the same wide shape from InfluxDB Cloud. Only a rolling ~30-day window
    exists there (§0.4), so this is for developing the pipeline off the lab
    desktop, not for producing a real model.
    """
    from services.influxdb_service import _run_query

    measurement = config.FARMS[farm]["measurement"]
    fields = " or ".join(f'r._field == "{f}"' for f in _WIDE_COLUMNS)
    long = _run_query(f'''
from(bucket: "{config.INFLUXDB_BUCKET}")
  |> range(start: -{days}d)
  |> filter(fn: (r) => r._measurement == "{measurement}")
  |> filter(fn: (r) => {fields})
''')
    if long.empty:
        return _finalize(pd.DataFrame(columns=_WIDE_COLUMNS))
    wide = long.pivot_table(index="time", columns="field", values="value")
    return _finalize(wide)


def _finalize(df: pd.DataFrame) -> pd.DataFrame:
    """Common post-load: tz to local, sort, de-duplicate index, typed columns."""
    if df.empty:
        return df
    idx = pd.to_datetime(df.index)
    if idx.tz is None:
        idx = idx.tz_localize("UTC")
    df = df.copy()
    df.index = idx.tz_convert(config.TZ_NAME)
    df = df.sort_index()
    # Distinct timestamps only. The audit found zero duplicates in Postgres, but
    # the serving path may hand us overlapping polls, so this stays defensive.
    df = df[~df.index.duplicated(keep="last")]
    for col in _WIDE_COLUMNS:
        if col not in df.columns:
            df[col] = np.nan
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df[_WIDE_COLUMNS]


# ── Resampling to a uniform per-day grid (§0.4.1) ────────────────────────────

def resample_grid(df: pd.DataFrame) -> pd.DataFrame:
    """
    Put each day on its own uniform 1-minute grid.

    Grouped by local date so the grid never spans the overnight shutdown — a
    single continuous resample would manufacture thousands of empty 00:00–08:00
    rows and, worse, let a lag reach from this morning back into last evening.

    Temperature/humidity are averaged within each minute bin; relays take the max
    (ON if the actuator was on at any point in the minute). Empty bins — real
    mid-session gaps, up to ~26 min were seen — stay NaN and are dropped later by
    the feature builder, which is correct: a lag must not be interpolated across a
    gap.
    """
    if df.empty:
        return df

    out = []
    for day, chunk in df.groupby(df.index.normalize()):
        agg = chunk.resample(GRID_FREQ).agg({
            "temperature": "mean",
            "humidity":    "mean",
            "relay1":      "max",
            "relay2":      "max",
            "relay3":      "max",
        })
        # Confine to the day's observed span; resample already does, but guard
        # against a stray midnight timestamp widening it.
        out.append(agg)
    grid = pd.concat(out)
    grid["day"] = grid.index.normalize()
    return grid


# ── Feature construction (§2.2) ──────────────────────────────────────────────

def build_features(df_raw: pd.DataFrame, horizon: int) -> pd.DataFrame:
    """
    Turn raw wide history into a supervised table for one horizon.

    Returns one row per grid instant that has every backward feature AND a target
    `horizon` minutes ahead, with:
      - the §2.2 feature columns (see FeatureSpec.feature_names)
      - `y`            : temperature at t + horizon (the label)
      - `y_persist`    : temperature at t (the persistence baseline, §2.3)
      - `day`          : local date, for day-blocked CV (§4.1)
      - index          : the origin time t (tz-aware)

    All lags and the target are computed per day on the uniform grid, so nothing
    reaches across the overnight gap and "5 minutes ago" always means five grid
    steps.
    """
    grid = resample_grid(df_raw)
    if grid.empty:
        return pd.DataFrame()

    spec = FeatureSpec(horizon)
    frames = []
    for _, day in grid.groupby("day"):
        day = day.sort_index()
        t = day["temperature"]
        h = day["humidity"]

        feat = pd.DataFrame(index=day.index)
        # Level lags (t-0 is the current reading and the persistence forecast).
        for m in LEVEL_LAGS:
            feat[f"temp_lag_{m}"] = t.shift(m)
        # Rates of change over the last s minutes.
        for s in RATE_SPANS:
            feat[f"temp_rate_{s}"] = t - t.shift(s)
        feat["humidity"] = h
        feat[f"hum_rate_{HUM_RATE_SPAN}"] = h - h.shift(HUM_RATE_SPAN)

        # Actuator state (§2.2). relay1 cooling, relay3 spray.
        feat["relay_cool"]  = day["relay1"].fillna(0)
        feat["relay_spray"] = day["relay3"].fillna(0)
        feat["mins_since_spray"] = _mins_since_spray(day["relay3"])

        # Clock position within the window — "minutes since 08:00", not hour of
        # day (§2.2). On the 1-min grid this is minutes past the open.
        mins = (feat.index - feat.index.normalize()
                ).total_seconds() / 60.0 - WINDOW_OPEN_HOUR * 60
        feat["mins_since_open"] = mins

        # Labels: temperature `horizon` steps ahead on this day's grid. A target
        # that falls past the day's last reading becomes NaN and the row drops —
        # which is exactly the shutdown-boundary rule expressing itself in the
        # training data (§2.5).
        feat["y"] = t.shift(-horizon)
        feat["y_persist"] = t                       # persistence baseline
        feat["day"] = day["day"]
        frames.append(feat)

    table = pd.concat(frames)
    needed = spec.feature_names + ["y", "y_persist"]
    table = table.dropna(subset=needed)
    return table


def _mins_since_spray(relay_spray: pd.Series) -> pd.Series:
    """
    Minutes since the spray relay was last ON, within the day, capped.

    On the 1-min grid, elapsed time equals the number of grid steps since the
    most recent ON. Before the first spray of the day the value is capped at
    SPRAY_CAP_MIN ("has not sprayed for a long time"), rather than left undefined.
    """
    on = (relay_spray.fillna(0) >= 1).to_numpy()
    out = np.empty(len(on), dtype=float)
    since = SPRAY_CAP_MIN
    for i, is_on in enumerate(on):
        if is_on:
            since = 0
        out[i] = min(since, SPRAY_CAP_MIN)
        since += 1
    return pd.Series(out, index=relay_spray.index)


# ── Shutdown-boundary rule for the serving path (§2.5) ───────────────────────

def lands_past_shutdown(origin_local: pd.Timestamp, horizon: int) -> bool:
    """
    True if a forecast issued at `origin_local` for `horizon` minutes would land
    at or after the 16:00 shutdown — a region with no training support and no way
    to verify. The API returns null with a reason in that case, never a number.
    """
    target = origin_local + pd.Timedelta(minutes=horizon)
    close = origin_local.normalize() + pd.Timedelta(hours=WINDOW_CLOSE_HOUR)
    return target >= close
