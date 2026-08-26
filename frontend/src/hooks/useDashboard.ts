"use client";
/**
 * useDashboard — pure SWR data hook.
 *
 * No WebSocket / Socket.io. Each SWR key polls at the appropriate cadence:
 *  - latest readings + alerts : every 15 s  (sensor data freshness)
 *  - history time-series      : every 30 s  (chart doesn't need sub-30s updates)
 *  - spray stats              : every 30 s
 *
 * Farm list/selection is the caller's job (see useFarmSelection) — this
 * hook only fetches data for whichever farm it's given.
 */
import { useCallback } from "react";
import useSWR from "swr";

import { swrFetcher } from "@/lib/api";
import type {
  LatestResponse,
  HistoryResponse,
  SprayStatsResponse,
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

  // ── SWR keys — change triggers automatic refetch ──────────────────────
  const latestKey  = `/api/sensors/latest?farm=${farm}&temp_warn=${tempWarn}&hum_warn=${humWarn}`;
  const historyKey = `/api/sensors/history?farm=${farm}&range=${timeRange}&agg=${aggregation}`;
  const sprayKey   = `/api/sensors/spray-stats?farm=${farm}&range=${timeRange}`;

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
    isLoading,
    error,
    connectionStatus,
    lastUpdated,
    refresh,
  };
}
