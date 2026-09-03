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

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 8, right: 14, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="hour"
            tickFormatter={(h) => `${String(h).padStart(2, "0")}`}
            tick={{ fill: "#6b7280", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            label={{ value: "hour of day", position: "insideBottomRight", offset: -2, fill: "#6b7280", fontSize: 10 }}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fill: "#6b7280", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={44}
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
            strokeDasharray="4 3"
            label={{ value: `threshold ${threshold}${unit}`, position: "right", fill: "#9ca3af", fontSize: 10 }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-[11px] text-slate-600 leading-relaxed">
        Line is the mean for each hour; shaded band is the{" "}
        {(diurnal.confidence * 100).toFixed(0)}% confidence interval computed <strong>across days</strong>{" "}
        (n = {minDays}
        {minDays === 1 ? " day" : "–" + Math.max(...data.map((d) => d.days)) + " days"} per hour), so it
        reflects genuine day-to-day variation rather than the illusory precision of treating
        every 30-second reading as independent. Hours with no data are omitted, not interpolated.
      </p>
    </div>
  );
}
