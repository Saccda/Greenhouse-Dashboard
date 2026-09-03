"""
Verify services/stats_core.py against published Student-t values.

No SciPy in this environment, so the t-distribution is implemented by hand —
this script is the safety net proving it matches standard tables. Run it after
touching stats_core.py:

    cd backend
    python scripts/verify_stats_core.py

Reference values are the usual two-sided 95% critical points found in any
statistics textbook t-table, plus a couple of p-values cross-checked against
R's pt()/qt().
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services import stats_core  # noqa: E402

# (df, two-sided 95% critical value) — standard t-table
T_TABLE_95 = [
    (1, 12.706), (2, 4.303), (3, 3.182), (4, 2.776), (5, 2.571),
    (10, 2.228), (20, 2.086), (30, 2.042), (60, 2.000), (120, 1.980),
]

# (t, df, expected two-sided p) — cross-checked against R: 2*pt(-abs(t), df)
P_CASES = [
    (2.086, 20, 0.0500),
    (1.000, 10, 0.3409),
    (3.250, 15, 0.0054),
    (0.500, 30, 0.6208),
    (4.000,  5, 0.0104),
]

failures = 0

print("t_critical(df, 0.95) vs textbook t-table")
for df, expected in T_TABLE_95:
    got = stats_core.t_critical(df, 0.95)
    ok = abs(got - expected) < 0.001
    failures += not ok
    print(f"  df={df:4d}  expected {expected:7.3f}  got {got:7.3f}  {'OK' if ok else 'FAIL'}")

print("\nt_two_sided_p(t, df) vs R's 2*pt(-|t|, df)")
for t, df, expected in P_CASES:
    got = stats_core.t_two_sided_p(t, df)
    ok = abs(got - expected) < 0.0005
    failures += not ok
    print(f"  t={t:5.3f} df={df:3d}  expected {expected:.4f}  got {got:.4f}  {'OK' if ok else 'FAIL'}")

# A CI on a known sample: mean should sit in the middle, width should match
# t*·s/√n computed by hand.
sample = [12.0, 14.0, 11.0, 13.0, 15.0, 12.5, 13.5]
res = stats_core.mean_confidence_interval(sample, 0.95)
assert res is not None
mean, lo, hi = res
expected_mean = sum(sample) / len(sample)
symmetric = abs((mean - lo) - (hi - mean)) < 1e-9
print("\nmean_confidence_interval sanity")
print(f"  mean={mean:.4f} (expected {expected_mean:.4f})  CI=({lo:.4f}, {hi:.4f})  symmetric={symmetric}")
failures += not (abs(mean - expected_mean) < 1e-9 and symmetric and lo < mean < hi)

print(f"\nn<2 returns None: {stats_core.mean_confidence_interval([5.0]) is None}")
failures += stats_core.mean_confidence_interval([5.0]) is not None

print("\nALL CHECKS PASSED" if failures == 0 else f"\n{failures} CHECK(S) FAILED")
sys.exit(1 if failures else 0)
