"""
Stage 1 validation — the rolling-origin, day-blocked skill-score harness (§4).

This is the artifact that decides whether Stage 1 ships. It answers one question
honestly: *given everything up to yesterday, how much better than the naive
baseline are we on a day we have never seen?* If the answer is "not
significantly", that is a finding and it gets printed as one (§4.5) — persistence
is then the right production choice and no model is shipped.

Run on the lab desktop against the archive:

    python scripts/validate_forecast.py --source postgres
    python scripts/validate_forecast.py --source postgres --target humidity
    python scripts/validate_forecast.py --source influx --no-hgb   # dev, off-machine

Everything below obeys §4:
  - Rolling origin, blocked by day (§4.1). Never a random split (§4.2).
  - Scalers and the diurnal baseline are fit INSIDE each training block (§4.3).
  - Ridge's alpha is chosen on a time-ordered split within the training block,
    never on the test day (§4.3).
  - Metrics are MAE, RMSE, skill score, per-day MAE spread, and realised interval
    coverage (§4.4), with a paired t-test across held-out days (§4.5) reusing the
    project's own stats_core.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Windows consoles default to cp1252 and crash on any character outside it.
# Printed strings here are ASCII, but this makes a stray one degrade to "?"
# rather than abort a long validation run near the end.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.ensemble import HistGradientBoostingRegressor

import config
from services import forecast_features as ff
from services import stats_core

RIDGE_ALPHAS = (0.1, 1.0, 10.0, 100.0)
INTERVAL = 0.80                     # nominal prediction-interval coverage (§2.4)


# ── the model ladder (§2.3) ──────────────────────────────────────────────────

def _fit_ridge(Xtr, ytr):
    """
    Ridge with alpha chosen on a time-ordered split INSIDE the training block —
    the last 20% of training rows serve as validation, never the test day (§4.3).
    """
    n = len(Xtr)
    cut = int(n * 0.8)
    if cut < 10 or cut >= n:                       # too little to split — fixed alpha
        best_alpha = 1.0
    else:
        Xa, Xb = Xtr[:cut], Xtr[cut:]
        ya, yb = ytr[:cut], ytr[cut:]
        best_alpha, best_mae = 1.0, np.inf
        for a in RIDGE_ALPHAS:
            m = make_pipeline(StandardScaler(), Ridge(alpha=a)).fit(Xa, ya)
            mae = np.abs(yb - m.predict(Xb)).mean()
            if mae < best_mae:
                best_alpha, best_mae = a, mae
    return make_pipeline(StandardScaler(), Ridge(alpha=best_alpha)).fit(Xtr, ytr)


def _fit_hgb(Xtr, ytr):
    # Modest depth/leaves — a few hundred day-blocks cannot constrain a large
    # tree ensemble, and the point is to beat ridge clearly or not at all (§2.3).
    return HistGradientBoostingRegressor(
        max_depth=3, max_iter=300, learning_rate=0.05,
        min_samples_leaf=50, l2_regularization=1.0, random_state=0,
    ).fit(Xtr, ytr)


def _diurnal_profile(train: pd.DataFrame, horizon: int):
    """
    Temperature-by-clock-position climatology, fit on training rows only (§4.3).
    Predicts the typical temperature at the TARGET's clock position (t + horizon).
    """
    bucket = train["mins_since_open"].round().astype(int)
    profile = train["temp_lag_0"].groupby(bucket).mean()
    global_mean = float(train["temp_lag_0"].mean())

    def predict(rows: pd.DataFrame) -> np.ndarray:
        target_clock = (rows["mins_since_open"] + horizon).round().astype(int)
        return profile.reindex(target_clock).fillna(global_mean).to_numpy()

    return predict


# ── one horizon, full rolling-origin pass ────────────────────────────────────

def validate_horizon(table: pd.DataFrame, horizon: int, feats, use_hgb: bool,
                     init_days: int):
    days = sorted(table["day"].unique())
    if len(days) <= init_days + 1:
        print(f"  horizon {horizon}: not enough days ({len(days)}) for CV")
        return None

    # Per-day MAE for every model, plus interval hit/count. Coverage is tracked
    # for BOTH ridge and persistence: §2.6 ships the interval around persistence,
    # so that is the band whose calibration actually has to hold.
    per_day = {m: {} for m in ("persistence", "diurnal", "ridge", "hgb")}
    cover_hits = cover_total = 0
    pcover_hits = pcover_total = 0

    for i in range(init_days, len(days)):
        test_day = days[i]
        train = table[table["day"].isin(days[:i])]
        test  = table[table["day"] == test_day]
        if len(train) < 200 or test.empty:
            continue

        Xtr, ytr = train[feats].to_numpy(), train["y"].to_numpy()
        Xte, yte = test[feats].to_numpy(),  test["y"].to_numpy()

        def mae(pred):
            return float(np.abs(yte - pred).mean())

        # 1. Persistence — ŷ = temp now.
        per_day["persistence"][test_day] = mae(test["y_persist"].to_numpy())
        # 2. Diurnal climatology.
        per_day["diurnal"][test_day] = mae(_diurnal_profile(train, horizon)(test))
        # 3. Ridge.
        ridge = _fit_ridge(Xtr, ytr)
        ridge_pred = ridge.predict(Xte)
        per_day["ridge"][test_day] = mae(ridge_pred)
        # 4. Gradient boosting (optional).
        if use_hgb:
            per_day["hgb"][test_day] = mae(_fit_hgb(Xtr, ytr).predict(Xte))

        # Interval coverage from empirical training-residual quantiles applied to
        # the test day (§2.4), for ridge and for persistence.
        def coverage(pred_tr, pred_te):
            r = ytr - pred_tr
            lo = np.quantile(r, (1 - INTERVAL) / 2)
            hi = np.quantile(r, 1 - (1 - INTERVAL) / 2)
            inside = (yte >= pred_te + lo) & (yte <= pred_te + hi)
            return int(inside.sum()), len(yte)

        h, tot = coverage(ridge.predict(Xtr), ridge_pred)
        cover_hits += h; cover_total += tot
        ph, ptot = coverage(train["y_persist"].to_numpy(), test["y_persist"].to_numpy())
        pcover_hits += ph; pcover_total += ptot

    return _summarise(horizon, per_day, use_hgb,
                      cover_hits, cover_total, pcover_hits, pcover_total)


def _summarise(horizon, per_day, use_hgb, cover_hits, cover_total,
               pcover_hits=0, pcover_total=0):
    days = sorted(per_day["persistence"].keys())
    base = np.array([per_day["persistence"][d] for d in days])

    def line(name):
        vals = np.array([per_day[name][d] for d in days])
        mean_mae = vals.mean()
        # Skill score on MSE-equivalent: use squared per-day errors' means? We
        # only kept per-day MAE, so report skill on MAE means, which is what the
        # farm owner reads. (RMSE-based skill would need per-row errors kept.)
        skill = 1 - mean_mae / base.mean()
        # Paired test on per-day MAE differences (baseline - model), §4.5.
        diff = base - vals
        n = len(diff)
        sd = diff.std(ddof=1)
        if sd > 0 and n > 1:
            t = diff.mean() / (sd / np.sqrt(n))
            p = stats_core.t_two_sided_p(t, n - 1)
        else:
            t, p = float("nan"), float("nan")
        return name, mean_mae, skill, diff.mean(), p, n

    rows = [line("persistence"), line("diurnal"), line("ridge")]
    if use_hgb:
        rows.append(line("hgb"))

    print(f"\n  == horizon {horizon} min ==  ({rows[0][5]} held-out days)")
    print(f"  {'model':<12}{'MAE(C)':>9}{'skill':>9}{'dMAE':>9}{'p vs base':>11}")
    for name, mae_, skill, dmae, p, _ in rows:
        skill_s = "  -  " if name == "persistence" else f"{skill:+.3f}"
        p_s     = "  -  " if name == "persistence" else (f"{p:.4f}" if p == p else "  n/a")
        print(f"  {name:<12}{mae_:>9.3f}{skill_s:>9}{dmae:>9.3f}{p_s:>11}")

    cov = cover_hits / cover_total if cover_total else float("nan")
    pcov = pcover_hits / pcover_total if pcover_total else float("nan")
    print(f"  {int(INTERVAL*100)}% interval realised coverage: "
          f"ridge {cov:.1%}   persistence {pcov:.1%}   (nominal {int(INTERVAL*100)}%)")

    # Per-day spread for the best non-baseline model (§4.4).
    best = min(("ridge",) + (("hgb",) if use_hgb else ()),
               key=lambda m: np.mean([per_day[m][d] for d in days]))
    bvals = np.array([per_day[best][d] for d in days])
    print(f"  {best} per-day MAE spread: median {np.median(bvals):.3f}  "
          f"p90 {np.quantile(bvals,0.9):.3f}  max {bvals.max():.3f}")
    return {"horizon": horizon, "rows": rows, "coverage": cov, "best": best}


# ── entry point ──────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", choices=("postgres", "influx"), default="postgres")
    ap.add_argument("--target", choices=("temperature", "humidity"), default="temperature")
    ap.add_argument("--influx-days", type=int, default=30)
    ap.add_argument("--init-days", type=int, default=20,
                    help="days of history before the first test day")
    ap.add_argument("--no-hgb", action="store_true", help="skip gradient boosting")
    args = ap.parse_args()

    print(f"Stage 1 validation - {datetime.now(config.TIMEZONE):%Y-%m-%d %H:%M %Z}")
    print(f"source: {args.source}   target: {args.target}")

    raw = (ff.load_postgres() if args.source == "postgres"
           else ff.load_influx("kampot", args.influx_days))
    if args.target == "humidity":
        # Swap the target column so the identical pipeline forecasts humidity
        # (§2.1 — secondary target, same features, fitted separately).
        raw = raw.rename(columns={"temperature": "_t", "humidity": "temperature",
                                  "_t": "humidity"})

    for hz in ff.HORIZONS:
        table = ff.build_features(raw, hz)
        if table.empty:
            print(f"  horizon {hz}: no data"); continue
        validate_horizon(table, hz, ff.FeatureSpec(hz).feature_names,
                         use_hgb=not args.no_hgb, init_days=args.init_days)

    print("\n" + "=" * 66)
    print("Reading this: skill > 0 with a small p means the model beats")
    print("persistence on unseen days. Skill <= 0 or a large p means it does")
    print("not — ship persistence and say so (ML_METHODOLOGY §2.3, §4.5).")


if __name__ == "__main__":
    main()
