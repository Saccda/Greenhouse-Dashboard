"use client";
import { clsx } from "clsx";
import { format, parseISO } from "date-fns";
import { RefreshCw } from "lucide-react";
import type { SprayStats } from "@/types";

interface SprayEventsTableProps {
  stats:      SprayStats | undefined;
  isLoading?: boolean;
  showDate?:  boolean;   // true → show full date+time, false → time only
  emptyText?: string;
}

export default function SprayEventsTable({
  stats,
  isLoading = false,
  showDate  = false,
  emptyText = "No spray events today",
}: SprayEventsTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 rounded bg-surface-hover animate-pulse" />
        ))}
      </div>
    );
  }

  if (!stats || stats.data_status === "no_data") {
    return <p className="text-sm text-slate-600 text-center py-4">{emptyText}</p>;
  }

  const { spray_events } = stats;
  const timeFmt = showDate ? "MMM d, HH:mm" : "HH:mm:ss";

  return (
    <div className="overflow-auto max-h-72">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-600 border-b border-surface-border">
            <th className="pb-2 pr-3 font-medium">#</th>
            <th className="pb-2 pr-3 font-medium">Start</th>
            <th className="pb-2 pr-3 font-medium">End</th>
            <th className="pb-2 font-medium">Duration</th>
          </tr>
        </thead>
        <tbody>
          {spray_events.length === 0 && (
            <tr>
              <td colSpan={4} className="text-center text-slate-600 py-4">{emptyText}</td>
            </tr>
          )}
          {spray_events.map((ev, i) => (
            <tr key={i} className="border-b border-surface-border/50 last:border-0">
              <td className="py-1.5 pr-3 text-slate-600 font-mono-num">{i + 1}</td>
              <td className="py-1.5 pr-3 text-slate-300 font-mono-num">
                {format(parseISO(ev.start_time), timeFmt)}
              </td>
              <td className="py-1.5 pr-3 font-mono-num">
                {ev.ongoing ? (
                  <span className="flex items-center gap-1 text-brand-cyan">
                    <RefreshCw size={10} className="animate-spin" />
                    ongoing
                  </span>
                ) : (
                  <span className="text-slate-300">
                    {format(parseISO(ev.end_time), timeFmt)}
                  </span>
                )}
              </td>
              <td className="py-1.5">
                <span className={clsx(
                  "font-mono-num font-semibold",
                  ev.ongoing ? "text-brand-cyan" : "text-slate-300",
                )}>
                  {ev.duration_minutes < 1
                    ? `${Math.round(ev.duration_minutes * 60)}s`
                    : `${ev.duration_minutes.toFixed(1)}m`}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
