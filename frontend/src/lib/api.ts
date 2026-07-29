/**
 * Thin fetch wrapper that talks to the Flask backend.
 * All functions throw on network / HTTP errors so callers can handle them.
 */
import type {
  LatestResponse,
  HistoryResponse,
  SprayStatsResponse,
  FarmsResponse,
  TimeRange,
  Aggregation,
} from "@/types";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
const BASE = API_BASE;

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store", credentials: "include" });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${path}: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Public helpers ────────────────────────────────────────────────────────

export function fetchLatest(
  farm: string,
  tempWarn?: number,
  humWarn?: number,
): Promise<LatestResponse> {
  const params = new URLSearchParams({ farm });
  if (tempWarn != null) params.set("temp_warn", String(tempWarn));
  if (humWarn  != null) params.set("hum_warn",  String(humWarn));
  return apiFetch<LatestResponse>(`/api/sensors/latest?${params}`);
}

export function fetchHistory(
  farm:        string,
  range:       TimeRange  = "-24h",
  aggregation: Aggregation = "5m",
): Promise<HistoryResponse> {
  const params = new URLSearchParams({ farm, range, agg: aggregation });
  return apiFetch<HistoryResponse>(`/api/sensors/history?${params}`);
}

export function fetchSprayStats(farm: string): Promise<SprayStatsResponse> {
  return apiFetch<SprayStatsResponse>(`/api/sensors/spray-stats?farm=${farm}`);
}

export function fetchFarms(): Promise<FarmsResponse> {
  return apiFetch<FarmsResponse>(`/api/farms/`);
}

export function fetchHealth(): Promise<{ status: string; influxdb: string }> {
  return apiFetch(`/api/health`);
}

// ── SWR fetcher (pass directly to useSWR) ────────────────────────────────
export const swrFetcher = (url: string) =>
  fetch(`${BASE}${url}`, { credentials: "include" }).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });
