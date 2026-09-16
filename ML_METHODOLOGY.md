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

Every claim below was produced by querying the live bucket on **2026-09-16**.

### 0.1 Volume

| Farm | Days with data | Rows | Verdict |
|---|---|---|---|
| **Kampot** | 29 | 21,259 | The only trainable farm today |
| Kep | 6 (of a 16-day span) | 278 | Not usable |
| Campus | 14 | 8,711 | Bridge is intermittent; not usable yet |

### 0.2 The coverage gap — the single most important fact

Kampot's readings, by hour of day, across all 29 days:

```
hour 00–07  :      0 rows    0/29 days
hour 08     :    671 rows   29/29 days
hour 09     :  2,563 rows   29/29 days
hour 10–15  : ~2,800/hr     28/29 days
hour 16     :    479 rows   28/29 days
hour 17–23  :      0 rows    0/29 days
```

**Fifteen of twenty-four hours have never been observed — not on one single day
out of twenty-nine.**

This is not a data-collection accident that more patience will fix. It is
configured behaviour: `MAINTENANCE_START=16:00`, `MAINTENANCE_END=06:00` in
`backend/config.py`. The rig is powered down overnight.

> **Consequence for this phase:** a longer archive increases the number of
> *days*, which is genuinely valuable (see §0.4). It does **not** fill the night
> gap. If the rig has always run on this schedule, then a two-year archive has
> exactly as much night-time data as a two-week one: none.

### 0.3 An unexplained discrepancy worth resolving

The configured window is 06:00–16:00, but **no data has ever arrived before
08:00**. Two hours that should be recorded are empty on every day.

Either the config does not reflect the field reality, or the rig is switched on
manually each morning. Worth establishing which, because it is two extra hours
per day of the cool part of the morning — the most informative unobserved region
adjacent to what we do see, and the cheapest coverage improvement available.

### 0.4 🔒 Re-audit against Postgres before modelling

The figures above come from InfluxDB Cloud, which is holding a **rolling ~30-day
window**, not an archive. The Node-RED → Postgres store on the lab desktop is
reported to hold *several months or more*, which would raise the independent
sample size from ~29 day-blocks to ~150–700.

That materially changes what §3 can attempt, so **the audit must be repeated
against Postgres before any model is fitted.** Run on the lab desktop:

```sql
-- Extent and volume
SELECT min(time) AS first, max(time) AS last, count(*) AS rows
FROM <sensor_table>;

-- Coverage by hour: the numbers that actually matter
SELECT extract(hour FROM time AT TIME ZONE 'Asia/Phnom_Penh') AS hr,
       count(*)                       AS rows,
       count(DISTINCT date(time))     AS days_seen
FROM <sensor_table>
GROUP BY 1 ORDER BY 1;

-- Did the recording schedule ever change?
SELECT date_trunc('month', time) AS month,
       min(extract(hour FROM time AT TIME ZONE 'Asia/Phnom_Penh')) AS earliest_hr,
       max(extract(hour FROM time AT TIME ZONE 'Asia/Phnom_Penh')) AS latest_hr,
       count(DISTINCT date(time))                                  AS days
FROM <sensor_table>
GROUP BY 1 ORDER BY 1;
```

The third query is the one to read carefully. If an earlier period recorded
continuously, that window is disproportionately valuable — it is the only
evidence of night-time behaviour that will ever exist without a hardware change.

---

## 1. What is ruled out, and why

State these before a reviewer raises them.

### 1.1 No deep learning (LSTM, GRU, Transformer)

These architectures need thousands of complete daily cycles to identify seasonal
structure. At 29 — or even 700 — *partial* days, the parameter count exceeds
anything the data can constrain. The model would memorise the training days and
the held-out error would say so.

This is a statement about sample size, not about the merits of the architecture.

### 1.2 No overnight or 24-hour forecasting

The model has never seen 17:00–08:00. Predicting that region is not
interpolation, it is **extrapolation into a domain with zero support**.

The uncomfortable part: night is precisely when unattended crop risk is highest,
so it is the forecast a farm owner would most want — and the one we are least
entitled to produce. A model that emits a confident night-time number is worse
than no model, because it will be trusted.

