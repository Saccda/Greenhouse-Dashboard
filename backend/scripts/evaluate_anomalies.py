"""
Stage 2 evaluation — run the detectors over history and report honestly (§3.3).

There are NO LABELS. Nobody has annotated which historical readings were faulty,
so precision and recall cannot be computed and any such figure would be invented.
What this script produces instead is what §3.3 commits to:

  1. Every flagged event over the full history, listed so a human can classify
     each one as true fault / genuine extreme / false alarm.
  2. Counts by detector.
  3. The ALERT RATE PER DAY — the number that decides whether operators keep
     paying attention or start ignoring the thing. An alarm firing ten times a
     day is muted within a week, and a muted alarm has negative value.

    python scripts/evaluate_anomalies.py --source postgres
    python scripts/evaluate_anomalies.py --source postgres --list 40
    python scripts/evaluate_anomalies.py --source influx        # dev, off-machine

Exit code is 0 regardless of what is found; this reports, it does not gate.
"""
from __future__ import annotations

import argparse
import os
import sys
from collections import Counter
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import config
from services import forecast_features as ff
from services import anomaly_service as an


def rule(title=""):
    print("\n" + "=" * 74)
    if title:
        print(title)
        print("=" * 74)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", choices=("postgres", "influx"), default="postgres")
    ap.add_argument("--influx-days", type=int, default=30)
    ap.add_argument("--list", type=int, default=25,
                    help="how many individual events to print for manual review")
    ap.add_argument("--csv", metavar="PATH",
                    help="write every incident to a CSV with a blank classification "
                         "column to fill in (§3.3 step 2)")
    args = ap.parse_args()

    print(f"Stage 2 anomaly evaluation - {datetime.now(config.TIMEZONE):%Y-%m-%d %H:%M %Z}")
    print(f"source: {args.source}")

    raw = (ff.load_postgres() if args.source == "postgres"
           else ff.load_influx("kampot", args.influx_days))
    if raw.empty:
        sys.exit("No data loaded.")

    # Detectors run on RAW readings, not the resampled grid: a frozen sensor or a
    # spike is a property of what the instrument actually emitted, and averaging
    # into 1-minute bins would smooth exactly the evidence being looked for.
    events = an.detect_all(raw)
    summary = an.summarise(events, raw)

    rule("Coverage")
    print(f"  readings analysed : {len(raw):,}")
    print(f"  days              : {summary['n_days']}")
    print(f"  span              : {raw.index.min():%Y-%m-%d} -> {raw.index.max():%Y-%m-%d}")

    rule("Alert rate - the number that decides if this gets muted (§3.3)")
    print(f"  raw events        : {summary['total']:,}   ({summary['per_day']}/day)")
    print(f"  INCIDENTS         : {summary['incidents']:,}   ({summary['incidents_per_day']}/day)"
          "   <- what an operator experiences")
    print(f"  fault incidents   : {summary['fault_incidents_per_day']}/day   <- these page someone")
    verdict = ("sustainable" if (summary["incidents_per_day"] or 0) <= 3
               else "TOO NOISY - operators will mute this")
    print(f"  verdict           : {verdict}")
    print("  Incidents group a burst of related flags into one interruption; the")
    print("  raw count is shown too, so grouping can never hide volume.")

    rule("By detector")
    # Derived from the events themselves rather than a second hardcoded list —
    # a new detector would otherwise be silently mislabelled here.
    fam = {e.detector: e.family for e in events}
    for det, n in sorted(summary["by_detector"].items(), key=lambda kv: -kv[1]):
        per_day = n / summary["n_days"] if summary["n_days"] else 0
        print(f"  {det:<14} {fam[det]:<8} {n:>6,}   {per_day:>6.2f}/day")
    if not summary["by_detector"]:
        print("  (nothing flagged)")

    rule(f"Incidents for manual classification (first {args.list})")
    print("  Classify each: TRUE FAULT / GENUINE EXTREME / FALSE ALARM (§3.3 step 2)\n")
    incidents = an.group_incidents(events)
    by_day = Counter(i["start"][:10] for i in incidents)
    for i in incidents[:args.list]:
        when = i["start"][:19].replace("T", " ")
        burst = f"x{i['count']:<3}" if i["count"] > 1 else "    "
        print(f"  {when}  {i['detector']:<13} {i['field']:<12} {burst} {i['detail']}")
    if len(incidents) > args.list:
        print(f"  ... and {len(incidents) - args.list:,} more (--list N to show more)")

    if by_day:
        rule("Worst days (incidents per day)")
        for day, n in by_day.most_common(5):
            print(f"  {day}  {n:>5,} incidents")

    if args.csv:
        _write_csv(args.csv, an.group_incidents(events))

    rule("Done")
    print("  Precision/recall are NOT reported: there are no labels, and an")
    print("  invented number is worse than an absent one (§3.3).")
    if not args.csv:
        print("\n  To do the classification pass, re-run with:")
        print("    --csv incidents.csv      (one row per incident, ready to fill in)")


def _write_csv(path: str, incidents: list[dict]) -> None:
    """
    One row per incident with an empty `classification` column.

    This is §3.3 step 2 made practical. The classification cannot be automated —
    it needs someone who knows the rig to say whether a flag was a real fault, a
    genuine extreme, or noise — so the job here is to lay the evidence out and
    get out of the way. The `verdict` column is left blank on purpose: a
    pre-filled guess would bias the very judgement the exercise exists to
    collect.
    """
    import csv

    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["start", "end", "detector", "family", "field",
                    "raw_events", "span_min", "detail",
                    "verdict", "notes"])
        for i in incidents:
            w.writerow([
                i["start"][:19].replace("T", " "),
                i["end"][:19].replace("T", " "),
                i["detector"], i["family"], i["field"],
                i["count"], i["span_min"], i["detail"],
                "", "",
            ])

    rule(f"Classification worksheet -> {path}")
    print(f"  {len(incidents)} incidents written, `verdict` column left blank.")
    print("  Fill each row's verdict with one of:")
    print("    TRUE_FAULT       the instrument really was broken")
    print("    GENUINE_EXTREME  the reading was real, just unusual")
    print("    FALSE_ALARM      nothing was wrong; the detector misfired")
    print("  Then send it back and the per-detector hit rate can be computed")
    print("  from YOUR labels — which is the only honest way to get one (§3.3).")


if __name__ == "__main__":
    main()
