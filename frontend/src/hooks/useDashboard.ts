"use client";
/**
 * useDashboard — pure SWR data hook.
 *
 * No WebSocket / Socket.io. Each SWR key polls at the appropriate cadence:
 *  - latest readings + alerts : every 15 s  (sensor data freshness)
 *  - history time-series      : every 30 s  (chart doesn't need sub-30s updates)
 *  - spray stats              : every 30 s
 *  - farms list               : once on mount (static config)
 */
import { useEffect, useState, useCallback } from "react";
import useSWR from "swr";

import { swrFetcher, fetchFarms } from "@/lib/api";
import type {
  LatestResponse,
  HistoryResponse,
  SprayStatsResponse,
  Farm,
  TimeRange,
  Aggregation,
} from "@/types";

interface UseDashboardOptions {
  farm:        string;
  timeRange:   TimeRange;
  aggregation: Aggregation;
  tempWarn?:   number;
  humWarn?:    number;
}

interface UseDashboardReturn {
  latest:           LatestResponse       | undefined;
  history:          HistoryResponse      | undefined;
  sprayStats:       SprayStatsResponse   | undefined;
  farms:            Farm[];
  isLoading:        boolean;
  error:            Error | null;
  connectionStatus: "online" | "offline" | "loading";
  lastUpdated:      Date | null;
  refresh:          () => void;
}

export function useDashboard({
  farm,
  timeRange,
  aggregation,
  tempWarn = 30,
  humWarn  = 70,
}: UseDashboardOptions): UseDashboardReturn {

  const [farms, setFarms] = useState<Farm[]>([]);

  // ── SWR keys — change triggers automatic refetch ──────────────────────
  const latestKey  = `/api/sensors/latest?farm=${farm}&temp_warn=${tempWarn}&hum_warn=${humWarn}`;
  const historyKey = `/api/sensors/history?farm=${farm}&range=${timeRange}&agg=${aggregation}`;
  const sprayKey   = `/api/sensors/spray-stats?farm=${farm}`;

  const {
    data: latest, error: latestError,
    isLoading: latestLoading, mutate: mutateLatest,
  } = useSWR<LatestResponse>(latestKey, swrFetcher, {
    refreshInterval:   15_000,
    revalidateOnFocus: false,
  });

  const {
    data: history, error: historyError,
    isLoading: historyLoading, mutate: mutateHistory,
  } = useSWR<HistoryResponse>(historyKey, swrFetcher, {
    refreshInterval:   30_000,
    revalidateOnFocus: false,
  });

  const {
    data: sprayStats, mutate: mutateSpray,
  } = useSWR<SprayStatsResponse>(sprayKey, swrFetcher, {
    refreshInterval:   30_000,
    revalidateOnFocus: false,
  });

  // ── Load farm list once ───────────────────────────────────────────────
  useEffect(() => {
    fetchFarms()
      .then((r) => setFarms(r.farms))
      .catch(console.error);
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────
  const error            = latestError ?? historyError ?? null;
  const isLoading        = latestLoading || historyLoading;
  const connectionStatus = error ? "offline" : latest ? "online" : "loading";
  const lastUpdated      = latest ? new Date(latest.timestamp) : null;

  const refresh = useCallback(() => {
    mutateLatest();
    mutateHistory();
    mutateSpray();
  }, [mutateLatest, mutateHistory, mutateSpray]);

  return {
    latest,
    history,
    sprayStats,
    farms,
    isLoading,
    error,
    connectionStatus,
    lastUpdated,
    refresh,
  };
}
