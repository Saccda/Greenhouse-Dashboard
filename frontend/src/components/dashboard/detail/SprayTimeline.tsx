"use client";
/**
 * Every spray cycle in the window, as a ribbon.
 *
 * WHAT THIS ANSWERS THAT THE TABLE DOES NOT
 *   A table of start times tells you each cycle. It does not tell you the
 *   RHYTHM — that the pump ran five times before noon and twice after, or
 *   that there is a six-hour hole in the middle of the hottest part of the
 *   day. Spacing is the information here, and a table sorts that into a
 *   column where it disappears.
 *
 *   The table stays, underneath, because "which cycle was cut short" is a
 *   per-row question that a ribbon cannot answer.
 *
 * WIDTH IS DURATION, WITH A FLOOR
 *   A bar's width is its runtime as a share of the window, so a long cycle
 *   looks long. Over 24 hours a four-minute run is 0.3% of the width — about
 *   two pixels — so there is a minimum width of 3px. That makes short cycles
 *   visible at the cost of making them look slightly longer than they are,
 *   which is the right trade for a ribbon whose job is rhythm rather than
 *   measurement. The table below carries the exact figure.
 */
import { clsx } from "clsx";

import type { SprayEvent } from "@/types";
import { duration } from "@/lib/series";

export default function SprayTimeline({
  events, windowStart, windowEnd,
}: {
  events: SprayEvent[];
  windowStart: number;
  windowEnd: number;
}) {
  const span = windowEnd - windowStart;
  if (span <= 0) return null;

  // Six evenly spaced marks. More crowds at phone width, fewer makes the
  // middle of the ribbon unreadable.
  const ticks = Array.from({ length: 6 }, (_, i) => windowStart + (span * i) / 5);

  return (
    <div className="min-w-0">
      <div className="relative h-14 rounded-lg bg-surface-hover overflow-hidden">
        {/* Hour grid, behind the bars. */}
        {ticks.slice(1, -1).map((t) => (
          <span
            key={t}
            className="absolute top-0 bottom-0 w-px bg-surface-border"
            style={{ left: `${((t - windowStart) / span) * 100}%` }}
          />
        ))}

        {events.map((e, i) => {
          const start = new Date(e.start_time).getTime();
          const end = new Date(e.end_time).getTime();
          const left = ((start - windowStart) / span) * 100;
          const width = ((end - start) / span) * 100;
          if (left > 100 || left + width < 0) return null;

          return (
            <span
              key={i}
              title={`${new Date(e.start_time).toLocaleString()} · ${duration(e.duration_minutes)}${
                e.incomplete ? " (cut short by a gap in the feed)" : ""
              }`}
              className={clsx(
                "absolute top-2 bottom-2 rounded-sm min-w-[3px]",
                e.ongoing ? "bg-brand-green animate-pulse"
                  // A cycle whose end was guessed from a feed gap is hatched,
                  // so a lower bound never looks like a measurement.
                  : e.incomplete ? "bg-amber-500/70"
                    : "bg-sky-500",
              )}
              style={{
                left: `${Math.max(0, left)}%`,
                width: `${Math.max(0.2, Math.min(width, 100 - Math.max(0, left)))}%`,
              }}
            />
          );
        })}

        {events.length === 0 && (
          <span className="absolute inset-0 grid place-items-center text-[12px] text-slate-500">
            The pump did not run in this period.
          </span>
        )}
      </div>

      <div className="flex justify-between mt-1.5 text-[10px] text-slate-500 font-mono-num">
        {ticks.map((t) => (
          <span key={t}>
            {new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        ))}
      </div>
    </div>
  );
}
