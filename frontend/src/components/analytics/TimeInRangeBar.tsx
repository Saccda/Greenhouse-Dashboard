"use client";
/**
 * TimeInRangeBar — share of readings in each agronomic band, as one stacked
 * proportion bar plus a labelled breakdown.
 *
 * Status colour is never the only encoding: every band carries its name, its
 * numeric range and its percentage in text, so the chart still reads correctly
 * in greyscale, for a colourblind viewer, or in forced-colours mode. Segments
 * are separated by a 2px surface gap so adjacent bands stay distinguishable
 * even when two similar statuses sit side by side.
 */
import { clsx } from "clsx";
import type { RangeBand, BandStatus } from "@/types/analytics";

const STATUS_VAR: Record<BandStatus, string> = {
  optimal:  "var(--chart-optimal)",
  warning:  "var(--chart-warning)",
  critical: "var(--chart-critical)",
};

const STATUS_LABEL: Record<BandStatus, string> = {
  optimal:  "Optimal",
  warning:  "Caution",
  critical: "Stress",
};

function rangeText(band: RangeBand, unit: string): string {
  if (band.min === null && band.max !== null) return `< ${band.max}${unit}`;
  if (band.max === null && band.min !== null) return `≥ ${band.min}${unit}`;
  return `${band.min}–${band.max}${unit}`;
}

export default function TimeInRangeBar({
  bands,
  unit,
}: {
  bands: RangeBand[];
  unit: string;
}) {
  const shown = bands.filter((b) => b.fraction > 0);

  return (
    <div className="space-y-3">
      {/* Stacked proportion bar */}
      <div className="flex h-9 w-full gap-[2px] overflow-hidden rounded-lg" role="img"
        aria-label={shown.map((b) => `${b.label} ${(b.fraction * 100).toFixed(1)}%`).join(", ")}>
        {shown.map((b) => (
          <div
            key={b.label}
            className="flex items-center justify-center overflow-hidden first:rounded-l-lg last:rounded-r-lg"
            style={{ width: `${b.fraction * 100}%`, backgroundColor: STATUS_VAR[b.status] }}
            title={`${b.label}: ${(b.fraction * 100).toFixed(1)}%`}
          >
            {/* Direct label, but only where the segment is actually wide
                enough to hold one — otherwise it spills into its neighbour. */}
            {b.fraction >= 0.12 && (
              <span className="text-[11px] font-semibold text-white/95 font-mono-num px-1 truncate">
                {(b.fraction * 100).toFixed(0)}%
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Breakdown — the table view that keeps this readable without colour */}
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5">
        {bands.map((b) => (
          <li key={b.label} className="flex items-center gap-2 text-xs">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: STATUS_VAR[b.status] }}
              aria-hidden
            />
            <span className="text-slate-300 font-medium">{b.label}</span>
            <span className="text-slate-600 font-mono-num">{rangeText(b, unit)}</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-500">{STATUS_LABEL[b.status]}</span>
            <span
              className={clsx(
                "ml-auto font-mono-num tabular-nums",
                b.fraction > 0 ? "text-slate-200 font-semibold" : "text-slate-600",
              )}
            >
              {(b.fraction * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
