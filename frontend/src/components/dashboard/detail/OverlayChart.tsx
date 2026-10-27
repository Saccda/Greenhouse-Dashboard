"use client";
/**
 * Several readings on one set of axes, with the spray cycles drawn through
 * them.
 *
 * WHY THINGS SHARE A CHART
 *   Two readings belong together when the COMPARISON is the point. Tank water
 *   against air temperature is the clearest case: neither number means much
 *   alone, and the gap between them decides whether spraying removes any heat
 *   at all. Shown as two charts stacked, the reader has to hold one line in
 *   their head while looking at the other, which is exactly the work a chart
 *   is supposed to do for them.
 *
 *   Nitrogen, phosphorus and potassium share for a different reason: same
 *   unit, and it is the RATIO between them an agronomist reads, not the three
 *   values separately.
 *
 * WHY THE SPRAY MARKERS MATTER MOST
 *   Every other panel on these pages reports what a sensor saw. These
 *   markers are the only thing that says what the FARM DID. Put a spray line
 *   through the temperature trace and the chart starts answering a question
 *   no single reading can: did running the pump actually cool the greenhouse,
 *   and did the soil respond? That is cause and effect, from data we already
 *   had and were drawing in two unrelated places.
 *
 * GAPS STAY GAPS
 *   connectNulls is off everywhere. A line drawn through a dead feed invents
 *   readings nobody took, and this system has lost eighteen days to a silence
 *   that a joined-up line would have hidden completely.
 */
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import type { SprayEvent, TimePoint } from "@/types";
import { exceedSpans, mergeSeries } from "@/lib/series";

export interface SeriesSpec {
  field: string;
  label: string;
  unit: string;
  color: string;
  /** Put this one on the right-hand axis — for a second unit on one chart. */
  axis?: "left" | "right";
  dashed?: boolean;
  /** Shade the chart red wherever this series sits at or above the value. */
  threshold?: number | null;
}

export default function OverlayChart({
  series, specs, sprayEvents, height = 340, leftUnit, rightUnit, leftDomain, rightDomain,
}: {
  series: Record<string, TimePoint[]> | undefined;
  specs: SeriesSpec[];
  /** Drawn as vertical bands where the pump ran. */
  sprayEvents?: SprayEvent[];
  height?: number;
  leftUnit?: string;
  rightUnit?: string;
  leftDomain?: [number | "auto", number | "auto"];
  rightDomain?: [number | "auto", number | "auto"];
}) {
  const rows = mergeSeries(series, specs.map((s) => s.field));

  if (rows.length === 0) {
    return (
      <div style={{ height }} className="grid place-items-center">
        <p className="text-[12px] text-slate-500 text-center px-4">
          No readings stored for this range.
        </p>
      </div>
    );
  }

  const hasRight = specs.some((s) => s.axis === "right");

  // Threshold shading comes from the first series that defines one. Shading
  // two overlapping sets of spans in the same red would be unreadable, and
  // "which of these is over" is a question for that series' own panel.
  const shaded = specs.find((s) => s.threshold != null);
  const spans = shaded
    ? exceedSpans(series?.[shaded.field] ?? [], shaded.threshold as number)
    : [];

  const first = rows[0].ts;
  const last = rows[rows.length - 1].ts;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 6, right: hasRight ? 8 : 12, bottom: 0, left: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3" vertical={false}
            stroke="currentColor" className="text-surface-border"
          />

          {/* Spells over the threshold, shaded the full height so "when was it
              too hot" is answered by looking rather than by tracing a line
              against an axis. */}
          {spans.map((s, i) => (
            <ReferenceArea
              key={`over-${i}`}
              x1={s.start} x2={s.end}
              fill="#ef4444" fillOpacity={0.12} strokeOpacity={0}
              ifOverflow="extendDomain"
            />
          ))}

          {/* Spray cycles. A band rather than a line, because a cycle has a
              DURATION — drawing it as an instant would make a five-minute run
              and a forty-second one look identical. Clipped to the chart's own
              window so a cycle that started before it does not stretch the
              axis back in time. */}
          {(sprayEvents ?? []).map((e, i) => {
            const start = Math.max(new Date(e.start_time).getTime(), first);
            const end = Math.min(new Date(e.end_time).getTime(), last);
            if (!(end > start)) return null;
            return (
              <ReferenceArea
                key={`spray-${i}`}
                x1={start} x2={end}
                fill="#0ea5e9" fillOpacity={0.22} strokeOpacity={0}
              />
            );
          })}

          <XAxis
            dataKey="ts" type="number" domain={["dataMin", "dataMax"]} scale="time"
            tick={{ fontSize: 11, fill: "currentColor" }} className="text-slate-500"
            stroke="currentColor" tickLine={false} axisLine={false} minTickGap={40}
            tickFormatter={(t: number) =>
              new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            }
          />
          <YAxis
            yAxisId="left" domain={leftDomain ?? ["auto", "auto"]}
            tick={{ fontSize: 11, fill: "currentColor" }} className="text-slate-500"
            stroke="currentColor" width={46} tickLine={false} axisLine={false}
            label={leftUnit ? {
              value: leftUnit, angle: -90, position: "insideLeft",
              style: { fontSize: 10, fill: "currentColor" },
            } : undefined}
          />
          {hasRight && (
            <YAxis
              yAxisId="right" orientation="right" domain={rightDomain ?? ["auto", "auto"]}
              tick={{ fontSize: 11, fill: "currentColor" }} className="text-slate-500"
              stroke="currentColor" width={44} tickLine={false} axisLine={false}
              label={rightUnit ? {
                value: rightUnit, angle: 90, position: "insideRight",
                style: { fontSize: 10, fill: "currentColor" },
              } : undefined}
            />
          )}

          <Tooltip
            labelFormatter={(t: number) => new Date(t).toLocaleString()}
            formatter={(v: number, name: string) => {
              const spec = specs.find((s) => s.label === name);
              return [`${v?.toFixed(1)} ${spec?.unit ?? ""}`, name];
            }}
            contentStyle={{ fontSize: 12, borderRadius: 8, padding: "6px 10px" }}
          />
          {specs.length > 1 && (
            <Legend
              verticalAlign="top" height={26}
              wrapperStyle={{ fontSize: 11, paddingBottom: 4 }}
            />
          )}

          {/* The threshold itself, so the shading explains what it means. */}
          {shaded?.threshold != null && (
            <ReferenceLine
              yAxisId={shaded.axis === "right" ? "right" : "left"}
              y={shaded.threshold}
              stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.75}
            />
          )}

          {specs.map((s) => (
            <Line
              key={s.field}
              yAxisId={s.axis === "right" ? "right" : "left"}
              dataKey={s.field} name={s.label}
              type="monotone" strokeWidth={1.8} dot={false}
              stroke={s.color}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              isAnimationActive={false} connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** The key for the bands above, for pages that draw them. */
export function ChartLegendHints({
  spray, threshold,
}: { spray?: boolean; threshold?: string }) {
  return (
    <span className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
      {threshold && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-2.5 rounded-sm bg-red-500/20" />
          {threshold}
        </span>
      )}
      {spray && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-2.5 rounded-sm bg-sky-500/30" />
          spraying
        </span>
      )}
    </span>
  );
}
