"use client";
/**
 * The compact chart that sits inside a section card.
 *
 * A real chart, not a sparkline: axes, gridlines and a tooltip, just sized to
 * a card. A sparkline shows a shape; this has to answer "how hot did it get,
 * and when", which needs numbers on the edges.
 *
 * Takes a list of series rather than fixed props, so one component draws
 * ambient (two series, two units), tank temperature (one), spray activity (one
 * on/off) and whatever soil turns out to be. Each series brings its own axis
 * side and range.
 *
 * Gaps are drawn as gaps. A line joined straight through a dead feed invents
 * readings nobody took, and on this project a feed has been dead for eighteen
 * days without anyone noticing.
 */
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export interface ChartSeries {
  key: string;
  label: string;
  unit: string;
  /** Which axis this belongs to — two units need two scales. */
  axis: "left" | "right";
  color: string;
  domain?: [number | "auto", number | "auto"];
  /** Draw as steps, for a channel that is on or off rather than a reading. */
  step?: boolean;
}

export interface ChartRow {
  ts: number;
  [key: string]: number | null | undefined;
}

export default function SectionChart({
  data, series, height = 180, empty,
}: {
  data: ChartRow[];
  series: ChartSeries[];
  height?: number;
  empty?: string;
}) {
  const hasAny = series.some((s) => data.some((d) => d[s.key] != null));

  if (!hasAny) {
    return (
      <div style={{ height }} className="grid place-items-center">
        <p className="text-[12px] text-slate-500 text-center px-4">
          {empty ?? "No readings stored for this range."}
        </p>
      </div>
    );
  }

  const usesRight = series.some((s) => s.axis === "right");

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: usesRight ? 4 : 10, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.18} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.01} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="currentColor"
            className="text-surface-border"
          />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tick={{ fontSize: 10, fill: "currentColor" }}
            className="text-slate-500"
            stroke="currentColor"
            tickLine={false}
            minTickGap={44}
            tickFormatter={(t: number) =>
              new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            }
          />
          <YAxis
            yAxisId="left"
            domain={series.find((s) => s.axis === "left")?.domain ?? ["auto", "auto"]}
            tick={{ fontSize: 10, fill: "currentColor" }}
            className="text-slate-500"
            stroke="currentColor"
            tickLine={false}
            axisLine={false}
            width={32}
          />
          {usesRight && (
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={series.find((s) => s.axis === "right")?.domain ?? ["auto", "auto"]}
              tick={{ fontSize: 10, fill: "currentColor" }}
              className="text-slate-500"
              stroke="currentColor"
              tickLine={false}
              axisLine={false}
              width={30}
            />
          )}
          <Tooltip
            labelFormatter={(t: number) => new Date(t).toLocaleString()}
            formatter={(v: number, name: string) => {
              const s = series.find((x) => x.label === name);
              return [v == null ? "—" : `${v.toFixed(1)} ${s?.unit ?? ""}`, name];
            }}
            contentStyle={{ fontSize: 12, borderRadius: 8, padding: "6px 10px" }}
          />
          {series.map((s) => (
            <Area
              key={s.key}
              yAxisId={s.axis}
              name={s.label}
              dataKey={s.key}
              type={s.step ? "stepAfter" : "monotone"}
              stroke={s.color}
              strokeWidth={1.8}
              fill={`url(#fill-${s.key})`}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Merge several series onto one time axis without one's gaps shifting another. */
export function toRows(
  parts: { key: string; points: { time: string; value: number | null }[] }[],
): ChartRow[] {
  const rows = new Map<number, ChartRow>();
  for (const { key, points } of parts) {
    for (const p of points) {
      const ts = new Date(p.time).getTime();
      rows.set(ts, { ...(rows.get(ts) ?? { ts }), [key]: p.value ?? null });
    }
  }
  return [...rows.values()].sort((a, b) => a.ts - b.ts);
}
