"use client";
import useSWR from "swr";
import { clsx } from "clsx";

import { swrFetcher } from "@/lib/api";
import { HMI } from "./tokens";

export interface LiveAlarm {
  id: string;
  priority: "alarm" | "warn";
  tag: string;
  text: string;
  at?: string;
}

interface AlertRow {
  id: number;
  alert_type: string;
  event: string;
  message: string;
  created_at: string;
}

/**
 * The alarm strip — the most recent events as a small TABLE, not a banner.
 *
 * Changed from a one-line banner after looking at a real plant's screens
 * (PPWSA's water treatment SCADA), where the top of every page is a short
 * scrolling list with time, tag, priority and description as columns. The
 * difference is not cosmetic. A banner answers "is anything wrong right now";
 * a strip answers "what has been happening", which is the question an operator
 * walking up to a panel actually has. A single current alarm cannot tell you
 * whether it has been flapping for an hour.
 *
 * Fixed height and always present. It shows NO ACTIVE ALARMS in words rather
 * than going blank, because a blank strip reads exactly like a page that
 * failed to load.
 */
export default function AlarmStrip({ live }: { live: LiveAlarm[] }) {
  // Recent history, so the strip has something to say when nothing is wrong now.
  const { data } = useSWR<{ logs: AlertRow[] }>(
    "/api/notifications/log?farm=campus&days=7&limit=5", swrFetcher,
    { refreshInterval: 60_000 },
  );

  const historic: LiveAlarm[] = (data?.logs ?? []).map((r) => ({
    id: "log-" + r.id,
    priority: r.event === "resolved" ? "warn" : "alarm",
    tag: r.alert_type.replace(/_/g, " ").toUpperCase(),
    text: r.message,
    at: r.created_at,
  }));

  // Live conditions outrank the log: the log is written by a checker that runs
  // every few minutes, so it always trails what the feed is saying now.
  const rows = [...live, ...historic].slice(0, 3);
  const worst = rows.some((r) => r.priority === "alarm") ? "alarm"
    : rows.length ? "warn" : "none";

  return (
    <div
      className="shrink-0 h-[6rem] overflow-hidden flex flex-col"
      style={{ backgroundColor: HMI.panelAlt, borderBottom: "1px solid " + HMI.line }}
      role="status"
      aria-live="polite"
    >
      {/* Column headers, as the plant's own screens have. They cost one row and
          make the columns readable without guessing. */}
      <div
        className="grid items-center px-5 py-1.5 text-[11px] font-bold tracking-widest uppercase shrink-0"
        style={{ gridTemplateColumns: "9rem 11rem 6rem 1fr", color: HMI.inkFaint, borderBottom: "1px solid " + HMI.line }}
      >
        <span>Date / time</span>
        <span>Tag</span>
        <span>Priority</span>
        <span>Description</span>
      </div>

      {rows.length === 0 ? (
        <div className="flex-1 grid place-items-center">
          <span className="text-[15px] font-bold tracking-widest" style={{ color: HMI.inkFaint }}>
            NO ACTIVE ALARMS
          </span>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          {rows.map((r) => (
            <div
              key={r.id}
              className="grid items-center px-5 text-[14px] h-[1.7rem]"
              style={{ gridTemplateColumns: "9rem 11rem 6rem 1fr" }}
            >
              <span className="font-mono-num" style={{ color: HMI.inkFaint }}>
                {r.at
                  ? new Date(r.at).toLocaleString([], {
                      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                    })
                  : "live"}
              </span>
              <span className="font-mono-num truncate" style={{ color: HMI.inkMuted }}>
                {r.tag}
              </span>
              {/* Priority carried by SHAPE as well as colour — a triangle for
                  high, a square for low. ISA-18.2 asks for a second channel
                  precisely so priority survives a colour-blind operator, a
                  washed-out panel and a monochrome printout of the log. */}
              <span className="flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 10 10" aria-hidden>
                  {r.priority === "alarm"
                    ? <path d="M5 0 L10 9 L0 9 Z" fill={HMI.alarm} />
                    : <rect x="0.5" y="0.5" width="9" height="9" fill={HMI.warn} />}
                </svg>
                <span className="font-bold tracking-wide"
                      style={{ color: r.priority === "alarm" ? HMI.alarm : HMI.warn }}>
                  {r.priority === "alarm" ? "HIGH" : "LOW"}
                </span>
              </span>
              <span className="truncate" style={{ color: worst === "none" ? HMI.inkMuted : HMI.ink }}>
                {r.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
