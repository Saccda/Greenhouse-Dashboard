# Analytics Methodology

Reference for every statistic on the FarmOS Analytics page: what it is, how it
is computed, what it assumes, and what it cannot tell you.

Written to be answerable to two audiences — a farm owner asking *"so what should
I do?"* and a supervisor asking *"how do you know that?"*

- **Computation:** `backend/services/analytics_service.py`
- **Distribution functions:** `backend/services/stats_core.py` (verified by `backend/scripts/verify_stats_core.py`)
- **API:** `GET /api/analytics/summary?farm=<id>&range=<-24h|-7d|-30d|-90d>`
- **Page:** `frontend/src/app/analytics/page.tsx`

---

## 0. The most important caveat: what the sensor actually observed

**The Kampot rig is powered down outside working hours.** Measured over a
representative 7-day window, it recorded readings only between roughly
**08:00 and 16:00** — about **26% of the samples** a continuously-running sensor
would have produced, with **zero data for 16 of every 24 hours**. This matches
the configured shutdown window (`MAINTENANCE_START=16:00`, `MAINTENANCE_END=06:00`).

### Why this governs everything else

Every proportion on the page — time-in-range, exceedance probability, the band
percentages — is a **fraction of observed readings**. Because the observed hours
are the hottest part of the day, those fractions are **conditional on monitored
daytime hours**, and they overstate the equivalent all-day figures.

> Correct: "During monitored hours, temperature was above 32 °C 57% of the time."
> **Incorrect:** "Temperature is above 32 °C 57% of the day."

This is **missing-not-at-random (MNAR)** data: the missingness is driven by time
of day, which is itself the strongest driver of temperature. That means it
**cannot be corrected by reweighting or imputation** — the night-time
distribution is not merely under-sampled, it is entirely unobserved. The only
real fix is to record continuously.

The page states this in a coverage panel *above* the statistics, not in a
footnote, precisely so no figure is read without it.

### Teaching hook
Sampling bias; MNAR vs MCAR vs MAR; why "we have 5,200 data points" says nothing
about representativeness.

---

## 1. Environment Health

### 1.1 Time-in-range

Share of readings falling in each agronomic band.

```
fraction(band) = count(readings in band) / count(all readings)
```

**Bands are operator-set targets, not measured constants.** They live in
`config.ANALYTICS_BANDS` and are the first thing to review with an agronomist.
Current defaults:

| Parameter | Critical | Warning | Optimal | Warning | Critical |
|---|---|---|---|---|---|
| Temperature | < 20 °C | — | 20–30 °C | 30–35 °C | ≥ 35 °C |
| Humidity | < 50% | 50–60% | 60–80% | 80–90% | ≥ 90% |

**Assumption:** counting samples approximates counting time, which holds only
when sampling is regular. Kampot's median interval is ~30 s, so this is
reasonable — but the coverage panel reports the real interval spread so a reader
can judge for themselves.

**Decision it supports:** the single most actionable number for a grower —
"what share of the time is my crop actually in a good place?" A 7-day Kampot
result of **12% optimal / 84% warm / 4% heat stress** says the greenhouse runs
persistently warm rather than occasionally spiking.

### 1.2 Exceedance probability

```
P(X > threshold | monitored hours) = count(readings > threshold) / count(readings)
```

An **empirical (relative-frequency) probability estimate** — no distributional
assumption is made. The threshold defaults to the farm's configured alert
threshold, so this figure answers "how often is the alerting system firing?"

### 1.3 Longest unbroken exceedance spell

Consecutive readings above the threshold are grouped into episodes; the page
reports the count, the mean, and the longest.

**Why it is shown separately from the probability:** thirty two-minute breaches
and one continuous three-hour breach can produce the *identical* probability but
mean completely different things for crop stress. Duration is the physiologically
relevant quantity; frequency alone hides it.

**Gap handling:** an episode is broken whenever the interval between consecutive
readings exceeds `EXCEEDANCE_MAX_GAP_S` (default 300 s). Without this, the
overnight shutdown would be silently reported as one continuous 16-hour heat
episode.

