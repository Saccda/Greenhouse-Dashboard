/**
 * Types for GET /api/analytics/summary.
 * Mirrors backend/routes/analytics.py + services/analytics_service.py — keep
 * the two in step when either changes.
 */

export interface Coverage {
  samples:            number;
  expected_samples:   number;
  /** Readings present vs what a continuously-running sensor would produce (0-1). */
  coverage_ratio:     number | null;
  median_gap_seconds: number | null;
  max_gap_seconds:    number | null;
  /** Hours of the day (0-23) that have any data at all. */
  hours_present:      number[];
  samples_by_hour:    Record<string, number>;
  first_reading:      string | null;
  last_reading:       string | null;
}

export interface Describe {
  n:        number;
  mean:     number;
  sd:       number;
  min:      number;
  max:      number;
  p05:      number;
  p25:      number;   // Q1
  median:   number;
  p75:      number;   // Q3
  p95:      number;
  iqr:      number;
  skewness: number | null;
  /** Tukey box-plot anatomy: fences at Q1/Q3 ± 1.5·IQR. */
  lower_fence:   number;
  upper_fence:   number;
  /** Most extreme readings still inside the fences — where the whiskers stop. */
  whisker_low:   number;
  whisker_high:  number;
  outliers_low:  number;
  outliers_high: number;
}

export interface HistogramBin {
  start:    number;
  end:      number;
  mid:      number;
  count:    number;
  fraction: number;
}

export interface Histogram {
  rule:      string;
  bin_width: number;
  bins:      HistogramBin[];
}

export type BandStatus = "optimal" | "warning" | "critical";

export interface RangeBand {
  label:    string;
  status:   BandStatus;
  min:      number | null;
  max:      number | null;
  count:    number;
  fraction: number;
}

export interface TimeInRange {
  n:                number;
  bands:            RangeBand[];
  optimal_fraction: number;
}

export interface Exceedance {
  threshold:               number;
  n:                       number;
  count_above:             number;
  /** P(value > threshold | monitored hours) — see the coverage caveat. */
  probability:             number;
  episodes:                number;
  longest_episode_minutes: number;
  mean_episode_minutes:    number;
  total_minutes_above:     number;
}

export interface DiurnalHour {
  hour:     number;
  days:     number;
  mean:     number | null;
  ci_lower: number | null;
  ci_upper: number | null;
}

export interface Diurnal {
  confidence:     number;
  hours:          DiurnalHour[];
  observed_hours: number[];
  peak_hour:      number | null;
  peak_mean:      number | null;
  /** "day" — the interval is computed across days, not across raw readings. */
  sampling_unit:  string;
}

export interface ParameterAnalytics {
  coverage:      Coverage;
  describe:      Describe | null;
  histogram:     Histogram | null;
  time_in_range: TimeInRange | null;
  exceedance:    Exceedance | null;
  diurnal:       Diurnal | null;
}

export type EffectVerdict =
  | "insufficient_data"
  | "underpowered"
  | "cooling_detected"
  | "warming_detected"
  | "no_detectable_effect";

export interface EffectInterpretation {
  verdict:  EffectVerdict;
  headline: string;
  detail:   string;
}

export interface SprayPair {
  start_time:       string;
  duration_minutes: number | null;
  before:           number;
  after:            number;
  difference:       number;
  n_before:         number;
  n_after:          number;
}

export interface SprayEffect {
  field:            string;
  window_minutes:   number;
  confidence:       number;
  n_events_total:   number;
  n_events_used:    number;
  n_events_skipped: number;
  pairs:            SprayPair[];
  mean_difference:  number | null;
  ci_lower:         number | null;
  ci_upper:         number | null;
  p_value:          number | null;
  cohens_d:         number | null;
  /** Half the CI width — the smallest effect this sample size could detect. */
  resolution_c:     number | null;
  interpretation:   EffectInterpretation;
  confounds:        string[];
}

export interface WaterEfficiency {
  liters_total:      number;
  mean_cooling_c:    number;
  liters_per_degree: number | null;
  note:              string | null;
}

export interface AnalyticsSummary {
  farm:         string;
  range:        string;
  range_days:   number;
  generated_at: string;
  thresholds:   { temperature: number; humidity: number };
  parameters:   {
    temperature: ParameterAnalytics;
    humidity:    ParameterAnalytics;
  };
  spray: {
    stats: {
      total_sprays:           number;
      total_spray_minutes:    number;
      avg_spray_minutes:      number;
      estimated_water_liters: number | null;
    };
    effect:           SprayEffect;
    water_efficiency: WaterEfficiency | null;
  };
}
