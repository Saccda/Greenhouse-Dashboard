# Machine Learning Methodology

Design document for the predictive phase of FarmOS. Written before the code, so
that the modelling decisions can be reviewed — and challenged — on their merits
rather than reverse-engineered from an implementation.

Same two audiences as `ANALYTICS_METHODOLOGY.md`: a farm owner asking *"what will
this actually do for me?"* and a supervisor asking *"how do you know it works?"*

Companion document: **`ANALYTICS_METHODOLOGY.md`**. That one describes the
descriptive statistics already shipped. This one describes what is built on top.
Section 5 there ("What this sets up for the ML phase") is the hand-off point.

**Status: design approved, not yet implemented.** Nothing in this document is
running in production. Sections marked 🔒 are gated on data that does not exist
yet.

---

## 0. Data audit — what we actually have

Audited against the **Postgres archive on the lab desktop, 2026-09-19**
(`iot_data.environment`) — the real training corpus, not the rolling ~30-day
Influx window an earlier draft was limited to. Reproduce with
`scripts/audit_data.py --source postgres --table environment`.

### 0.1 Volume

| Farm | Source | Days | Rows | Verdict |
|---|---|---|---|---|
| **Kampot** | Postgres archive | **115** | 115,244 | Trainable |
| Kep | — | — | — | Never wired to Postgres; no archive |
| Campus | Postgres (new) | 0 so far | — | Archiving only since 2026-09-19; months away |

Kampot spans **2026-05-04 → 2026-09-19**, with 83% of calendar days present. At a
median 30 s cadence the independent unit is the day, not the row (§1.4), so the
effective sample size is **~115 day-blocks** — four times the 29 the Influx window
implied. That is the number that moves ridge, and possibly gradient boosting,
from aspirational to viable (§1.1).

### 0.2 The monitored window — the single most important fact

Kampot's readings, by hour of day, across all 115 days:

```
hour 00–07  :        0 rows      0/115 days
hour 08     :    2,988 rows    112/115 days
hour 09     :   13,090 rows    112/115 days
hour 10–14  : ~13k–20k/hr      101–109/115 days
hour 15     :    9,115 rows     94/115 days
hour 16     :    1,464 rows     94/115 days
hour 17–23  :        0 rows      0/115 days
```

**Fifteen of twenty-four hours have never been observed — not on one single day
out of 115.**

This is a **deliberate operational decision, not a data-collection failure.** The
rig is powered down outside working hours to save energy, on the reasoning that
temperature has already fallen by evening and there is nothing the cooling and
spray system needs to act on overnight.

**That reasoning is supported by the farm's own data.** Temperature peaks at
14:00 (mean 33.1 °C) and is already falling when recording stops:

| Hour | Temp (mean ± sd) | Humidity (mean ± sd) |
|---|---|---|
| 14:00 | 33.1 ± 3.0 °C | 70.3 ± 10.1 % |
| 15:00 | 31.7 ± 2.4 °C | 74.0 ± 9.1 % |
| 16:00 | 30.9 ± 2.2 °C | 75.4 ± 8.9 % |

Fitted per day over 14:00–16:00, temperature falls at a median **−0.61 °C/h**
(falling on 17 of 28 days). For the heat-control objective the system was built
to serve, shutting down at 16:00 forfeits little.

> **Consequence for this phase:** a longer archive increases the number of
> *days*, which is genuinely valuable (see §0.4). It does **not** fill the night
> gap. If the rig has always run on this schedule, then a two-year archive has
> exactly as much night-time data as a two-week one: none.
>
> Note this is a statement about **what can be claimed**, not a criticism of the
> schedule. Every proportion the dashboard reports is conditional on monitored
> hours, and must be worded that way, regardless of how sensible the reason for
> the window is.

### 0.2.1 Where the energy-saving argument does not transfer: humidity

The argument "temperature has already dropped, so there is nothing to record"
is sound for **temperature**. It does not carry over to **humidity**, and the
distinction matters because the two move in opposite directions.

As air cools at constant water content, relative humidity **rises mechanically**.
So the falling temperature that justifies the shutdown is the same process that
drives humidity upward through the unobserved hours. The farm's own data shows
humidity already climbing at the cutoff — median **+0.29 %/h** over 14:00–16:00 —
from a base that is not low:

