"use client";
/**
 * Digital traces, time-aligned under an analog chart.
 *
 * This is the oldest idea in process historians and the one the dashboard was
 * missing: put what the machine DID directly beneath what the greenhouse did,
 * on the same time axis, and cause and effect stop being something you have to
 * hold in your head. Spraying at 14:20 and a temperature that bends at 14:22
 * are one picture rather than two pages.
 *
 * Alignment is done by construction rather than by eye. The parent gives this
 * the same left and right padding as the chart's plot area (the Recharts YAxis
 * width and right margin), and every bar is positioned as a percentage of the
 * shared time domain. Nothing here measures the chart or depends on its
 * internals, so the two cannot drift apart when Recharts changes its layout.
 *
 * On aggregation: the history API averages each window, so a channel that ran
 * for twenty seconds of a one-minute window arrives as 0.33, not 1. That is
 * treated as DUTY and drawn as opacity — a faint bar genuinely means "on for
 * part of this window". Rounding it up to a solid bar would overstate runtime,
 * which on a page whose job is reporting runtime would be the one unforgivable
 * lie.
 */
import { HMI } from "./tokens";
import type { TimePoint } from "@/types";

export interface Trace {
  label: string;
  points: TimePoint[];
  /** Explains a trace that is flat because nothing is wired to it. */
  unassigned?: boolean;
}

export default function ActivityStrip({
  traces, from, to, windowMs, padLeft, padRight,
}: {
  traces: Trace[];
  from: number;
  to: number;
  /** One aggregation window, so a single sample has visible width. */
  windowMs: number;
  padLeft: number;
  padRight: number;
}) {
  const span = Math.max(1, to - from);
  // A lone sample in a long range would otherwise be a sub-pixel sliver and
  // read as "nothing happened" — the opposite of what it means.
  const minWidthPct = 0.35;

  return (
    <div style={{ paddingLeft: padLeft, paddingRight: padRight }}>
      {traces.map((t) => {
        const on = t.points.filter((p) => (p.value ?? 0) > 0);
        return (
          <div key={t.label} className="flex items-center gap-2 mb-px">
            <span
              className="shrink-0 text-[10px] tracking-wide text-right"
              style={{ width: 86, color: t.unassigned ? HMI.inkFaint : HMI.inkMuted }}
            >
              {t.label}
            </span>
            <div
              className="relative flex-1 min-w-0"
              style={{ height: 14, backgroundColor: HMI.bg }}
              title={
                t.unassigned
                  ? `${t.label} — nothing wired to this channel`
                  : on.length
                    ? `${t.label} — active in ${on.length} window${on.length === 1 ? "" : "s"}`
                    : `${t.label} — did not run in this period`
              }
            >
              <svg
                viewBox="0 0 100 10"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full"
              >
                {on.map((p) => {
                  const start = ((new Date(p.time).getTime() - from) / span) * 100;
                  const w = Math.max(minWidthPct, (windowMs / span) * 100);
                  if (start < -w || start > 100) return null;
                  const duty = Math.min(1, Math.max(0, p.value ?? 0));
                  return (
                    <rect
                      key={p.time}
                      x={Math.max(0, start)}
                      y={0}
                      width={w}
                      height={10}
                      fill={HMI.on}
                      // Duty as opacity, floored so a brief run is still visible.
                      fillOpacity={0.35 + duty * 0.65}
                    />
                  );
                })}
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}
