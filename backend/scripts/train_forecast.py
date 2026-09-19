"""
Stage 1 training — fit the shipped model and save the artifact the API loads.

Run AFTER validate_forecast.py, and only for a model that validation showed
beats persistence (§2.3, §4.5). If nothing beats persistence, there is nothing
to train: the API serves persistence directly, which needs no artifact.

    python scripts/train_forecast.py --source postgres                # ridge
    python scripts/train_forecast.py --source postgres --model hgb     # if it won
    python scripts/train_forecast.py --source postgres --target humidity

For each horizon it:
  1. Collects HONEST prediction-interval quantiles from out-of-fold residuals —
     rolling-origin, day-blocked (§4.1), never in-sample — so the 80% interval
     the API serves is the one measured on unseen days (§2.4).
  2. Refits the chosen model on ALL available days.
  3. Saves {model, residual quantiles, feature names, metadata} to
     backend/models/forecast_<target>_<horizon>m.joblib.

The metadata records the training span, day count and out-of-fold MAE so a model
in production can always be traced back to what it was fit on.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import json

import joblib
import numpy as np
import pandas as pd

import config
from services import forecast_features as ff
from scripts.validate_forecast import _fit_ridge, _fit_hgb, INTERVAL

MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")


def _persistence_bands(table, horizon, init_days):
    """
    The SHIPPED Stage 1 artifact (§2.6): the empirical 80% interval of persistence
    residuals, measured out-of-fold.

    For each test day, the band is taken from the TRAINING persistence residuals
    (so it is never fit on the day it is scored), and coverage is checked on the
    test day. The returned q_lo/q_hi are the pooled out-of-fold quantiles the API
    adds to the current reading — never in-sample, so the band the farm sees is
    the one measured on days the method never saw.
    """
    days = sorted(table["day"].unique())
    pooled_resid, cover_hits, cover_total, per_day_mae = [], 0, 0, []
    for i in range(init_days, len(days)):
        train = table[table["day"].isin(days[:i])]
        test  = table[table["day"] == days[i]]
        if len(train) < 200 or test.empty:
            continue
        r_tr = (train["y"] - train["y_persist"]).to_numpy()
        r_te = (test["y"] - test["y_persist"]).to_numpy()
        lo = np.quantile(r_tr, (1 - INTERVAL) / 2)
        hi = np.quantile(r_tr, 1 - (1 - INTERVAL) / 2)
        cover_hits += int(((r_te >= lo) & (r_te <= hi)).sum())
        cover_total += len(r_te)
        pooled_resid.append(r_te)
        per_day_mae.append(float(np.abs(r_te).mean()))
    if not pooled_resid:
        return None
    pooled = np.concatenate(pooled_resid)
    return {
        "q_lo":      round(float(np.quantile(pooled, (1 - INTERVAL) / 2)), 3),
        "q_hi":      round(float(np.quantile(pooled, 1 - (1 - INTERVAL) / 2)), 3),
        "oof_mae":   round(float(np.mean(per_day_mae)), 3),
        "coverage":  round(cover_hits / cover_total, 3) if cover_total else None,
        "n_test_days": len(per_day_mae),
    }


def _oof_residuals(table, feats, horizon, fit_fn, init_days):
    """
    Out-of-fold residuals via rolling origin — each residual comes from a model
    that never saw that day (§4.1). These, not in-sample residuals, define the
    prediction interval, or it would be optimistically narrow (§2.4).
    """
    days = sorted(table["day"].unique())
    resid, per_day_mae = [], []
    for i in range(init_days, len(days)):
        train = table[table["day"].isin(days[:i])]
        test  = table[table["day"] == days[i]]
        if len(train) < 200 or test.empty:
            continue
        model = fit_fn(train[feats].to_numpy(), train["y"].to_numpy())
        pred = model.predict(test[feats].to_numpy())
        r = test["y"].to_numpy() - pred
        resid.append(r)
        per_day_mae.append(float(np.abs(r).mean()))
    if not resid:
        return None
    return np.concatenate(resid), np.array(per_day_mae)


def train_one(raw, target, horizon, model_name, init_days):
    table = ff.build_features(raw, horizon)
    if table.empty:
        print(f"  horizon {horizon}: no data"); return
    feats = ff.FeatureSpec(horizon).feature_names
    fit_fn = _fit_hgb if model_name == "hgb" else _fit_ridge

    oof = _oof_residuals(table, feats, horizon, fit_fn, init_days)
    if oof is None:
        print(f"  horizon {horizon}: not enough days to validate before saving")
        return
    resid, per_day_mae = oof

    # Persistence per-day MAE over the same folds, so the saved skill is honest.
    days = sorted(table["day"].unique())
    persist_mae = np.array([
        float(np.abs(table[table["day"] == days[i]]["y"]
                     - table[table["day"] == days[i]]["y_persist"]).mean())
        for i in range(init_days, len(days))
        if not table[table["day"] == days[i]].empty
    ])
    skill = 1 - per_day_mae.mean() / persist_mae.mean()

    # Refit on everything for the artifact.
    model = fit_fn(table[feats].to_numpy(), table["y"].to_numpy())
    q_lo = float(np.quantile(resid, (1 - INTERVAL) / 2))
    q_hi = float(np.quantile(resid, 1 - (1 - INTERVAL) / 2))

    artifact = {
        "model": model,
        "model_name": model_name,
        "target": target,
        "horizon_min": horizon,
        "feature_names": feats,
        "interval": INTERVAL,
        "resid_q_lo": q_lo,
        "resid_q_hi": q_hi,
        "metadata": {
            "trained_at":   datetime.now(config.TIMEZONE).isoformat(),
            "train_span":   [str(days[0]), str(days[-1])],
            "n_days":       len(days),
            "n_rows":       int(len(table)),
            "oof_mae":      round(float(per_day_mae.mean()), 4),
            "persist_mae":  round(float(persist_mae.mean()), 4),
            "skill_vs_persistence": round(float(skill), 4),
        },
    }

    os.makedirs(MODELS_DIR, exist_ok=True)
    path = os.path.join(MODELS_DIR, f"forecast_{target}_{horizon}m.joblib")
    joblib.dump(artifact, path)

    verdict = "beats persistence" if skill > 0 else "does NOT beat persistence"
    print(f"  horizon {horizon:>2}min  {model_name:<5}  oof MAE {per_day_mae.mean():.3f}  "
          f"skill {skill:+.3f}  [{verdict}]")
    print(f"           80% interval [{q_lo:+.2f}, {q_hi:+.2f}] C  ->  {os.path.relpath(path)}")
    if skill <= 0:
        print(f"           WARNING: saved, but validation says ship persistence, "
              f"not this (ML_METHODOLOGY §2.3).")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", choices=("postgres", "influx"), default="postgres")
    ap.add_argument("--target", choices=("temperature", "humidity"), default="temperature")
    ap.add_argument("--model", choices=("ridge", "hgb"), default="ridge")
    ap.add_argument("--influx-days", type=int, default=30)
    ap.add_argument("--init-days", type=int, default=20)
    args = ap.parse_args()

    print(f"Stage 1 training - {datetime.now(config.TIMEZONE):%Y-%m-%d %H:%M %Z}")
    print(f"source: {args.source}   target: {args.target}   model: {args.model}")

    raw = (ff.load_postgres() if args.source == "postgres"
           else ff.load_influx("kampot", args.influx_days))
    if args.target == "humidity":
        raw = raw.rename(columns={"temperature": "_t", "humidity": "temperature",
                                  "_t": "humidity"})

    # 1. The shipped artifact: persistence interval bands (§2.6). This is what
    #    the API actually serves — always emitted, model or no model.
    bands = {"target": args.target, "interval": INTERVAL, "unit": "°C",
             "model": "persistence", "horizons": {}}
    for hz in ff.HORIZONS:
        table = ff.build_features(raw, hz)
        if table.empty:
            continue
        b = _persistence_bands(table, hz, args.init_days)
        if b:
            bands["horizons"][str(hz)] = b
    bands["metadata"] = {
        "trained_at": datetime.now(config.TIMEZONE).isoformat(),
        "source": args.source, "farm": "kampot",
    }
    os.makedirs(MODELS_DIR, exist_ok=True)
    bands_path = os.path.join(MODELS_DIR, f"forecast_bands_{args.target}.json")
    with open(bands_path, "w", encoding="utf-8") as f:
        json.dump(bands, f, indent=2)
    print(f"\nShipped artifact -> {os.path.relpath(bands_path)}")
    for hz, b in bands["horizons"].items():
        print(f"  {hz:>3}min  band [{b['q_lo']:+.2f}, {b['q_hi']:+.2f}] "
              f"coverage {b['coverage']:.0%}  (persistence MAE {b['oof_mae']})")

    # 2. The shelved point-forecast model, kept for the record (§2.6).
    print("\nShelved model (for the record):")
    for hz in ff.HORIZONS:
        train_one(raw, args.target, hz, args.model, args.init_days)

    print("\nThe API loads forecast_bands_*.json and serves persistence + interval.")


if __name__ == "__main__":
    main()