### Teaching hook
Empirical probability; the difference between frequency and duration of an
event; run-length statistics.

---

## 2. Distribution & Variability

### 2.1 Why the mean is not enough

A mean of 32 °C is produced both by a steady 32 °C day and by one swinging
26–37 °C. Those demand different responses. The page therefore reports **both**
summary pairs:

| Pair | Robust to outliers? | Use when |
|---|---|---|
| mean ± SD | No | roughly symmetric, no extremes |
| median + IQR | Yes | skewed, or outliers present |

When they disagree, the distribution is skewed — and the median is the safer
summary. The page says so explicitly when `|skew| > 0.3`.

### 2.2 Percentiles

p05 / p25 / median / p75 / p95, by linear interpolation (the standard NumPy
convention). p95 is often the operationally interesting one: *"on the worst 5%
of readings, how bad does it get?"*

### 2.3 Histogram binning

Bin width by the **Freedman–Diaconis rule**:

```
width = 2 · IQR / n^(1/3)
```

Chosen over a fixed bin count because it adapts to both spread and sample size,
and because it is driven by the **IQR** — so a handful of extreme readings cannot
distort the binning. Falls back to **Sturges' rule** (`⌈log₂ n⌉ + 1`) when the
IQR is zero, which FD cannot handle.

### 2.4 Skewness

Fisher–Pearson sample skewness (third standardised moment). Positive means a
long right tail — occasional high spikes stretching further than the lows.

### Teaching hook
Robust vs non-robust statistics; why binning choice changes the story a histogram
tells; moments of a distribution.

---

## 3. Daily Pattern (diurnal profile)

Mean value for each hour of the day, with a 95% confidence interval.

### The key statistical decision — read this one carefully

Readings 30 seconds apart are **strongly autocorrelated**: consecutive values are
nearly identical, so they carry far less information than the same number of
independent observations would.

Pooling all raw readings for an hour and computing `s/√n` would treat ~120
near-duplicate readings as 120 independent facts. Measured on real Kampot data
for the 14:00 hour:

| Method | n | 95% CI | Width |
|---|---|---|---|
| Naive (pool raw readings) | 821 | (32.76, 33.00) | **0.24 °C** |
| Day-level (what we use) | 7 days | (31.41, 34.30) | **2.89 °C** |

**The naive interval is ~12× too narrow** — it would have implied the hourly mean
is known to within a quarter of a degree, when day-to-day variation is actually
several degrees.

**What we do instead:** collapse to one mean per `(calendar day, hour)` first,
then compute the interval **across days**. The independent sampling unit becomes
the *day*, so `n` is the number of days observed for that hour — typically single
digits. The resulting interval answers the question actually being asked:
*"how much does this hour vary from one day to the next?"*

Hours with fewer than 2 days of data get a mean but no interval — a single day
provides no basis for estimating between-day variability. Unobserved hours are
**omitted, never interpolated**: drawing a line through the overnight shutdown
would invent readings that were never taken.

### Decision it supports
Identifies the problem window. Kampot peaks at **14:00** — which is when
intervention (shading, spraying, ventilation) has to be scheduled to matter.

### Teaching hook
Autocorrelation and effective sample size; the Central Limit Theorem and standard
error; why the choice of sampling unit *is* the statistical model.

---

## 4. System Effectiveness (spray impact)

### 4.1 Design

For each detected spray event:

- **Before** = mean of readings in the 10 minutes immediately preceding the start
- **After** = mean of readings in the 10 minutes immediately following the end
- **Difference** = after − before

Analysed as **paired differences** with a paired *t*-test and a 95% confidence
interval on the mean difference.

**Why paired rather than two independent groups:** each event supplies its own
baseline, which removes between-event variation from time of day, weather and
season. Pairing is what makes a handful of events analysable at all.

**Events are skipped** when either window has fewer than 3 readings — most often
because the event sits at the edge of the monitored window (a 15:55 spray has no
16:05 "after" data once the rig powers down). The skipped count is reported.

### 4.2 Reported quantities

