"""
Small statistics helpers used by analytics_service.

Implements the two Student-t functions we need (critical value for confidence
intervals, two-sided p-value for the paired test) directly rather than pulling
in SciPy — SciPy is a ~30 MB dependency for what amounts to one distribution,
and this backend already runs as a Windows service on the lab desktop where a
lighter install is worth having.

The implementation is the standard regularised incomplete beta function
(continued-fraction form, Numerical Recipes §6.4). It is exercised against
known textbook values in scripts/verify_stats_core.py — if you change anything
here, re-run that first.
"""
from __future__ import annotations

import math

# ── Regularised incomplete beta function ──────────────────────────────────


def _betacf(a: float, b: float, x: float, max_iter: int = 200, eps: float = 3.0e-12) -> float:
    """Continued-fraction expansion for the incomplete beta function."""
    tiny = 1.0e-30
    qab, qap, qam = a + b, a + 1.0, a - 1.0

    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < tiny:
        d = tiny
    d = 1.0 / d
    h = d

    for m in range(1, max_iter + 1):
        m2 = 2 * m

        # even step
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < tiny:
            d = tiny
        c = 1.0 + aa / c
        if abs(c) < tiny:
            c = tiny
        d = 1.0 / d
        h *= d * c

        # odd step
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < tiny:
            d = tiny
        c = 1.0 + aa / c
        if abs(c) < tiny:
            c = tiny
        d = 1.0 / d
        delta = d * c
        h *= delta

        if abs(delta - 1.0) < eps:
            break

    return h


def betainc(a: float, b: float, x: float) -> float:
    """Regularised incomplete beta function I_x(a, b)."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0

    ln_beta = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
    front = math.exp(ln_beta + a * math.log(x) + b * math.log(1.0 - x))

    # The continued fraction converges quickly only for x < (a+1)/(a+b+2);
    # use the symmetry I_x(a,b) = 1 - I_{1-x}(b,a) otherwise.
    if x < (a + 1.0) / (a + b + 2.0):
        return front * _betacf(a, b, x) / a
    return 1.0 - math.exp(
        math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
        + b * math.log(1.0 - x) + a * math.log(x)
    ) * _betacf(b, a, 1.0 - x) / b


# ── Student-t ─────────────────────────────────────────────────────────────


def t_two_sided_p(t_stat: float, df: float) -> float:
    """
    Two-sided p-value P(|T| >= |t|) for a Student-t with `df` degrees of freedom.

    Uses the identity P(|T| >= t) = I_{df/(df+t^2)}(df/2, 1/2).
    """
    if df <= 0:
        return float("nan")
    t_stat = abs(float(t_stat))
    if t_stat == 0.0:
        return 1.0
    x = df / (df + t_stat * t_stat)
    return betainc(df / 2.0, 0.5, x)


def t_critical(df: float, confidence: float = 0.95) -> float:
    """
    Two-sided critical value t* such that P(-t* < T < t*) = `confidence`.

    Found by bisection on t_two_sided_p, which is monotonically decreasing in t.
    Bisection (rather than a closed-form approximation) keeps this exact to the
    tolerance below and is plenty fast — it runs a handful of times per request,
    not per data point.
    """
    if df <= 0:
        return float("nan")
    target = 1.0 - confidence          # desired two-sided tail area

    lo, hi = 0.0, 1000.0
    for _ in range(200):
        mid = (lo + hi) / 2.0
        if t_two_sided_p(mid, df) > target:
            lo = mid                    # tail still too big -> need larger t
        else:
            hi = mid
        if hi - lo < 1e-10:
            break
    return (lo + hi) / 2.0


def mean_confidence_interval(
    values: list[float] | tuple[float, ...],
    confidence: float = 0.95,
) -> tuple[float, float, float] | None:
    """
    Return (mean, lower, upper) for a `confidence`-level CI on the mean.

    Returns None for n < 2, where the standard error is undefined.
    """
    n = len(values)
    if n < 2:
        return None

    mean = sum(values) / n
    var = sum((v - mean) ** 2 for v in values) / (n - 1)   # sample variance
    se = math.sqrt(var / n)
    margin = t_critical(n - 1, confidence) * se
    return mean, mean - margin, mean + margin
