/**
 * Connection status shown in the header badge.
 *
 * Every page used to derive this with the same copy-pasted expression:
 *
 *   const connectionStatus = error ? "offline" : latest ? "online" : "loading";
 *
 * which only ever asked "did the API respond". That collapsed two genuinely
 * different faults into one green "Online":
 *
 *   - the dashboard cannot reach the backend          → nothing is trustworthy
 *   - the backend is fine but the farm stopped        → the backend is fine,
 *     reporting (is_online false, i.e. the newest        the FARM is dark
 *     reading is older than DATA_STALE_MINUTES)
 *
 * The second case is the common one — a dead MQTT bridge, a controller that
 * lost power, an ESP32 off the network — and it was the one being reported as
 * healthy. The header would read "Online" in green while every relay card
 * below it read UNKNOWN.
 *
 * `stale` now names that case explicitly, matching the amber the relay cards
 * already use for UNKNOWN.
 */
export type ConnectionStatus = "online" | "stale" | "offline" | "loading";

/**
 * Derive the badge state from an SWR result.
 *
 * `payload` is whatever the page polls. Only `is_online` is read from it, and
 * only when present — so pages whose payload carries no freshness field
 * (Analytics, Historical) keep their previous behaviour of reporting on the
 * API alone, rather than silently claiming the farm is live.
 */
export function deriveConnectionStatus<T extends object>(
  error:    unknown,
  payload?: T | null,
): ConnectionStatus {
  if (error)    return "offline";
  if (!payload) return "loading";
  // Generic rather than `{ is_online?: boolean }` so TypeScript's weak-type
  // check doesn't reject HistoryResponse / AnalyticsSummary, which legitimately
  // have no freshness field. Absent or true both mean "don't claim stale".
  const isOnline = (payload as { is_online?: unknown }).is_online;
  return isOnline === false ? "stale" : "online";
}
