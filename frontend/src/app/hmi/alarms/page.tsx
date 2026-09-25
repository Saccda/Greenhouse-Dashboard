"use client";
/**
 * HMI › Alarms & Events — deliberately NO mimic.
 *
 * This view is a list, and a list wants width. Keeping the 3D model here
 * would cost half the screen to show something the operator is not looking at
 * while reading alarms — which was the flaw in the first version of this page,
 * where every view carried the model whether it helped or not.
 *
 * Ordered newest first, because the question being asked is almost always
 * "what just happened", not "what happened first".
 */
import { useState } from "react";
import useSWR from "swr";
import { clsx } from "clsx";

import { swrFetcher } from "@/lib/api";
import { HMI } from "@/components/hmi2/tokens";

interface AlertRow {
  id: number;
  farm_id: string;
  alert_type: string;
  event: string;
  sensor_value: number | null;
  threshold: number | null;
  duration_min: number | null;
  message: string;
  created_at: string;
}

const RANGES = [
  { days: 1, label: "24 h" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
];

/** alert = came on, reminder = still on, resolved = went away. */
const EVENT_STYLE: Record<string, { color: string; mark: string }> = {
  alert: { color: HMI.alarm, mark: "ALARM" },
  reminder: { color: HMI.warn, mark: "STILL" },
  resolved: { color: HMI.inkFaint, mark: "CLEAR" },
};

export default function HmiAlarms() {
  const [days, setDays] = useState(7);
  const [onlyActive, setOnlyActive] = useState(false);

  const { data, isLoading } = useSWR<{ logs: AlertRow[]; count: number }>(
    `/api/notifications/log?farm=campus&days=${days}&limit=500`,
    swrFetcher,
    { refreshInterval: 30_000 },
  );

  const rows = (data?.logs ?? []).filter((r) => !onlyActive || r.event !== "resolved");

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Filters. Kept to two, because an operator reading an alarm list under
          pressure should not have to configure a query first. */}
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ borderBottom: "1px solid " + HMI.line }}
      >
        {RANGES.map((r) => (
          <FilterButton key={r.days} active={days === r.days} onClick={() => setDays(r.days)}>
            {r.label}
          </FilterButton>
        ))}
        <span className="w-px h-5 mx-1" style={{ backgroundColor: HMI.line }} />
        <FilterButton active={onlyActive} onClick={() => setOnlyActive((v) => !v)}>
          Unresolved only
        </FilterButton>
        <span className="ml-auto text-[11px] font-mono-num" style={{ color: HMI.inkFaint }}>
          {isLoading ? "loading…" : `${rows.length} event${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {rows.length === 0 && !isLoading ? (
          // Says what it means, rather than leaving a blank area that reads
          // identically to a page that failed to load.
          <div className="h-full grid place-items-center">
            <p className="text-[13px]" style={{ color: HMI.inkFaint }}>
              No alarms or events recorded in the last {RANGES.find((r) => r.days === days)?.label}.
            </p>
          </div>
        ) : (
          <table className="w-full text-[12px] border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr>
                {["", "Time", "Type", "Value", "Threshold", "Duration", "Message"].map((h, i) => (
                  <th
                    key={i}
                    className={clsx(
                      "text-left font-semibold text-[10px] uppercase tracking-widest px-3 py-2",
                      (h === "Value" || h === "Threshold" || h === "Duration") && "text-right",
                    )}
                    style={{
                      backgroundColor: HMI.panelAlt,
                      color: HMI.inkMuted,
                      borderBottom: "1px solid " + HMI.line,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const style = EVENT_STYLE[r.event] ?? EVENT_STYLE.resolved;
                return (
                  <tr key={r.id}>
                    {/* Severity as a solid block in the left gutter — a column of
                        blocks is scannable from a distance in a way that a
                        column of words is not. */}
                    <td className="px-3 py-2" style={{ borderBottom: "1px solid " + HMI.line }}>
                      <span
                        className="inline-block w-2 h-4 align-middle"
                        style={{ backgroundColor: style.color }}
                        title={style.mark}
                      />
                    </td>
                    <Cell mono>{new Date(r.created_at).toLocaleString([], {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                    })}</Cell>
                    <Cell>
                      <span style={{ color: style.color }} className="font-semibold">
                        {style.mark}
                      </span>{" "}
                      <span style={{ color: HMI.inkMuted }}>{r.alert_type.replace(/_/g, " ")}</span>
                    </Cell>
                    <Cell mono right>{r.sensor_value != null ? r.sensor_value.toFixed(1) : "—"}</Cell>
                    <Cell mono right muted>{r.threshold != null ? r.threshold.toFixed(1) : "—"}</Cell>
                    <Cell mono right muted>
                      {r.duration_min != null ? `${Math.round(r.duration_min)} min` : "—"}
                    </Cell>
                    <Cell>{r.message}</Cell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Cell({
  children, mono, right, muted,
}: {
  children: React.ReactNode; mono?: boolean; right?: boolean; muted?: boolean;
}) {
  return (
    <td
      className={clsx("px-3 py-2 align-middle", mono && "font-mono-num tabular-nums", right && "text-right")}
      style={{ color: muted ? HMI.inkFaint : HMI.ink, borderBottom: "1px solid " + HMI.line }}
    >
      {children}
    </td>
  );
}

function FilterButton({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 text-[11px] font-semibold tracking-wide transition-opacity"
      style={{
        backgroundColor: active ? HMI.panelAlt : "transparent",
        color: active ? HMI.ink : HMI.inkMuted,
        border: "1px solid " + (active ? HMI.line : "transparent"),
      }}
    >
      {children}
    </button>
  );
}
