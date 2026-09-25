// ── Sensor / Reading types ────────────────────────────────────────────────

export interface FieldReading {
  value:     number;
  timestamp: string;
}

/** Latest readings keyed by field name (temperature, humidity, relay1 …) */
export type LatestReadings = Record<string, FieldReading>;

export interface RelayStatus {
  key:          string;           // "relay1" | "relay2" | "relay3" | "CH1".."CH8" (campus)
  label:        string;           // e.g. "Cooling System"
  icon:         string;           // lucide icon name
  description:  string;           // short subtitle shown in the HMI card
  state:        "ON" | "OFF" | "UNKNOWN";
  value:        number | null;
  timestamp:    string | null;
  controllable: boolean;          // true → UI offers a direct on/off toggle (campus channels)
}

export interface Alert {
  type:    "warning" | "danger" | "info";
  field:   string;
  message: string;
}

// ── API response shapes ───────────────────────────────────────────────────

export interface LatestResponse {
  farm:             string;
  timestamp:        string;
  is_online:        boolean;
  data_age_minutes: number | null;
  last_seen:        string | null;
  readings:         LatestReadings;
  relays:           RelayStatus[];
  alerts:           Alert[];
}

export interface TimePoint {
  time:  string;
  value: number;
}

export interface HistoryResponse {
  farm:        string;
  range:       string;
  aggregation: string;
  series:      Record<string, TimePoint[]>;
}

export interface SprayEvent {
  start_time:        string;
  end_time:          string;
  duration_minutes:  number;
  ongoing:           boolean;
  incomplete?:       boolean;
}

export interface SprayStats {
  spray_events:            SprayEvent[];
  total_sprays:             number;
  total_spray_minutes:      number;
  avg_spray_minutes:        number;
  total_spray_display:      string;
  estimated_water_liters:   number | null;   // null when the farm's fogger layout isn't configured yet
  data_status:              "fresh" | "stale" | "no_data";
  last_data_time:           string | null;
}

export interface SprayStatsResponse {
  farm:  string;
  stats: SprayStats;
}

// ── Farm types ────────────────────────────────────────────────────────────

export interface Farm {
  id:           string;
  display_name: string;
  location:     string;
  measurement:  string;
  // Optional: a farm configured without coordinates gets no weather panel
  // rather than another site's forecast.
  latitude?:    number | null;
  longitude?:   number | null;
  /**
   * How this farm's water figure is obtained. Alternatives, not a hierarchy:
   * the runtime estimate exists BECAUSE there is no meter, so a farm with one
   * does not want both.
   */
  water_source?: "measured" | "estimated" | "none";
  /** Whether soil probes are fitted. False everywhere today. */
  has_soil_sensors?: boolean;
}

export interface FarmsResponse {
  farms: Farm[];
}

// ── Dashboard aggregated state ────────────────────────────────────────────

export interface DashboardState {
  latest:     LatestResponse  | null;
  history:    HistoryResponse | null;
  sprayStats: SprayStatsResponse | null;
  farms:      Farm[];
  isLoading:  boolean;
  error:      string | null;
  connectionStatus: "connected" | "disconnected" | "reconnecting";
  lastUpdated: string | null;
}

// ── API utility responses ─────────────────────────────────────────────────

export interface HealthResponse {
  status:    string;
  influxdb:  string;
  timestamp: string;
}

// ── Time range / aggregation helpers ─────────────────────────────────────

export type TimeRange = "-1h" | "-6h" | "-12h" | "-24h" | "-3d" | "-7d" | "-30d";
export type Aggregation = "1m" | "5m" | "15m" | "1h" | "6h" | "1d";

export interface TimeRangeOption {
  label: string;
  value: TimeRange;
  defaultAgg: Aggregation;
}

export const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { label: "1 Hour",   value: "-1h",  defaultAgg: "1m"  },
  { label: "6 Hours",  value: "-6h",  defaultAgg: "5m"  },
  { label: "12 Hours", value: "-12h", defaultAgg: "15m" },
  { label: "24 Hours", value: "-24h", defaultAgg: "15m" },
  { label: "3 Days",   value: "-3d",  defaultAgg: "1h"  },
  { label: "7 Days",   value: "-7d",  defaultAgg: "1h"  },
  { label: "30 Days",  value: "-30d", defaultAgg: "1d"  },
];

/** One day as reported by the flow meter. */
export interface WaterReading {
  timestamp:        string;
  start_totalizer:  number | null;
  last_totalizer:   number | null;
  /** null when the meter reset that day — the figure would measure the reset. */
  consumption:        number | null;
  /** The same figure in litres, for comparison with the runtime estimate. */
  consumption_liters: number | null;
  meter_reset:        boolean;
}

export interface WaterResponse {
  farm:           string;
  /** Only PP Campus has a meter; it is a development-stage installation. */
  has_meter:       boolean;
  /** The meter's own unit, e.g. "m3". null when the farm has no meter. */
  unit:            string | null;
  /** Display form of the same, e.g. "m³". */
  unit_label:      string | null;
  liters_per_unit: number | null;
  /** Whether the unit was confirmed against the hardware, or is an assumption. */
  unit_confirmed:  boolean;
  readings:       WaterReading[];
  /** Why readings is empty, when it is. */
  reason:         string | null;
}