```
At 16:00, humidity  mean 75.4 %   max 99.1 %
  readings already >= 85 %  : 11 %
  readings already >= 90 %  :  7 %
  readings already >= 95 %  :  5 %
```

The rise is modest and only on 15 of 28 days, so this is a **flag, not a finding**:
it says the night-time humidity regime is unknown and plausibly high, not that it
is harmful. Prolonged high overnight humidity is a recognised driver of fungal
disease in pepper, but confirming whether that risk is material here is an
**agronomy question, not a statistics one**, and should be put to an agronomist
before any hardware change is considered.

Recorded here because it is the one argument for night-time data that the
energy-saving rationale does not already answer.

### 0.3 The config does not match the field

`backend/config.py` declares `MAINTENANCE_END=06:00`, but **no data has ever
arrived before 08:00** — on any of the 115 days.

Since the schedule is set deliberately (§0.2), the likely explanation is simply
that the config value is stale and 08:00 is the real switch-on time. Worth
correcting either way, because `MAINTENANCE_START/END` is what the alerting logic
uses to decide whether silence is expected or a fault: a two-hour window where
the system believes it should be receiving data and is not.

### 0.4 The recording window never changed — resolved against the archive

The previous draft flagged this as the open question: the Influx figures came
from a rolling ~30-day window, and an earlier continuously-recording period —
if one existed — would be the only night-time evidence obtainable without a
hardware change. The Postgres audit settles it. Month by month:

| Month | earliest hr | latest hr | hours seen | days |
|---|---|---|---|---|
| 2026-05 | 8 | 16 | 9 | 21 |
| 2026-06 | 8 | 16 | 9 | 14 |
| 2026-07 | 8 | 16 | 9 | 31 |
| 2026-08 | 8 | 16 | 9 | 31 |
| 2026-09 | 8 | 16 | 9 | 18 |

**Every month is identical: 08:00–16:00, nine hours.** There is no earlier
continuous period hiding in the archive. The night gap is not an artefact of the
short Influx window — it is the entire five-month record. §1.2 (no overnight
forecasting) now rests on 115 days rather than 29.

What the archive *does* add is days, exactly where they help: the independent
sample size quadruples, and the daytime hours 09–14 each have 100+ days behind
them.

### 0.4.1 The cadence is not stationary (but there are no duplicates)

`rows per day` has a median of 753 and a **maximum of 13,191** — roughly 17×. The
first suspicion was duplicate rows, but the audit reports **zero duplicate
timestamps**: every row is a distinct instant. The heavy days are the tell —
2026-05-27 (13,191), 2026-05-24 (7,193), 2026-05-25 (5,057) — all in the first
weeks of the deployment. The logger began at a ~2-second cadence and was later
relaxed to the steady ~30 seconds seen since.

So this is a **cadence change, not corruption**, and the fix is not
de-duplication (there is nothing to remove) but **resampling to a uniform time
grid** before any feature is built. Two reasons it is mandatory rather than
cosmetic:

1. **Evidence weighting.** Trained on raw rows, 2026-05-27 would contribute 13,191
   samples against a normal day's ~750 — 17× the weight for one day of weather, in
   direct violation of the day-as-unit principle (§1.4). Resampling to a fixed
   grid makes every day contribute comparably.
2. **Well-defined lag features.** The §2.2 features are defined in *time*
   (t−5 min, t−10 min, …), not in *rows*. On a uniform grid "the reading 5 minutes
   ago" is unambiguous; on raw irregular data it is not.

The loader resamples each day to a fixed grid (1-minute) and never bridges the
overnight shutdown gap between days. This closes the item: no rows are discarded
as bad, the record is simply put on an even footing before modelling.

---

## 1. What is ruled out, and why

State these before a reviewer raises them.

### 1.1 No deep learning (LSTM, GRU, Transformer)

These architectures need thousands of complete daily cycles to identify seasonal
structure. At 115 — or even a few hundred — *partial* days, the parameter count
exceeds anything the data can constrain. The model would memorise the training
days and the held-out error would say so.

This is a statement about sample size, not about the merits of the architecture.

### 1.2 No overnight or 24-hour forecasting

The model has never seen 17:00–08:00. Predicting that region is not
interpolation, it is **extrapolation into a domain with zero support**.

