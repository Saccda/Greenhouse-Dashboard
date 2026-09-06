"use client";
/**
 * DiurnalChart — the average shape of the day, hour by hour, with a confidence
 * band showing how much that hour varies from one day to the next.
 *
 * The band is the point of the chart. A mean line alone implies far more
 * certainty than 7 days of data supports; the band shows the reader how much
 * day-to-day movement sits behind each point, and it is computed with the DAY
 * as the sampling unit (see analytics_service.diurnal_profile) rather than
 * pooling autocorrelated 30-second readings — which would have produced a band
 * roughly 12x too narrow on this data.
 *
 * Unobserved hours are dropped rather than interpolated: drawing a line across
 * the overnight shutdown would invent readings that were never taken.
 */
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { Diurnal } from "@/types/analytics";

interface Props {
  diurnal:   Diurnal;
  threshold: number;
  unit:      string;
  color:     string;
}

function DiurnalTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d || d.mean == null) return null;
  return (
    <div className="bg-surface-card border border-surface-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-300 font-mono-num">{String(label).padStart(2, "0")}:00</p>
      <p className="text-slate-200 font-mono-num font-semibold mt-0.5">
        {d.mean.toFixed(2)}{unit}
      </p>
      {d.ci_lower != null && (
        <p className="text-slate-500 font-mono-num mt-0.5">
          95% CI {d.ci_lower.toFixed(2)}–{d.ci_upper.toFixed(2)}
        </p>
      )}
      <p className="text-slate-600 mt-0.5">across {d.days} day{d.days === 1 ? "" : "s"}</p>
    </div>
  );
}

export default function DiurnalChart({ diurnal, threshold, unit, color }: Props) {
  // Only hours with data. Recharts needs the band as [lower, upper] pairs.
  const data = diurnal.hours
    .filter((h) => h.days > 0 && h.mean != null)
    .map((h) => ({
      hour: h.hour,
      mean: h.mean,
      days: h.days,
      ci_lower: h.ci_lower,
      ci_upper: h.ci_upper,
      band: h.ci_lower != null && h.ci_upper != null ? [h.ci_lower, h.ci_upper] : null,
    }));

  if (data.length === 0) {
    return <p className="text-sm text-slate-600 py-8 text-center">No hourly data in this period</p>;
  }

  const minDays = Math.min(...data.map((d) => d.days));
  const maxDays = Math.max(...data.map((d) => d.days));

  return (
    <div className="space-y-3">
      {/* 24px top margin leaves room for the threshold label; without it the
          label is clipped by the plot area's edge. */}
      <ResponsiveContainer width="100%" height={250}>
        <ComposedChart data={data} margin={{ top: 24, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="hour"
            tickFormatter={(h) => `${String(h).padStart(2, "0")}`}
            tick={{ fill: "#8b9eb3", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            height={28}
            label={{ value: "hour of day", position: "insideBottomRight", offset: 0, fill: "#8b9eb3", fontSize: 11 }}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fill: "#8b9eb3", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v) => `${v}${unit}`}
          />
          <Tooltip content={<DiurnalTooltip unit={unit} />} />

          {/* Confidence band first so the mean line reads on top of it. */}
          <Area
            dataKey="band"
            stroke="none"
            fill={color}
            fillOpacity={0.18}
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            dataKey="mean"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
            connectNulls={false}
          />
          <ReferenceLine
            y={threshold}
            stroke="var(--chart-critical)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{
              value: `threshold ${threshold}${unit}`,
              position: "insideTopLeft", offset: 6,
              fill: "var(--chart-critical)", fontSize: 11, fontWeight: 600,
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-xs text-slate-400 leading-relaxed">
        The line is each hour&apos;s average; the shaded band shows how much that hour
        swings from one day to the next ({(diurnal.confidence * 100).toFixed(0)}% confidence,
        from {minDays === maxDays ? `${minDays} days` : `${minDays}–${maxDays} days`} of readings per hour).
        A wide band means that hour is unpredictable; a narrow one means it behaves the same way daily.
      </p>
      <p className="text-xs text-slate-500 leading-relaxed">
        The band is calculated across <strong>days</strong>, not across individual readings — readings
        30 seconds apart are nearly identical, and treating them as independent would have made this
        band about 12× too narrow. Hours with no data are left out rather than drawn through.
      </p>
    </div>
  );
}
