// ── Sensor / Reading types ────────────────────────────────────────────────

export interface FieldReading {
  value:     number;
  timestamp: string;
}

/** Latest readings keyed by field name (temperature, humidity, relay1 …) */
export type LatestReadings = Record<string, FieldReading>;

export interface RelayStatus {
  key:         string;           // "relay1" | "relay2" | "relay3"
  label:       string;           // e.g. "Cooling System"
  icon:        string;           // lucide icon name
  description: string;           // short subtitle shown in the HMI card
  state:       "ON" | "OFF" | "UNKNOWN";
  value:       number | null;
  timestamp:   string | null;
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