This holds regardless of *why* the window exists. The shutdown is a considered
decision (§0.2) and a reasonable one, but a model cannot learn a regime it has
never seen, and a model that emits a confident night-time number is worse than no
model, because it will be trusted.

**Design rule enforced in code (§2.5): the service refuses to forecast past the
shutdown boundary.**

### 1.3 Daily aggregates are daytime aggregates

"Daily maximum temperature" here means "maximum during monitored hours". For
maximum temperature this is probably close to the true daily max — the hottest
part of the day is inside the window. For daily *mean*, *minimum*, or *range* it
is badly biased. Label these accordingly in any output.

### 1.4 The effective sample size is the number of days, not the number of rows

The measured sampling cadence is a **median of 30 seconds** (p90 60 s). Readings
that close are almost perfectly correlated: 115,244 rows do not provide 115,244
independent observations. The independent experimental unit is the **day**, of
which there are 115.

This single point invalidates most naive applications of ML to this dataset, and
it is the most defensible thing in this document. It drives the validation
scheme in §4 — and it is why "we have 115,244 data points" is a statement about
storage, not about evidence: ~115 independent days.

### 1.5 🔒 Spray effectiveness modelling stays blocked

Still n = 3 spray events. Unchanged from `ANALYTICS_METHODOLOGY.md` §4. No model,
no matter how sophisticated, extracts a treatment effect from three observations.

---

## 2. Stage 1 — Short-horizon temperature forecast

**The claim:** *"Temperature will reach 35 °C in approximately 25 minutes."*

**The value:** the current system reacts after a threshold is crossed. A forecast
lets it act before, which is the difference between preventing heat stress and
recording it.

### 2.1 Scope

| | |
|---|---|
| Target | Temperature at t + h |
| Horizons | h ∈ {15, 30, 60} minutes |
| Domain | Monitored window only (§2.5) |
| Farm | Kampot (the only farm with sufficient data) |

Humidity is a secondary target using the identical pipeline, fitted separately.

### 2.2 Features

All computed **strictly from information available at time t**. Nothing derived
from a window that extends past t, and no aggregate computed over the full
dataset before splitting (see §4.3).

| Group | Features |
|---|---|
| Level | temp at t; temp at t−5, t−10, t−20, t−30 min |
| Rate | Δtemp over 5, 15, 30 min |
| Humidity | humidity at t; Δhumidity over 15 min |
| Actuator | relay1 (cooling) state; relay3 (spray) state; minutes since last spray |
| Clock | minutes since 08:00 (position within the monitored window) |

Notes on two of these:

**Actuator state matters and makes the model partly a control model.** If the
spray pump ran three minutes ago, the next reading is not drawn from the same
distribution. Excluding it would push that variance into the residuals.

**Clock feature is "minutes since window open", not "hour of day".** Only ~9
distinct hours are ever observed, so hour-of-day is a near-constant with no
support outside the window — an encoding that invites the model to extrapolate
exactly where §1.2 forbids it.

Deliberately excluded: day-of-year and any seasonal term. The archive spans one
May–September stretch (§0.4), not a full year, so there is no seasonal *cycle* to
fit — only a within-season trend the model would happily overfit. Revisit only
if the record ever covers multiple years.

### 2.3 Models, in the order they will be fitted

Fit in this order. Each must justify itself against the one before.

1. **Persistence** — ŷ(t+h) = y(t). The honest baseline. On a 15-minute horizon
   this is *hard to beat*, and pretending otherwise is the most common failure
   in applied forecasting write-ups.
2. **Diurnal climatology** — the hour-of-day profile already computed in
   `ANALYTICS_METHODOLOGY.md` §3. Encodes "what usually happens at this time".
3. **Ridge regression** on the §2.2 features. Linear, interpretable, coefficients
   inspectable; regularisation handles the collinearity the lag features
   guarantee.
4. **Gradient boosting** (`HistGradientBoostingRegressor`) — only if ridge beats
   the baselines.

**If gradient boosting does not clearly beat ridge, ship ridge.** A model whose
coefficients can be read aloud in a supervision meeting is worth more than a
marginal MAE improvement that cannot be explained to a farm owner.

### 2.4 Prediction intervals

