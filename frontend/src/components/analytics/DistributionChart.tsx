"use client";
/**
 * DistributionChart — the empirical distribution as a histogram, with the
 * threshold and the median marked, plus a box-plot strip underneath.
 *
 * Why this earns its place next to the mean: a mean of 32 °C is produced both
 * by a steady 32 °C all day and by a day that swings 26–37 °C, and those call
 * for completely different decisions. The shape is the information.
 *
 * Single series, so no legend — the section title names it. Reference lines are
 * directly labelled rather than relying on colour.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { clsx } from "clsx";
import type { Histogram, Describe } from "@/types/analytics";

interface Props {
  histogram: Histogram;
  describe:  Describe;
  threshold: number;
  unit:      string;
  color:     string;   // CSS var for the parameter's identity colour
}

function BinTooltip({ active, payload, unit }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-surface-card border border-surface-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-300 font-mono-num">
        {d.start.toFixed(1)}–{d.end.toFixed(1)}{unit}
      </p>
      <p className="text-slate-400 mt-0.5">
        <span className="font-mono-num font-semibold text-slate-200">{d.count.toLocaleString()}</span> readings
        {" · "}
        <span className="font-mono-num">{(d.fraction * 100).toFixed(1)}%</span>
      </p>
    </div>
  );
}

export default function DistributionChart({ histogram, describe, threshold, unit, color }: Props) {
  const data = histogram.bins.map((b) => ({ ...b, label: b.mid }));

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="mid"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) => `${v.toFixed(0)}`}
            tick={{ fill: "#6b7280", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            label={{ value: unit, position: "insideBottomRight", offset: -2, fill: "#6b7280", fontSize: 10 }}
          />
          <YAxis
            tick={{ fill: "#6b7280", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
            label={{ value: "readings", angle: -90, position: "insideLeft", fill: "#6b7280", fontSize: 10 }}
          />
          <Tooltip content={<BinTooltip unit={unit} />} cursor={{ fill: "rgba(128,128,128,0.08)" }} />

          {/* Bars above the threshold are tinted with the critical colour so the
              exceedance mass is visible at a glance, not just countable. */}
          <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.mid} fill={d.mid > threshold ? "var(--chart-critical)" : color} />
            ))}
          </Bar>

          <ReferenceLine
            x={threshold}
            stroke="var(--chart-critical)"
            strokeDasharray="4 3"
            label={{ value: `threshold ${threshold}${unit}`, position: "top", fill: "#9ca3af", fontSize: 10 }}
          />
          <ReferenceLine
            x={describe.median}
            stroke="#9ca3af"
            strokeDasharray="2 2"
            label={{ value: `median ${describe.median.toFixed(1)}`, position: "insideTopLeft", fill: "#9ca3af", fontSize: 10 }}
          />
        </BarChart>
      </ResponsiveContainer>

      <BoxPlotStrip describe={describe} unit={unit} color={color} />

      <p className="text-[11px] text-slate-600 leading-relaxed">
        Bin width chosen by the Freedman–Diaconis rule ({histogram.bin_width.toFixed(2)}{unit}), which
        scales with the interquartile range and sample size so a few extreme readings can&apos;t distort the binning.
      </p>
    </div>
  );
}

/**
 * Box-plot strip: p05 — p25 — median — p75 — p95 drawn to scale.
 * Shows spread and skew in one line, directly comparable to the histogram above
 * because it shares its horizontal scale.
 */
function BoxPlotStrip({ describe, unit, color }: { describe: Describe; unit: string; color: string }) {
  const lo = describe.min;
  const hi = describe.max;
  const span = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / span) * 100;

  return (
    <div className="pt-1">
      <div className="relative h-10">
        {/* p05–p95 whisker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-[2px] bg-slate-600"
          style={{ left: `${pos(describe.p05)}%`, width: `${pos(describe.p95) - pos(describe.p05)}%` }}
        />
        {/* IQR box */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-5 rounded-sm opacity-70"
          style={{
            left: `${pos(describe.p25)}%`,
            width: `${pos(describe.p75) - pos(describe.p25)}%`,
            backgroundColor: color,
          }}
        />
        {/* Median */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-7 w-[2px] bg-slate-100"
          style={{ left: `${pos(describe.median)}%` }}
        />
      </div>
      {/* Only min/max are axis labels — they genuinely sit at the strip's ends,
          since the strip spans exactly min..max. The percentiles are listed as
          a readout below rather than as positioned labels: at this width they
          would collide, and spacing them evenly would imply positions that
          don't match where their marks actually are. */}
      <div className="flex justify-between text-[10px] text-slate-600 font-mono-num">
        <span>min {describe.min.toFixed(1)}{unit}</span>
        <span>max {describe.max.toFixed(1)}{unit}</span>
      </div>
      <dl className="mt-2 grid grid-cols-5 gap-1 text-center">
        {([
          ["p05", describe.p05], ["p25", describe.p25], ["median", describe.median],
          ["p75", describe.p75], ["p95", describe.p95],
        ] as const).map(([k, v]) => (
          <div key={k} className="bg-surface-hover rounded px-1 py-1">
            <dt className="text-[9px] uppercase tracking-wider text-slate-600">{k}</dt>
            <dd className={clsx(
              "text-[11px] font-mono-num",
              k === "median" ? "text-slate-200 font-semibold" : "text-slate-400",
            )}>
              {v.toFixed(1)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