| Quantity | Meaning |
|---|---|
| Mean difference | average change in °C, after vs before |
| 95% CI | range of plausible true mean changes |
| p-value | two-sided paired *t*-test |
| Cohen's *d* | effect size in SD units — guards against "significant but trivial" |
| **Resolution** (CI half-width) | **the smallest effect this sample size could have detected** |

### 4.3 The distinction the page protects

The backend returns an explicit **verdict** rather than letting the UI infer one,
because the most common misreading in applied statistics is exactly this:

> A wide confidence interval that straddles zero means **"we could not detect an
> effect."** It does **not** mean **"there is no effect."**

With Kampot's 30-day data (**3 usable spray events**), the result is
mean **+0.04 °C**, 95% CI **(−1.46, +1.54)**, *p* = 0.92. The verdict returned is
**`underpowered`**, phrased as: *"With 3 events this analysis could only have
detected a change larger than about 1.50 °C. A null result here reflects the
small sample, not evidence that spraying has no effect."*

Below 5 usable events the page refuses to report a conclusion at all.

### 4.4 Confounds — why this is association, not causation

Displayed on screen alongside the result, not hidden in a tooltip:

1. **Regression to the mean.** Sprays fire *because* it is hot. Temperature would
   tend to fall afterwards even if spraying did nothing.
2. **Diurnal confounding.** Afternoon sprays are followed by natural evening
   cooling, which this design cannot separate from the spray's own effect.
3. **No control periods.** This is observational data. Establishing causation
   would need matched unsprayed control periods at comparable times of day, or
   randomised spray timing.

**To strengthen this into a causal claim** (a natural next research step):
compare each spray against matched non-spray periods at the same hour and similar
starting temperature, or randomise spray timing within a safe operating band.

### 4.5 Water cost of cooling

```
litres per °C = total estimated litres / mean cooling (°C)
```

Returns *no figure* when the fogger spec is unconfigured, when fewer than 2 usable
events exist, or when no net cooling was measured — dividing by a null or warming
effect would manufacture a meaningless number.

### Teaching hook
Paired vs independent designs; statistical power and minimum detectable effect;
effect size vs significance; confounding and why observational data limits causal
claims.

---

## 5. What this sets up for the ML phase

The predictive work discussed for a later phase builds directly on these
foundations rather than replacing them:

| Built here | Becomes |
|---|---|
| Exceedance probability | Forecast exceedance probability ("70% chance of breaching 32 °C in the next hour") |
| Diurnal profile + CI | Seasonal-naive **baseline forecast** — the benchmark any ML model must beat |
| Distribution + control limits | Anomaly / sensor-fault detection |
| Spray paired analysis | Target variable for a spray-optimisation model |
| Coverage analysis | Data-quality gate — determines whether a model is trainable at all |

**The baseline matters most.** Without a documented naive benchmark, no ML model
can be shown to add value — which is precisely the claim a research write-up must
support.

---

## 6. Known limitations

1. **Coverage is the binding constraint.** ~26% coverage, daytime only. No
   statistic here describes night-time conditions.
2. **Bands are assumptions.** `ANALYTICS_BANDS` are operator-set, not derived from
   this farm's agronomy. Review before publication.
3. **Spray analysis is underpowered** at current event counts and is observational
   regardless of sample size.
4. **Proportions are sample fractions**, equal to time fractions only under
   regular sampling.
5. **Campus has almost no history yet** — these analyses need days-to-weeks of
   data before they say anything. They were built and validated against Kampot for
   that reason, and apply to any farm unchanged.

---

## 7. Reproducing / verifying

```bash
cd backend
python scripts/verify_stats_core.py      # t-distribution vs textbook values
```

The t-distribution is implemented by hand (regularised incomplete beta,
continued-fraction form) rather than via SciPy, to avoid a ~30 MB dependency for
one distribution on a Windows-service deployment. It is checked against standard
t-tables (df = 1…120) and against R's `pt()` — all agree to 3+ decimal places.
**Re-run that script after touching `stats_core.py`.**