A point forecast without an interval invites false confidence. Intervals come
from the **empirical distribution of held-out residuals per horizon** — the
quantiles the model actually achieved on days it never saw — rather than from a
Gaussian assumption the residuals are unlikely to satisfy.

Validation: the 80% interval should contain the truth about 80% of the time. If
realised coverage is 60%, the interval is decoration and must not ship.

### 2.5 The shutdown-boundary rule

A forecast issued at 15:45 for h = 60 min lands at 16:45 — inside the shutdown
window, a region with no training support and no way to ever verify the
prediction.

**The service returns `null` with an explicit reason rather than a number.** The
UI must render that as "not available — outside monitored hours", never as a
blank or a zero.

This rule is the operational expression of §1.2, and it is the part most likely
to be quietly dropped under pressure to make the card look complete. It should
not be.

### 2.6 Result on the 115-day archive

Validated on 2026-09-19 against the full Postgres archive (115 days, ~93 held-out
days per horizon under rolling-origin CV). Reproduce with
`scripts/validate_forecast.py --source postgres`.

| Horizon | Persistence MAE | Ridge MAE | Skill | Paired-test p | HGB skill |
|---|---|---|---|---|---|
| 15 min | **0.782 °C** | 0.782 | −0.000 | 0.9996 | −0.007 |
| 30 min | **1.113 °C** | 1.102 | +0.010 | 0.557 | −0.018 |
| 60 min | **1.536 °C** | 1.489 | +0.031 | 0.111 | +0.006 |

Realised 80% interval coverage: **80.4% / 79.6% / 79.5%** — calibrated to nominal
at every horizon. Worst single held-out day vs the median day: 2.3× (15 min),
2.2× (30 min), 3.0× (60 min).

**Against the §4.6 acceptance criteria, the point-forecast model does not ship:**

| Criterion | 15 min | 30 min | 60 min |
|---|---|---|---|
| 1. Skill > 0 | ✗ | ✓ | ✓ |
| 2. Paired test p < 0.05 | ✗ | ✗ | ✗ |
| 3. Coverage 70–90% | ✓ | ✓ | ✓ |
| 4. No day > 3× median MAE | ✓ | ✓ | ✓ |

Criterion 2 fails at every horizon. Ridge edges ahead at 60 min (+3.1%,
p = 0.11) but not significantly, and gradient boosting never beats ridge — so
even relaxing the bar would ship ridge, not HGB (§2.3). **This is the
pre-registered "no significant improvement" outcome (§4.5), and it is reported
as a finding, not hidden.** Persistence is genuinely hard to beat at these
horizons, exactly as §2.3 anticipated.

**What ships is not nothing.** Criteria 3 and 4 pass cleanly: the prediction
interval is sound. So Stage 1 ships as **persistence point forecast + the
validated 80% interval** — "it is 32.4 °C now; within an hour, an 80% chance it
stays within about ±2 °C". The interval is the advance warning the threshold
system cannot give, and it is honest because its coverage was measured on days
the method never saw. The point-forecast *model* is shelved, to be revisited
only if a future data regime (a wider window, a second season) changes the
picture.

---

## 3. Stage 2 — Sensor health and anomaly detection

Cheap, because it reuses Stage 1's residuals, and immediately useful: **the
campus MQTT bridge failed for days in September 2026 and was noticed by a human
looking at a card.** That is the class of failure this stage catches.

### 3.1 Detectors

| Detector | Rule | Catches |
|---|---|---|
| Dead feed | No reading for > `DATA_STALE_MINUTES` | Bridge down, ESP32 offline, network loss |
| Flatline | Identical value held for > 30 min, away from the sensor's limits | Stuck sensor, frozen cache |
| Saturated | Identical value held at a physical limit | Instrument at its ceiling — censored, not faulty |
| Out of range | Outside physical bounds (temp 0–60 °C, humidity 0–100%) | Wiring fault, unit error, parse bug |
| Jump | \|Δ\| > k · MAD(Δ) | Spike, dropout, transient |
| Residual | \|y − ŷ\| > k · MAD(residuals) | Genuinely unusual conditions |

### 3.1.1 Saturation is not a fault — a correction from the field

