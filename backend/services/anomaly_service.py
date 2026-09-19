"""
Stage 2 — sensor health and anomaly detection (ML_METHODOLOGY.md §3).

A different question from the threshold alerts already in production. Those ask
"are conditions bad?" (too hot, too humid). These ask **"can this reading be
trusted at all?"** — the campus MQTT bridge died for days in September 2026 and
was caught by a human noticing a card, which is precisely the failure class here.

Five detectors (§3.1), in two families:

  FAULT    — the instrument or pipeline is broken; the number is not evidence.
    dead_feed     no reading for longer than the staleness threshold
    flatline      the identical value repeated, i.e. a frozen sensor or cache
    out_of_range  physically impossible, i.e. wiring, units, or a parse bug

  UNUSUAL  — the number is probably real but far outside normal behaviour.
    jump          |Δ| between consecutive readings > k · MAD(Δ)
    residual      |y − ŷ| against persistence > k · MAD(residuals), reusing
                  Stage 1's residual distribution directly

Why MAD everywhere and never standard deviation (§3.2): a stuck sensor or a
spike inflates the SD, which widens the threshold, which makes the very anomaly
that caused it *less* likely to be flagged. MAD has a 50% breakdown point, so up
to half the data can be corrupt before the estimate moves. Scaled by 1.4826 it
estimates σ for Gaussian data, keeping "k sigma" interpretable.

THE OVERNIGHT WINDOW IS NOT A FAULT. The rig is deliberately powered down from
16:00 to 08:00 (§0.2). A dead-feed detector that does not know this fires every
single night, and an alarm that fires nightly is muted within a week — which is
worse than no alarm, because it produces the appearance of monitoring without
the substance (§3.3). Every time-gap detector here is therefore evaluated only
inside the monitored window.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import timedelta

import numpy as np
import pandas as pd

import config

# ── Detector parameters ──────────────────────────────────────────────────────

WINDOW_OPEN_HOUR  = 8
WINDOW_CLOSE_HOUR = 16

# Physically impossible readings. Deliberately generous — this catches wiring
# faults and unit errors (a Fahrenheit value, a raw ADC count), not hot days.
PHYSICAL_BOUNDS = {
    "temperature": (0.0, 60.0),
    "humidity":    (0.0, 100.0),
}

# A flatline is measured in WALL-CLOCK TIME, not in number of readings.
#
# Counting readings was the first implementation and it was wrong: the cadence
# varies ~15x across the archive (§0.4.1), so 83 identical temperature readings
# turned out to span 2 minutes of 2-second sampling — a sensor with 0.1 °C
# resolution behaving perfectly normally. Meanwhile 109 identical humidity
# readings spanned 108 minutes, which is a genuinely frozen sensor. Duration
# separates those two; a reading count cannot.
FLATLINE_MINUTES = 30
FLATLINE_MIN_READINGS = 5     # guard: a long gap with 2 readings is not a flatline

# Alert-rate budget for the "unusual" family, in events per day, per detector.
#
# The first implementation used a fixed "k · MAD" threshold. MAD remains the
# right ROBUST SCALE estimator (§3.2) — but turning a scale into a threshold via
# "k sigma" assumes Gaussian tails, and these distributions are heavy-tailed
# (15-minute humidity moves: SD/MAD = 1.27, max 33.6 against a MAD-sigma of
# 3.26). At k = 5 that put the threshold near the 99.5th percentile, which over
# 21,000 readings produced 7.9 alerts/day — squarely in the "operators mute it"
# zone §3.3 warns about.
#
# So the threshold is set from the alert rate we can actually sustain, using an
# empirical quantile that makes no tail assumption. The rate is the design
# constraint; the threshold is derived from it, and both are reported.
UNUSUAL_BUDGET_PER_DAY = 0.5

# Consecutive readings further apart than this are not treated as adjacent, so a
# Δ is never computed across a real gap (or across the overnight shutdown).
MAX_ADJACENT_GAP_MIN = 5

# The persistence horizon whose residuals feed the residual detector — the same
# 15-minute residual distribution Stage 1 validated (§2.6).
RESIDUAL_HORIZON_MIN = 15


@dataclass
class Event:
    detector: str
    family:   str        # "fault" | "unusual"
    field:    str
    start:    str        # ISO local time
    end:      str
    value:    float | None
    detail:   str

    def to_dict(self) -> dict:
        return asdict(self)


# ── MAD (§3.2) ───────────────────────────────────────────────────────────────

def mad(values: np.ndarray) -> float:
    """
    Median absolute deviation, scaled by 1.4826 so it estimates σ for Gaussian
    data. Returns 0.0 when more than half the values are identical — in which
    case a MAD-based threshold is meaningless and the caller must skip, rather
    than divide by zero and flag everything.
    """
    v = np.asarray(values, dtype=float)
    v = v[np.isfinite(v)]
    if len(v) == 0:
        return 0.0
    med = np.median(v)
    return float(1.4826 * np.median(np.abs(v - med)))


def _in_window(ts: pd.Timestamp) -> bool:
    return WINDOW_OPEN_HOUR <= ts.hour < WINDOW_CLOSE_HOUR


def rate_threshold(magnitudes: np.ndarray, n_days: int,
                   budget_per_day: float = UNUSUAL_BUDGET_PER_DAY) -> float:
    """
    The magnitude above which roughly `budget_per_day` events fire per day.

    An empirical quantile, so it assumes nothing about the tails — which is the
    whole point, since these distributions are demonstrably not Gaussian. Returns
    +inf when there is not enough data to place the quantile, so the caller flags
    nothing rather than flagging everything.
    """
    m = np.asarray(magnitudes, dtype=float)
    m = m[np.isfinite(m)]
    if len(m) == 0 or n_days <= 0:
        return float("inf")
    allowed = budget_per_day * n_days
    if allowed >= len(m):
        return float("inf")
    q = 1.0 - allowed / len(m)
    return float(np.quantile(m, q))


# ── Detectors ────────────────────────────────────────────────────────────────

def detect_dead_feed(df: pd.DataFrame) -> list[Event]:
    """
    Gaps longer than DATA_STALE_MINUTES that occur INSIDE the monitored window.

    The overnight shutdown is excluded by construction: a gap is only reported if
    both its start and its end fall within 08:00–16:00 on the same day. Without
    that, this detector would fire once every night forever (§3.3).
    """
    if len(df) < 2:
        return []
    out: list[Event] = []
    times = df.index
    gaps = times[1:] - times[:-1]
    limit = timedelta(minutes=config.DATA_STALE_MINUTES)
    for i, gap in enumerate(gaps):
        if gap <= limit:
            continue
        start, end = times[i], times[i + 1]
        if start.date() != end.date():
            continue                       # spans the overnight shutdown
        if not (_in_window(start) and _in_window(end)):
            continue                       # outside monitored hours
        out.append(Event(
            detector="dead_feed", family="fault", field="*",
            start=start.isoformat(), end=end.isoformat(), value=None,
            detail=f"No reading for {gap.total_seconds()/60:.0f} min during monitored hours",
        ))
    return out


def detect_flatline(df: pd.DataFrame, field: str) -> list[Event]:
    """
    A bit-identical value held for FLATLINE_MINUTES or more — a frozen sensor.

    Measured in wall-clock duration, never in reading count: at the archive's
    fast-cadence periods 83 identical readings span two minutes, which is just
    sensor resolution, while the same count at 30 s spans 40 minutes, which is a
    fault. Only duration tells those apart (§0.4.1).
    """
    s = df[field].dropna()
    if len(s) < FLATLINE_MIN_READINGS:
        return []
    run_id = (s != s.shift()).cumsum()
    out: list[Event] = []
    for _, run in s.groupby(run_id):
        if len(run) < FLATLINE_MIN_READINGS:
            continue
        minutes = (run.index[-1] - run.index[0]).total_seconds() / 60.0
        if minutes < FLATLINE_MINUTES:
            continue
        out.append(Event(
            detector="flatline", family="fault", field=field,
            start=run.index[0].isoformat(), end=run.index[-1].isoformat(),
            value=float(run.iloc[0]),
            detail=f"Identical value {run.iloc[0]:g} held for {minutes:.0f} min "
                   f"({len(run)} readings)",
        ))
    return out


def detect_out_of_range(df: pd.DataFrame, field: str) -> list[Event]:
    """Physically impossible values — wiring fault, unit error, parse bug."""
    lo, hi = PHYSICAL_BOUNDS.get(field, (-np.inf, np.inf))
    s = df[field].dropna()
    bad = s[(s < lo) | (s > hi)]
    return [
        Event(detector="out_of_range", family="fault", field=field,
              start=ts.isoformat(), end=ts.isoformat(), value=float(v),
              detail=f"{v:g} outside the physical range {lo:g}–{hi:g}")
        for ts, v in bad.items()
    ]


def detect_jump(df: pd.DataFrame, field: str) -> list[Event]:
    """
    An implausibly fast RATE of change between adjacent readings.

    Two corrections over the naive version, both forced by the non-stationary
    cadence (§0.4.1):

      - The magnitude is Δ per MINUTE, not raw Δ. At 2-second sampling a raw Δ is
        mechanically ~15x smaller than at 30-second sampling, so a raw-Δ threshold
        means something different in different parts of the archive.
      - The threshold comes from the alert-rate budget, not k · MAD, because these
        distributions are heavy-tailed (see UNUSUAL_BUDGET_PER_DAY).

    Pairs more than MAX_ADJACENT_GAP_MIN apart are dropped so neither a mid-session
    gap nor the overnight shutdown is mistaken for an instantaneous spike.
    """
    s = df[field].dropna()
    if len(s) < 50:
        return []
    apart = s.index.to_series().diff().dt.total_seconds() / 60.0
    rate = s.diff() / apart                      # units per minute
    rate = rate[(apart <= MAX_ADJACENT_GAP_MIN) & (apart > 0)].dropna()
    if len(rate) < 50:
        return []
    n_days = s.index.normalize().nunique()
    thresh = rate_threshold(rate.abs().to_numpy(), n_days)
    scale = mad(rate.to_numpy())                 # reported for interpretability
    if not np.isfinite(thresh):
        return []
    flagged = rate[rate.abs() > thresh]
    return [
        Event(detector="jump", family="unusual", field=field,
              start=ts.isoformat(), end=ts.isoformat(), value=float(s.loc[ts]),
              detail=f"Changed {v:+.1f}/min (threshold {thresh:.1f}/min"
                     + (f", {abs(v)/scale:.1f}x robust sigma)" if scale > 0 else ")"))
        for ts, v in flagged.items()
    ]


def detect_residual(df: pd.DataFrame, field: str) -> list[Event]:
    """
    |y(t+h) − y(t)| beyond RESIDUAL_K · MAD, reusing Stage 1's persistence
    residual distribution (§2.6) rather than inventing a second model.

    This catches genuinely unusual CONDITIONS — the reading is probably real, it
    just moved far more over the horizon than it normally does — which is why it
    is family "unusual", not "fault".
    """
    s = df[field].dropna()
    if len(s) < 100:
        return []
    h = pd.Timedelta(minutes=RESIDUAL_HORIZON_MIN)
    # Value h minutes later, matched on time (never on row position — the cadence
    # is not stationary, see §0.4.1).
    future = s.reindex(s.index + h, method="nearest",
                       tolerance=pd.Timedelta(minutes=2))
    resid = pd.Series(future.to_numpy() - s.to_numpy(), index=s.index).dropna()
    # Only inside the window, and only where the horizon does not cross the close.
    resid = resid[[_in_window(ts) and _in_window(ts + h) for ts in resid.index]]
    if len(resid) < 100:
        return []
    scale = mad(resid.to_numpy())                # reported for interpretability
    n_days = resid.index.normalize().nunique()
    thresh = rate_threshold(resid.abs().to_numpy(), n_days)
    if not np.isfinite(thresh):
        return []
    flagged = resid[resid.abs() > thresh]
    return [
        Event(detector="residual", family="unusual", field=field,
              start=ts.isoformat(), end=(ts + h).isoformat(), value=float(s.loc[ts]),
              detail=f"Moved {v:+.1f} over {RESIDUAL_HORIZON_MIN} min "
                     f"(threshold {thresh:.1f}"
                     + (f", {abs(v)/scale:.1f}x robust sigma)" if scale > 0 else ")"))
        for ts, v in flagged.items()
    ]


# ── Orchestration ────────────────────────────────────────────────────────────

def detect_all(df: pd.DataFrame, fields=("temperature", "humidity")) -> list[Event]:
    """Run every detector. `df` is the wide frame from forecast_features."""
    if df is None or df.empty:
        return []
    events = detect_dead_feed(df)
    for field in fields:
        if field not in df.columns:
            continue
        events += detect_flatline(df, field)
        events += detect_out_of_range(df, field)
        events += detect_jump(df, field)
        events += detect_residual(df, field)
    return sorted(events, key=lambda e: e.start)


INCIDENT_GAP_MIN = 30


def group_incidents(events: list[Event], gap_min: int = INCIDENT_GAP_MIN) -> list[dict]:
    """
    Collapse a burst of related events into one incident.

    A thrashing sensor emits dozens of individual flags in a few minutes. Paging
    someone thirty times for one fault is how an alert channel gets muted (§3.3),
    and it also makes the alert rate look far worse than the operator experience
    actually is. Consecutive events sharing a detector and field, separated by
    less than `gap_min`, become a single incident carrying the event count.

    Reported ALONGSIDE the raw event count, never instead of it — grouping is a
    presentation decision and should not be able to hide volume.
    """
    by_key: dict[tuple[str, str], list[Event]] = {}
    for e in events:
        by_key.setdefault((e.detector, e.field), []).append(e)

    incidents: list[dict] = []
    for (detector, field), group in by_key.items():
        group.sort(key=lambda e: e.start)
        current: list[Event] = []
        for e in group:
            if current and (pd.Timestamp(e.start) - pd.Timestamp(current[-1].end)
                            ) > pd.Timedelta(minutes=gap_min):
                incidents.append(_incident(detector, field, current))
                current = []
            current.append(e)
        if current:
            incidents.append(_incident(detector, field, current))
    return sorted(incidents, key=lambda i: i["start"], reverse=True)


def _incident(detector: str, field: str, group: list[Event]) -> dict:
    worst = max(group, key=lambda e: abs(e.value) if e.value is not None else 0)
    span = (pd.Timestamp(group[-1].end) - pd.Timestamp(group[0].start)).total_seconds() / 60
    return {
        "detector":  detector,
        "family":    group[0].family,
        "field":     field,
        "start":     group[0].start,
        "end":       group[-1].end,
        "count":     len(group),
        "span_min":  round(span, 1),
        "detail":    worst.detail,
    }


def farm_health(farm: str = "kampot", days: int = 7) -> dict:
    """
    Sensor-health payload for one farm over a recent window, for the API.

    Reads the live cloud series rather than the archive: this answers "is the
    instrument healthy right now", which is a question about recent readings. The
    archive-wide evaluation is a separate offline job (scripts/evaluate_anomalies).

    Detection runs on RAW readings, never the resampled grid — a frozen sensor or
    a spike is a property of what the instrument actually emitted, and averaging
    into 1-minute bins would smooth away the very evidence being looked for.
    """
    from services import forecast_features as ff

    raw = ff.load_influx(farm, days)
    if raw.empty:
        return {"farm": farm, "days": days, "status": "no_data",
                "incidents": [], "summary": None}
    events = detect_all(raw)
    return {
        "farm":      farm,
        "days":      days,
        "status":    "ok",
        "incidents": group_incidents(events),
        "summary":   summarise(events, raw),
        "readings":  int(len(raw)),
        "span":      [raw.index.min().isoformat(), raw.index.max().isoformat()],
    }


def summarise(events: list[Event], df: pd.DataFrame) -> dict:
    """
    The numbers §3.3 says to report. The alert rate per day is the one that
    decides whether an operator keeps paying attention, so it is first-class
    rather than buried under the counts.
    """
    n_days = df.index.normalize().nunique() if len(df) else 0
    by_detector: dict[str, int] = {}
    by_family = {"fault": 0, "unusual": 0}
    for e in events:
        by_detector[e.detector] = by_detector.get(e.detector, 0) + 1
        by_family[e.family] = by_family.get(e.family, 0) + 1

    incidents = group_incidents(events)
    fault_incidents = sum(1 for i in incidents if i["family"] == "fault")

    def per_day(n):
        return round(n / n_days, 2) if n_days else None

    return {
        "n_days":         n_days,
        "total":          len(events),
        "per_day":        per_day(len(events)),
        "faults_per_day": per_day(by_family["fault"]),
        # Incidents are what an operator actually experiences (§3.3): a sensor
        # thrashing for ten minutes is one interruption, not thirty.
        "incidents":              len(incidents),
        "incidents_per_day":      per_day(len(incidents)),
        "fault_incidents_per_day": per_day(fault_incidents),
        "by_detector":    by_detector,
        "by_family":      by_family,
    }
