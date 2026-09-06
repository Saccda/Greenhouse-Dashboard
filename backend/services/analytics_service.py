"""
Analytics computations for the Analytics page.

Everything here is computed server-side from RAW (un-aggregated) InfluxDB
readings, because averaging destroys the distribution shape, the true extremes,
and the exact relay transitions these analyses depend on. Only the summaries
travel to the browser.

METHODOLOGICAL NOTES — read before quoting any number from this module:

1. COVERAGE / SAMPLING BIAS.  The Kampot rig is powered down outside working
   hours (config.MAINTENANCE_START/END), so it only records roughly 08:00-16:00.
   Every proportion computed here is therefore conditional on *monitored hours*,
   which are the hottest part of the day. "Temperature exceeded 32 degrees 60% of
   the time" means 60% of monitored daytime, NOT 60% of the day. The API returns
   a `coverage` block precisely so the UI can state this rather than hide it.
   This is missing-not-at-random data: the gaps correlate with the very thing
   being measured (time of day -> temperature), so no reweighting fixes it.

2. PROPORTIONS ARE SAMPLE FRACTIONS.  time_in_range() and exceedance() count
   samples, not seconds. That equals a time fraction only when sampling is
   regular. It roughly is (~30 s cadence), but the coverage block reports the
   real interval spread so the reader can judge.

3. INDEPENDENCE.  Consecutive readings 30 s apart are strongly autocorrelated,
   so treating them as independent observations would produce absurdly narrow
   confidence intervals. diurnal_profile() therefore aggregates to one mean per
   (day, hour) first and computes the interval ACROSS DAYS — the day is the
   independent sampling unit, not the reading. See the function for detail.

4. THE SPRAY ANALYSIS IS OBSERVATIONAL, NOT AN EXPERIMENT.  Sprays fire
   *because* it is hot, so temperature would tend to fall afterwards even if
   spraying did nothing (regression to the mean), and afternoon sprays are
   followed by natural evening cooling. spray_effect() returns the paired
   estimate together with an explicit `confounds` list; it must not be presented
   as proof of causation.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta

import pandas as pd

import config
from services import stats_core


# ── Helpers ───────────────────────────────────────────────────────────────

def _series(df: pd.DataFrame, field: str) -> pd.DataFrame:
    """Rows for one field, time-sorted, nulls dropped."""
    if df is None or df.empty or "field" not in df.columns:
        return pd.DataFrame(columns=["time", "field", "value"])
    out = df[df["field"] == field].dropna(subset=["value"])
    return out.sort_values("time").reset_index(drop=True)


def _percentile(sorted_vals: list[float], q: float) -> float:
    """
    Linear-interpolation percentile (same convention as numpy's default), on an
    already-sorted list. q is a fraction in [0, 1].
    """
    if not sorted_vals:
        return float("nan")
    if len(sorted_vals) == 1:
        return float(sorted_vals[0])
    pos = q * (len(sorted_vals) - 1)
    lo = math.floor(pos)
    hi = math.ceil(pos)
    if lo == hi:
        return float(sorted_vals[int(pos)])
    frac = pos - lo
    return float(sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac)


# ── 1. Coverage — how much of the period did the sensor actually observe? ──

def coverage(df: pd.DataFrame, field: str, period_start: datetime, period_end: datetime) -> dict:
    """
    Quantify how much of the requested window the sensor actually covered, and
    which hours of the day are represented.

    This is the honesty layer for everything else on the page: a 61% exceedance
    rate computed from 8 hours a day of daylight-only readings means something
    very different from one computed from full 24-hour coverage.
    """
    s = _series(df, field)
    n = len(s)

    period_seconds = max((period_end - period_start).total_seconds(), 0.0)
    expected = int(period_seconds / config.EXPECTED_SAMPLE_INTERVAL_S) if period_seconds else 0

    hours_present: dict[int, int] = {}
    median_gap_s = None
    max_gap_s = None

    if n:
        hours_present = s["time"].dt.hour.value_counts().to_dict()
        if n > 1:
            gaps = s["time"].diff().dt.total_seconds().dropna()
            median_gap_s = float(gaps.median())
            max_gap_s = float(gaps.max())

    return {
        "samples":            n,
        "expected_samples":   expected,
        # Ratio of readings actually present to what a continuously-running
        # sensor would have produced. Capped at 1.0 — a slightly faster-than-
        # nominal cadence shouldn't read as ">100% coverage".
        "coverage_ratio":     min(n / expected, 1.0) if expected else None,
        "median_gap_seconds": median_gap_s,
        "max_gap_seconds":    max_gap_s,
        "hours_present":      sorted(int(h) for h in hours_present),
        "samples_by_hour":    {int(h): int(c) for h, c in sorted(hours_present.items())},
        "first_reading":      s["time"].min().isoformat() if n else None,
        "last_reading":       s["time"].max().isoformat() if n else None,
    }


# ── 2. Descriptive statistics + distribution ──────────────────────────────

def describe(df: pd.DataFrame, field: str) -> dict | None:
    """
    Location, spread, shape and percentiles.

    Reports BOTH the mean/SD pair and the median/IQR pair on purpose: they
    diverge exactly when the distribution is skewed or has outliers, which is
    the point worth teaching — and worth knowing before trusting an average.
    """
    s = _series(df, field)
    n = len(s)
    if n == 0:
        return None

    vals = sorted(float(v) for v in s["value"])
    mean = sum(vals) / n
    var = sum((v - mean) ** 2 for v in vals) / (n - 1) if n > 1 else 0.0
    sd = math.sqrt(var)

    p = {q: _percentile(vals, q) for q in (0.05, 0.25, 0.50, 0.75, 0.95)}
    iqr = p[0.75] - p[0.25]

    # Fisher-Pearson sample skewness. > 0 means a long right tail (the hot
    # extremes stretch further than the cool ones), which for temperature is
    # the difference between "warm all day" and "fine but with heat spikes".
    skew = None
    if n > 2 and sd > 0:
        m3 = sum((v - mean) ** 3 for v in vals) / n
        skew = m3 / (sd ** 3)

    # Tukey box-plot anatomy. The fences are Q1/Q3 ± 1.5·IQR; the whiskers stop
    # at the most extreme reading still INSIDE the fences (not at the fence
    # itself), and anything beyond counts as an outlier. This is the textbook
    # construction, and it is what makes the strip on the Analytics page an
    # actual box plot rather than a percentile bar.
    lower_fence = p[0.25] - 1.5 * iqr
    upper_fence = p[0.75] + 1.5 * iqr
    inside = [v for v in vals if lower_fence <= v <= upper_fence]
    whisker_low = inside[0] if inside else vals[0]
    whisker_high = inside[-1] if inside else vals[-1]
    outliers_low = sum(1 for v in vals if v < lower_fence)
    outliers_high = sum(1 for v in vals if v > upper_fence)

    return {
        "n":      n,
        "mean":   mean,
        "sd":     sd,
        "min":    vals[0],
        "max":    vals[-1],
        "p05":    p[0.05],
        "p25":    p[0.25],
        "median": p[0.50],
        "p75":    p[0.75],
        "p95":    p[0.95],
        "iqr":    iqr,
        "skewness": skew,
        # Box-plot anatomy
        "lower_fence":   lower_fence,
        "upper_fence":   upper_fence,
        "whisker_low":   whisker_low,
        "whisker_high":  whisker_high,
        "outliers_low":  outliers_low,
        "outliers_high": outliers_high,
    }


def histogram(df: pd.DataFrame, field: str) -> dict | None:
    """
    Empirical distribution, binned by the Freedman-Diaconis rule.

    Bin width = 2 * IQR / n^(1/3). Chosen over a fixed bin count because it
    adapts to both spread and sample size and is driven by the IQR, so a couple
    of extreme readings can't blow the binning out. Falls back to Sturges'
    rule when the IQR is zero (a near-constant series), which FD can't handle.
    """
    s = _series(df, field)
    n = len(s)
    if n < 2:
        return None

    vals = sorted(float(v) for v in s["value"])
    lo, hi = vals[0], vals[-1]
    if hi <= lo:
        return None

    iqr = _percentile(vals, 0.75) - _percentile(vals, 0.25)
    if iqr > 0:
        width = 2 * iqr / (n ** (1 / 3))
        bin_count = max(1, min(60, math.ceil((hi - lo) / width))) if width > 0 else 10
        rule = "freedman-diaconis"
    else:
        bin_count = max(1, min(60, math.ceil(math.log2(n) + 1)))
        rule = "sturges"

    width = (hi - lo) / bin_count
    counts = [0] * bin_count
    for v in vals:
        idx = int((v - lo) / width)
        if idx >= bin_count:      # the maximum value lands exactly on the edge
            idx = bin_count - 1
        counts[idx] += 1

    return {
        "rule": rule,
        "bin_width": width,
        "bins": [
            {
                "start":    lo + i * width,
                "end":      lo + (i + 1) * width,
                "mid":      lo + (i + 0.5) * width,
                "count":    counts[i],
                "fraction": counts[i] / n,
            }
            for i in range(bin_count)
        ],
    }


# ── 3. Time-in-range and exceedance ───────────────────────────────────────

def time_in_range(df: pd.DataFrame, field: str) -> dict | None:
    """
    Share of readings falling in each configured agronomic band.

    Counts SAMPLES, which approximates time share because the cadence is
    near-regular — read alongside the coverage block, which reports the actual
    interval spread. Bands come from config.ANALYTICS_BANDS and are operator-set
    targets, not measured facts.
    """
    bands = config.ANALYTICS_BANDS.get(field)
    if not bands:
        return None

    s = _series(df, field)
    n = len(s)
    if n == 0:
        return None

    out = []
    for band in bands:
        lo, hi = band["min"], band["max"]
        mask = pd.Series(True, index=s.index)
        if lo is not None:
            mask &= s["value"] >= lo
        if hi is not None:
            mask &= s["value"] < hi
        count = int(mask.sum())
        out.append({
            "label":    band["label"],
            "status":   band["status"],
            "min":      lo,
            "max":      hi,
            "count":    count,
            "fraction": count / n,
        })

    optimal = sum(b["fraction"] for b in out if b["status"] == "optimal")
    return {"n": n, "bands": out, "optimal_fraction": optimal}


def exceedance(df: pd.DataFrame, field: str, threshold: float) -> dict | None:
    """
    How often, and for how long at a stretch, the series sat above `threshold`.

    Two different questions, deliberately answered separately:
      - `probability`  — the share of readings above the threshold. An estimate
        of P(X > threshold | monitored hours).
      - `longest_episode_minutes` / `episodes` — how that exposure was
        distributed in time. Thirty brief breaches and one unbroken three-hour
        breach can produce an identical probability but mean very different
        things for crop stress, so the page shows both.

    Episodes are split whenever the gap between consecutive readings exceeds
    config.EXCEEDANCE_MAX_GAP_S, so an overnight shutdown is never reported as
    one continuous multi-hour episode.
    """
    s = _series(df, field)
    n = len(s)
    if n == 0:
        return None

    above = s["value"] > threshold
    count_above = int(above.sum())

    episodes: list[dict] = []
    run_start = None
    prev_time = None

    for time, is_above in zip(s["time"], above):
        gap_broken = (
            prev_time is not None
            and (time - prev_time).total_seconds() > config.EXCEEDANCE_MAX_GAP_S
        )
        if gap_broken and run_start is not None:
            episodes.append({"start": run_start, "end": prev_time})
            run_start = None

        if is_above and run_start is None:
            run_start = time
        elif not is_above and run_start is not None:
            episodes.append({"start": run_start, "end": prev_time if prev_time else time})
            run_start = None

        prev_time = time

    if run_start is not None and prev_time is not None:
        episodes.append({"start": run_start, "end": prev_time})

    durations = [(e["end"] - e["start"]).total_seconds() / 60.0 for e in episodes]
    durations = [d for d in durations if d > 0]

    return {
        "threshold":               threshold,
        "n":                       n,
        "count_above":             count_above,
        "probability":             count_above / n,
        "episodes":                len(durations),
        "longest_episode_minutes": max(durations) if durations else 0.0,
        "mean_episode_minutes":    (sum(durations) / len(durations)) if durations else 0.0,
        "total_minutes_above":     sum(durations),
    }


# ── 4. Diurnal profile ────────────────────────────────────────────────────

def diurnal_profile(df: pd.DataFrame, field: str, confidence: float = 0.95) -> dict | None:
    """
    Average shape of the day, hour by hour, with a confidence interval.

    THE KEY STATISTICAL CHOICE: readings 30 s apart are strongly
    autocorrelated, so pooling them and dividing by sqrt(n) would treat ~120
    near-identical readings as 120 independent facts and produce a confidence
    interval far too narrow to believe.

    Instead each (calendar day, hour) is collapsed to a single mean first, and
    the interval is computed ACROSS DAYS — the independent unit is the day, so
    n is the number of days observed for that hour, typically single digits.
    The resulting interval answers the question actually being asked: "how much
    does this hour vary from day to day?"

    Hours with fewer than 2 days of data get a mean but no interval (a single
    day gives no basis for estimating between-day variability).
    """
    s = _series(df, field)
    if s.empty:
        return None

    s = s.copy()
    s["date"] = s["time"].dt.date
    s["hour"] = s["time"].dt.hour

    # Step 1: one mean per (day, hour) — collapses within-hour autocorrelation.
    daily_hour = s.groupby(["date", "hour"])["value"].mean().reset_index()

    hours = []
    for hour in range(24):
        day_means = [float(v) for v in daily_hour[daily_hour["hour"] == hour]["value"]]
        if not day_means:
            hours.append({
                "hour": hour, "days": 0, "mean": None,
                "ci_lower": None, "ci_upper": None,
            })
            continue

        # Step 2: interval across days, not across readings.
        ci = stats_core.mean_confidence_interval(day_means, confidence)
        if ci is None:
            hours.append({
                "hour": hour, "days": len(day_means),
                "mean": sum(day_means) / len(day_means),
                "ci_lower": None, "ci_upper": None,
            })
        else:
            mean, lo, hi = ci
            hours.append({
                "hour": hour, "days": len(day_means),
                "mean": mean, "ci_lower": lo, "ci_upper": hi,
            })

    observed = [h for h in hours if h["days"] > 0]
    hottest = max(observed, key=lambda h: h["mean"]) if observed else None

    return {
        "confidence":     confidence,
        "hours":          hours,
        "observed_hours": [h["hour"] for h in observed],
        "peak_hour":      hottest["hour"] if hottest else None,
        "peak_mean":      hottest["mean"] if hottest else None,
        "sampling_unit":  "day",
    }


# ── 5. Spray effectiveness (paired before/after) ──────────────────────────

def spray_effect(
    df: pd.DataFrame,
    spray_events: list[dict],
    field: str = "temperature",
    window_minutes: float = 10.0,
    min_samples_per_window: int = 3,
    confidence: float = 0.95,
) -> dict:
    """
    Did spraying actually change `field`, and by how much?

    Method: for each spray event, average the readings in the `window_minutes`
    immediately BEFORE it started and the `window_minutes` immediately AFTER it
    ended, then analyse the paired differences (after - before) with a paired
    t-test and a confidence interval on the mean difference.

    Pairing (rather than comparing two independent groups) is the right design
    here because each event supplies its own baseline, which removes the
    between-event variation caused by time of day, weather and season.

    Events are SKIPPED when either window has fewer than
    `min_samples_per_window` readings — most often because the event sits at the
    edge of the monitored window (a 15:55 spray has no 16:05 "after" data once
    the rig powers down). The count is reported so the reader can see how much
    of the data the estimate actually rests on.

    THE RESULT IS ASSOCIATION, NOT PROOF OF CAUSATION. The `confounds` list
    returned alongside it is not boilerplate — it is the honest reading of the
    design, and it belongs on screen next to the number.
    """
    s = _series(df, field)
    result_confounds = [
        "Sprays are triggered *because* temperature is high, so readings would "
        "tend to fall afterwards even with no cooling effect (regression to the mean).",
        "Afternoon sprays are followed by natural end-of-day cooling, which this "
        "design cannot separate from the spray's own effect.",
        "Observational data with no unsprayed control periods — a matched-control "
        "or randomised-timing comparison would be needed to claim causation.",
    ]

    if s.empty or not spray_events:
        # Same key set as the normal return below — the frontend reads these
        # unconditionally, so an early exit must not produce a narrower shape.
        return {
            "field": field, "window_minutes": window_minutes, "confidence": confidence,
            "n_events_total": len(spray_events), "n_events_used": 0, "n_events_skipped": 0,
            "pairs": [], "mean_difference": None, "ci_lower": None, "ci_upper": None,
            "p_value": None, "cohens_d": None, "resolution_c": None,
            "interpretation": _interpret_effect(0, None, None, None),
            "confounds": result_confounds,
        }

    times = s["time"]
    values = s["value"]
    window = timedelta(minutes=window_minutes)

    pairs: list[dict] = []
    skipped = 0

    for ev in spray_events:
        try:
            start = datetime.fromisoformat(ev["start_time"])
            end = datetime.fromisoformat(ev["end_time"])
        except (KeyError, ValueError, TypeError):
            skipped += 1
            continue

        before_mask = (times >= start - window) & (times < start)
        after_mask = (times > end) & (times <= end + window)

        before_vals = values[before_mask]
        after_vals = values[after_mask]

        if len(before_vals) < min_samples_per_window or len(after_vals) < min_samples_per_window:
            skipped += 1
            continue

        before_mean = float(before_vals.mean())
        after_mean = float(after_vals.mean())
        pairs.append({
            "start_time":  ev["start_time"],
            "duration_minutes": ev.get("duration_minutes"),
            "before":      before_mean,
            "after":       after_mean,
            "difference":  after_mean - before_mean,
            "n_before":    int(len(before_vals)),
            "n_after":     int(len(after_vals)),
        })

    diffs = [p["difference"] for p in pairs]
    n = len(diffs)

    mean_diff = ci_lo = ci_hi = p_value = cohens_d = None
    if n >= 2:
        ci = stats_core.mean_confidence_interval(diffs, confidence)
        if ci:
            mean_diff, ci_lo, ci_hi = ci
        sd = math.sqrt(sum((d - mean_diff) ** 2 for d in diffs) / (n - 1))
        if sd > 0:
            t_stat = mean_diff / (sd / math.sqrt(n))
            p_value = stats_core.t_two_sided_p(t_stat, n - 1)
            # Cohen's d for paired data: mean difference in SD units. Reported
            # because a statistically significant but tiny effect (a 0.1 C drop)
            # is not an operationally useful one.
            cohens_d = mean_diff / sd
    elif n == 1:
        mean_diff = diffs[0]

    # Resolution limit: half the CI width. With this many events we could only
    # have detected an effect at least this large — the single most useful
    # number when the result is null, and the one that separates "no effect"
    # from "not enough data to see one".
    resolution = (ci_hi - ci_lo) / 2 if (ci_lo is not None and ci_hi is not None) else None
    interpretation = _interpret_effect(n, ci_lo, ci_hi, resolution)

    return {
        "field":            field,
        "window_minutes":   window_minutes,
        "confidence":       confidence,
        "n_events_total":   len(spray_events),
        "n_events_used":    n,
        "n_events_skipped": skipped,
        "pairs":            pairs,
        "mean_difference":  mean_diff,
        "ci_lower":         ci_lo,
        "ci_upper":         ci_hi,
        "p_value":          p_value,
        "cohens_d":         cohens_d,
        "resolution_c":     resolution,
        "interpretation":   interpretation,
        "confounds":        result_confounds,
    }


# Minimum paired events before the estimate is worth reading at all. Below this
# the confidence interval is so wide that a null result carries no information —
# it reflects the sample size, not the sprinklers.
MIN_EVENTS_FOR_INFERENCE = 5


def _interpret_effect(n: int, ci_lo, ci_hi, resolution) -> dict:
    """
    Turn the numbers into a verdict the UI cannot misreport.

    The distinction being protected here is the one people get wrong most often:
    a wide interval straddling zero means "we could not detect an effect", which
    is NOT the same claim as "there is no effect". With only a handful of spray
    events, the honest answer is that the study is underpowered.
    """
    if n < 2:
        return {
            "verdict": "insufficient_data",
            "headline": "Not enough spray events to analyse",
            "detail": "At least two usable spray events are needed to estimate an "
                      "average change and its uncertainty.",
        }

    if n < MIN_EVENTS_FOR_INFERENCE:
        res = f"{resolution:.2f} °C" if resolution is not None else "a large amount"
        return {
            "verdict": "underpowered",
            "headline": f"Too few spray events ({n}) to draw a conclusion",
            "detail": f"With {n} events this analysis could only have detected a change "
                      f"larger than about {res}. A null result here reflects the small "
                      f"sample, not evidence that spraying has no effect. Aim for at "
                      f"least {MIN_EVENTS_FOR_INFERENCE} events before interpreting.",
        }

    if ci_lo is not None and ci_hi is not None and ci_hi < 0:
        return {
            "verdict": "cooling_detected",
            "headline": "Measurable cooling after spraying",
            "detail": "The confidence interval lies entirely below zero, so the average "
                      "temperature after spraying was reliably lower. Association only — "
                      "see the confounds before claiming the spray caused it.",
        }

    if ci_lo is not None and ci_hi is not None and ci_lo > 0:
        return {
            "verdict": "warming_detected",
            "headline": "Temperature was higher after spraying",
            "detail": "The confidence interval lies entirely above zero. This most likely "
                      "reflects when sprays fire (during rising midday heat) rather than "
                      "the spray warming anything.",
        }

    res = f"{resolution:.2f} °C" if resolution is not None else "unknown"
    return {
        "verdict": "no_detectable_effect",
        "headline": "No effect detected at this sample size",
        "detail": f"The confidence interval includes zero, so no reliable change was "
                  f"measured. Any real effect smaller than about {res} would be invisible "
                  f"to this analysis — collect more events to narrow that limit.",
    }


def water_efficiency(spray_stats: dict, effect: dict) -> dict | None:
    """
    Litres of water per degree of cooling achieved.

    Turns the existing water-use estimate into a cost-effectiveness figure:
    total litres divided by the mean cooling per spray. Returns None when the
    fogger spec isn't configured for the farm, when no usable spray pairs
    exist, or when the measured mean change wasn't a cooling one — dividing by
    a warming or zero effect would produce a meaningless number rather than an
    honest "we can't tell yet".
    """
    liters = spray_stats.get("estimated_water_liters")
    mean_diff = effect.get("mean_difference")
    used = effect.get("n_events_used") or 0

    if liters is None or mean_diff is None or used < 2:
        return None
    cooling = -mean_diff              # negative difference == cooling
    if cooling <= 0:
        return {
            "liters_total": liters,
            "mean_cooling_c": cooling,
            "liters_per_degree": None,
            "note": "No net cooling measured over this period, so a litres-per-degree "
                    "figure would be meaningless.",
        }

    return {
        "liters_total":      liters,
        "mean_cooling_c":    cooling,
        "liters_per_degree": liters / cooling,
        "note":              None,
    }