The first implementation treated any long flatline as a fault, and flagged three
of them on Kampot: humidity pinned at exactly 100 for 72, 105 and 108 minutes.
The farm's reading was that these were heavy rain, and the data agrees
decisively. In all three episodes humidity ramps smoothly to the ceiling
beforehand (95.2 → 100, 83.0 → 100, 85.9 → 100), recovers smoothly after, and
temperature falls 4.6–4.8 °C alongside. The maximum humidity ever recorded is
exactly 100.0 and never higher.

So the instrument is working. It simply cannot report above its ceiling, which
makes the reading **right-censored**: we know RH ≥ 100, not what it actually
was. Three consequences:

1. **It is not a fault.** Paging someone for rain is precisely how an alert
   channel gets muted (§3.3). These now raise a separate `saturated` detector in
   the *unusual* family. Kampot's fault rate falls from 0.29/day to 0.04/day —
   the remaining one being a genuine 73-minute dead feed.
2. **It is still worth surfacing**, because censored readings are not ordinary
   ones, and something downstream has to know.
3. **It biases any mean or variance of humidity** computed over those windows,
   which is a live concern for `ANALYTICS_METHODOLOGY.md` — 329 of 18,640
   Kampot humidity readings sit at exactly 100. Time-in-range is unaffected
   (100 falls in the high band either way); a mean is not.

Recorded because it is the clearest example in this project of domain knowledge
beating a detector: no amount of statistics would have distinguished "sensor
stuck" from "raining hard" without someone who knows the season.

### 3.2 Why MAD and not standard deviation

A stuck sensor or a spike **inflates the standard deviation**, which widens the
threshold, which makes the anomaly less likely to be flagged. The statistic used
to find outliers must not be one that outliers can move.

Median absolute deviation has a breakdown point of 50%: up to half the data can
be arbitrarily corrupted before the estimate is affected. Scaled by 1.4826 it
estimates σ for Gaussian data, so thresholds stay interpretable.

### 3.3 Honest evaluation

**There are no labels.** Nobody has annotated which historical readings were
faulty, so precision and recall cannot be computed, and any figure claiming them
would be invented.

What will be done instead, and reported as such:

1. Run the detectors over the full history.
2. Manually review every flagged event and classify it: true fault / genuine
   extreme / false alarm.
3. Report counts and the **alert rate per day** — the number that decides whether
   operators keep paying attention or start ignoring it.

An alarm that fires ten times a day will be muted within a week, and a muted
alarm has negative value: it produces the appearance of monitoring without the
substance.

---

## 4. Validation protocol

The most important section. Everything else is implementation detail.

### 4.1 Rolling-origin cross-validation, blocked by day

```
train: days 1..k        test: day k+1
train: days 1..k+1      test: day k+2
...
```

Never `KFold(shuffle=True)`. Never `train_test_split(random_state=42)`.

### 4.2 Why a random split would be fraud

With a random split, the reading at 10:00:00 goes into training and the reading
at 10:00:30 goes into test. At a 30-second cadence they are very nearly the same
number. The model is being tested on data it has effectively already seen.

The reported MAE would be excellent and entirely meaningless. **This is the single
easiest way to produce an impressive-looking and completely worthless result**,
and it is common enough in published IoT-agriculture papers to be worth calling
out explicitly in the write-up.

Blocking by day forces the test to answer the question that actually matters:
*given everything up to yesterday, how well do we do on a day we have never
seen?*

### 4.3 Leakage rules

- Scalers, imputers and any fitted transform are fitted **inside** each training
  fold, never on the full dataset.
- No feature may use a window extending past t.
- The diurnal climatology baseline is recomputed per fold from training days only.
- Hyperparameters are selected on a validation split **within** the training
  block, never on the test day.

### 4.4 Metrics

| Metric | Why |
|---|---|
| MAE | Primary. Same units as the target; a farm owner can read it directly. |
| RMSE | Secondary. Penalises the large errors that matter operationally. |
| **Skill score** | `1 − MSE_model / MSE_baseline`. > 0 beats baseline, ≤ 0 does not. |
| Interval coverage | Realised vs nominal (§2.4). |
| Per-day MAE spread | A mean MAE hides a model that fails on the hot days. |

### 4.5 The significance test

Report the **distribution of per-day MAE**, not just its mean, and compare model
against baseline with a **paired test across held-out days** — paired because the
same day is scored by both, so day-to-day difficulty cancels.