**Design rule enforced in code (§2.5): the service refuses to forecast past the
shutdown boundary.**

### 1.3 Daily aggregates are daytime aggregates

"Daily maximum temperature" here means "maximum during monitored hours". For
maximum temperature this is probably close to the true daily max — the hottest
part of the day is inside the window. For daily *mean*, *minimum*, or *range* it
is badly biased. Label these accordingly in any output.

### 1.4 The effective sample size is the number of days, not the number of rows

Readings two minutes apart are almost perfectly correlated. 21,259 rows do not
provide 21,259 independent observations; the independent experimental unit is
the **day**.

This single point invalidates most naive applications of ML to this dataset, and
it is the most defensible thing in this document. It drives the validation
scheme in §4 — and it is why "we have 21,259 data points" is a statement about
storage, not about evidence.

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

Deliberately excluded: day-of-year and any seasonal term. With 29 days there is
no seasonal signal to fit, only a trend the model would happily overfit.
Revisit once the Postgres re-audit (§0.4) confirms months of history.

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

---

## 3. Stage 2 — Sensor health and anomaly detection

Cheap, because it reuses Stage 1's residuals, and immediately useful: **the
campus MQTT bridge failed for days in September 2026 and was noticed by a human
looking at a card.** That is the class of failure this stage catches.

### 3.1 Detectors

| Detector | Rule | Catches |
|---|---|---|
| Dead feed | No reading for > `DATA_STALE_MINUTES` | Bridge down, ESP32 offline, network loss |
| Flatline | Identical value for N consecutive readings | Stuck sensor, frozen cache |
| Out of range | Outside physical bounds (temp 0–60 °C, humidity 0–100%) | Wiring fault, unit error, parse bug |
| Jump | \|Δ\| > k · MAD(Δ) | Spike, dropout, transient |
| Residual | \|y − ŷ\| > k · MAD(residuals) | Genuinely unusual conditions |

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
at 10:02:00 goes into test. They differ by ~0.05 °C. The model is being tested on
data it has effectively already seen.

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

n = number of held-out days (~29 today, more after §0.4). The existing
`backend/services/stats_core.py` already implements the paired t-test and
Cohen's d used for the spray analysis; this reuses it directly.

With n ≈ 29 the test is adequate for a large effect and underpowered for a small
one. If the result is "no significant improvement", **that is a finding and it
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

---

## 5. Deployment

### 5.1 Where it runs

Training is **offline** on the lab desktop against Postgres. Inference is a
loaded model artifact in the FastAPI backend. Nothing trains inside a request.

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
| 6. 🔒 Night-time forecasting | Continuous recording | **Gated on hardware** — no amount of data or modelling substitutes |

Stage 6 is listed to make the point that it is a *hardware* decision, not a
modelling one. If overnight prediction is a research objective, the rig must run
overnight. That is a conversation with the farm owner, not a task for this
document.

---

## 7. Teaching hooks

Mapped to Applied Statistics topics. The value here is that these are not
textbook hypotheticals — in this dataset each one changes the answer.

| Concept | Where it bites |
|---|---|
| Baselines | Persistence beats most ML at short horizons (§2.3) |
| Autocorrelation | Effective n is 29 days, not 21,259 rows (§1.4) |
| Data leakage | Random split gives a great, worthless MAE (§4.2) |
| MNAR missingness | 15 unobserved hours cannot be imputed (§0.2) |
| Extrapolation | Why night-time prediction is refused (§1.2) |
| Robust statistics | MAD vs SD when outliers are the target (§3.2) |
| Paired testing | Same day scored by both models (§4.5) |
| Power | n = 29 detects large effects only (§4.5) |
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

🔒 *Nothing below exists yet — this fixes the interface the implementation must
provide.*

```bash
cd backend

python scripts/audit_data.py --farm kampot      # §0 — re-run before trusting §0.1–0.2
python scripts/train_forecast.py --farm kampot --horizon 30
python scripts/validate_forecast.py --farm kampot   # §4 — must print the skill score
```

`validate_forecast.py` is the one that matters. It must print, for every horizon:
baseline MAE, model MAE, skill score, the paired test result, and realised
interval coverage — and it must be re-run after any change to features or model.

A model whose validation output is not reproducible on demand should not be in
production.