n = number of held-out days accumulated across the walk-forward folds (§4.1) —
on the order of 100 now that the archive holds 115 days (§0.4), up from the ~29
the Influx window implied. The existing
`backend/services/stats_core.py` already implements the paired t-test and
Cohen's d used for the spray analysis; this reuses it directly.

At n on the order of 100 the paired test has reasonable power for a moderate
effect, not only a large one — a real gain over the ~29-day picture, though still
not enough to call a *small* effect reliably. If the result is "no significant
improvement", **that is a finding and it
gets reported** — it means persistence is the right production choice for this
horizon, which is useful engineering knowledge and an honest research result.

### 4.6 Acceptance criteria — decided now, before seeing results

Ship only if **all** hold:

1. Skill score > 0 against persistence, at the horizon being shipped.
2. Paired test across held-out days significant at α = 0.05.
3. 80% interval realised coverage within 70–90%.
4. No single held-out day with MAE > 3× the median day's MAE.

Fixing these in advance is what stops the analysis from drifting toward whatever
the results happen to support.

**If Stage 1 fails these criteria, it does not ship.** The fallback is the
threshold alerting already in production, which works.

**Outcome (2026-09-19, §2.6):** the point-forecast model failed criterion 2 at
every horizon — no significant improvement over persistence. It does not ship.
Criteria 3 and 4 passed, so the calibrated interval *does* ship, wrapped around a
persistence forecast. The criteria did their job: they turned a negative result
into a clear, defensible decision instead of a search for a metric that would
have made the model look good.

---

## 5. Deployment

### 5.1 Where it runs

Training is **offline** on the lab desktop against Postgres. Inference is a
loaded model artifact in the FastAPI backend. Nothing trains inside a request.

**Postgres is never exposed to the internet, and does not need to be:**

```
LAB DESKTOP  (private - nothing here faces the internet)
├── Postgres            localhost:5432   <- stays firewalled
├── GreenhouseBackend   (FastAPI, NSSM)  <- reads Postgres over localhost
│     ├── trains offline, writes the model artifact to disk
│     └── serves /api/ml/forecast from the loaded artifact
└── cloudflared tunnel ─────> internet ─────> Vercel frontend
                              (only the HTTP API crosses)
```

Both the training job and the inference service run *on* the same machine as the
database, so the connection is a loopback one. The only thing that crosses the
tunnel is forecast JSON over the API that is already published. Opening port 5432
would add attack surface — it is among the most heavily scanned ports on the
internet — and buy nothing.

The practical consequence is that **the audit and training scripts run on the lab
desktop, not on a laptop.** `scripts/audit_data.py --source influx` exists so that
development and code review can happen off-machine against the 30-day cloud
window; it is not a substitute for auditing the archive.

| Component | Location |
|---|---|
| Training script | `backend/scripts/train_forecast.py` |
| Model artifact | `backend/data/models/forecast_<farm>_<horizon>.pkl` |
| Inference service | `backend/services/forecast_service.py` |
| API | `GET /api/ml/forecast?farm=<id>&horizon=<15\|30\|60>` |
| Retraining | APScheduler, nightly, alongside the existing jobs |

### 5.2 Version skew — a known hazard in this deployment

The frontend deploys to Vercel instantly; the backend is a manually-updated NSSM
service on the lab desktop. **The two are routinely out of step**, and this has
already caused one production crash when the UI read a field the deployed backend
did not yet return.

Therefore: every new field the forecast API introduces is **optional** in the
TypeScript types, so the compiler forces a fallback at each use site. This is not
defensive style — it is the specific fix that caught two unguarded reads during
the Analytics build.

### 5.3 What the UI shows

A forecast card must display, together and with equal weight:
the point estimate; the interval; the horizon; and **the model's own
held-out MAE**.

A prediction shown without its error bar will be read as fact.

---

## 6. Roadmap and data gates

| Stage | Needs | Status |
|---|---|---|
| 1. Short-horizon forecast | ~30 days, daytime only | **Ready now** |
| 2. Anomaly detection | Same data as Stage 1 | **Ready now** |
| 3. 🔒 Day-level modelling | Months of days | Gated on §0.4 |
| 4. 🔒 Spray optimisation | Tens of spray events | Gated: n = 3 |
| 5. 🔒 Cross-farm transfer | Campus/Kep streaming reliably | Gated: campus bridge |
| 6. 🔒 Night-time forecasting | Continuous recording | **Gated on an operating decision** — see below |

Stage 6 is listed to make the point that it is an *operating* decision, not a
modelling one. No amount of data or technique substitutes: if overnight
prediction is a research objective, the rig has to run overnight.

The farm has already weighed this and chosen energy saving over night-time data
(§0.2), and for the heat-control objective that is the right call. The only
consideration that decision did not price in is humidity (§0.2.1). If an
agronomist judges the overnight humidity regime to matter for this crop, the
trade-off is worth revisiting — and a cheap intermediate exists: record overnight
for a few weeks in one season purely to characterise the regime, without
committing to running continuously. A short campaign would settle empirically
what is currently an assumption, at a fraction of the energy cost.

---

## 7. Teaching hooks

Mapped to Applied Statistics topics. The value here is that these are not
textbook hypotheticals — in this dataset each one changes the answer.

| Concept | Where it bites |
|---|---|
| Baselines | Persistence beats most ML at short horizons (§2.3) |
| Autocorrelation | Effective n is ~115 days, not 115,244 rows (§1.4) |
| Data leakage | Random split gives a great, worthless MAE (§4.2) |
| MNAR missingness | 15 unobserved hours cannot be imputed (§0.2) |
| Extrapolation | Why night-time prediction is refused (§1.2) |
| Robust statistics | MAD vs SD when outliers are the target (§3.2) |
| Paired testing | Same day scored by both models (§4.5) |
| Power | n ~ 100 held-out days; moderate effects detectable (§4.5) |
| Interval calibration | 80% must mean 80% (§2.4) |
| Pre-registration | Acceptance criteria fixed in advance (§4.6) |

A good exercise: give students the random-split result and the blocked-CV result
for the same model and ask which to believe, and why the better-looking number is
the wrong one.

---

## 8. Known limitations

1. **Coverage is the binding constraint**, as in the analytics phase. No model
   here describes night-time conditions, and none can.
2. **One farm.** Everything is fitted to Kampot. Generalisation to Kep or campus
   is an assumption until tested, and neither currently streams reliably enough
   to test it.
3. **Short archive in the cloud.** Influx holds ~30 days; conclusions from it are
   provisional until re-run against Postgres (§0.4).
4. **No anomaly labels.** §3.3 reports reviewed counts, not precision/recall.
5. **Observational throughout.** The model learns association. It cannot
   establish that spraying *caused* a temperature drop — same limitation as
   `ANALYTICS_METHODOLOGY.md` §4.4.
6. **Weather is unobserved.** No rainfall, solar radiation or outside temperature.
   A large share of the residual variance is almost certainly explained by
   variables we do not measure. Adding an outdoor sensor would likely improve the
   forecast more than any modelling change in this document.

---

## 9. Reproducing

All three scripts exist and run today. Everything runs **on the lab desktop**,
where Postgres lives (§5.1); the `--source influx` variants run the same code
against the 30-day cloud window for development off-machine.

```bash
cd backend

# §0 — the data audit. Introspects; assumes no schema.
python scripts/audit_data.py --source postgres              # lists tables
python scripts/audit_data.py --source postgres --table environment

# §4 — validation. THE gate: does anything beat persistence on unseen days?
python scripts/validate_forecast.py --source postgres
python scripts/validate_forecast.py --source postgres --target humidity

# §2 — train + save the artifact, but only for a model validation justified.
python scripts/train_forecast.py --source postgres           # ridge (default)
python scripts/train_forecast.py --source postgres --model hgb   # if it clearly won
```

`validate_forecast.py` is the one that matters. It prints, for every horizon:
baseline MAE, model MAE, skill score, the paired-test p-value, and realised
interval coverage — and it must be re-run after any change to features or model.

The order is not optional: **validate before you train.** If validation shows no
horizon beats persistence, there is nothing to ship — `train_forecast.py` will
still save an artifact but stamps it `skill <= 0` and warns, and the API serves
persistence for that horizon instead.

A model whose validation output is not reproducible on demand should not be in
production.
