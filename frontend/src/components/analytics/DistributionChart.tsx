"use client";
/**
 * DistributionChart — the empirical distribution as a histogram, with the
 * exceedance zone shaded, plus a box-plot strip aligned to the same x-scale.
 *
 * Why this earns its place next to the mean: a mean of 32 °C is produced both
 * by a steady 32 °C day and by a day swinging 26–37 °C, and those call for
 * different decisions. The shape is the information.
 *
 * Two deliberate choices, both previously got wrong:
 *
 *  1. ONE colour for the bars. Tinting bars above the threshold red mixed the
 *     parameter's identity colour with a reserved status colour inside a single
 *     series, and when most readings sit above the threshold it rendered as a
 *     wall of red — alarming rather than informative. The exceedance region is
 *     now a shaded background band, so the distribution keeps one identity and
 *     the threshold stays legible as context.
 *
 *  2. The box plot shares the histogram's exact x-scale and plot-area insets.
 *     Sitting it under the chart implies the positions line up, so they have to
 *     actually line up — it uses the same [dataMin, dataMax] bin-midpoint domain
 *     and the same left/right margins as the Recharts plot area.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea,
} from "recharts";
import { clsx } from "clsx";
import type { Histogram, Describe } from "@/types/analytics";

// Kept in sync with the Recharts <BarChart> margin + YAxis width below, so the
// box plot underneath can be inset to match the plot area exactly.
const PLOT_LEFT = 48;
const PLOT_RIGHT = 16;
const CHART_MARGIN = { top: 28, right: PLOT_RIGHT, bottom: 4, left: 0 };

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
      <p className="text-slate-200 font-mono-num font-semibold">
        {d.start.toFixed(1)}–{d.end.toFixed(1)}{unit}
      </p>
      <p className="text-slate-400 mt-1">
        <span className="font-mono-num font-semibold text-slate-200">{d.count.toLocaleString()}</span> readings
        {" · "}
        <span className="font-mono-num">{(d.fraction * 100).toFixed(1)}%</span> of total
      </p>
    </div>
  );
}

export default function DistributionChart({ histogram, describe, threshold, unit, color }: Props) {
  const data = histogram.bins.map((b) => ({ ...b }));
  const domainLo = data[0].mid;
  const domainHi = data[data.length - 1].mid;

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />

          {/* Exceedance zone as recessive context, not as a second series. */}
          {threshold < domainHi && (
            <ReferenceArea
              x1={threshold}
              x2={domainHi}
              fill="var(--chart-critical)"
              fillOpacity={0.07}
              ifOverflow="extendDomain"
            />
          )}

          <XAxis
            dataKey="mid"
            type="number"
            domain={[domainLo, domainHi]}
            tickFormatter={(v) => `${v.toFixed(0)}`}
            tick={{ fill: "#8b9eb3", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            height={28}
            label={{ value: unit, position: "insideBottomRight", offset: 0, fill: "#8b9eb3", fontSize: 11 }}
          />
          <YAxis
            tick={{ fill: "#8b9eb3", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={PLOT_LEFT}
            label={{ value: "readings", angle: -90, position: "insideLeft", fill: "#8b9eb3", fontSize: 11 }}
          />
          <Tooltip content={<BinTooltip unit={unit} />} cursor={{ fill: "rgba(128,128,128,0.10)" }} />

          <Bar dataKey="count" radius={[3, 3, 0, 0]} fill={color} isAnimationActive={false} />

          {/* Labels sit in the 28px top margin, so they can't be clipped. */}
          <ReferenceLine
            x={threshold}
            stroke="var(--chart-critical)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{
              value: `threshold ${threshold}${unit}`,
              position: "top", offset: 8,
              fill: "var(--chart-critical)", fontSize: 11, fontWeight: 600,
            }}
          />
          <ReferenceLine
            x={describe.median}
            stroke="#94a3b8"
            strokeWidth={1.5}
            label={{
              value: `median ${describe.median.toFixed(1)}`,
              position: "top", offset: 8,
              fill: "#94a3b8", fontSize: 11,
            }}
          />
        </BarChart>
      </ResponsiveContainer>

      <BoxPlotStrip
        describe={describe}
        domain={[domainLo, domainHi]}
        unit={unit}
        color={color}
        threshold={threshold}
      />

      <p className="text-xs text-slate-500 leading-relaxed pt-1">
        Shaded area marks readings above the {threshold}{unit} threshold.
        Bars are binned by the Freedman–Diaconis rule ({histogram.bin_width.toFixed(2)}{unit} wide),
        which scales with spread and sample size so a few extremes can&apos;t distort the shape.
      </p>
    </div>
  );
}

/**
 * Box-plot strip: p05 — p25 — median — p75 — p95, drawn on the histogram's own
 * x-scale and inset to its plot area so the two line up vertically.
 *
 * Values outside the histogram's bin-midpoint domain are clamped rather than
 * overflowing the strip — p05/p95 can fall slightly beyond the first/last bin
 * midpoint by construction.
 */
function BoxPlotStrip({
  describe, domain, unit, color, threshold,
}: {
  describe: Describe;
  domain: [number, number];
  unit: string;
  color: string;
  threshold: number;
}) {
  const [lo, hi] = domain;
  const span = hi - lo || 1;
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - lo) / span) * 100));

  return (
    <div>
      <div style={{ marginLeft: PLOT_LEFT, marginRight: PLOT_RIGHT }}>
        <div className="relative h-9" role="img"
          aria-label={`Spread: p05 ${describe.p05.toFixed(1)}, p25 ${describe.p25.toFixed(1)}, median ${describe.median.toFixed(1)}, p75 ${describe.p75.toFixed(1)}, p95 ${describe.p95.toFixed(1)} ${unit}`}>
          {/* p05–p95 whisker */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-[2px] bg-slate-500"
            style={{ left: `${pos(describe.p05)}%`, width: `${pos(describe.p95) - pos(describe.p05)}%` }}
          />
          {/* whisker end caps — make the p05/p95 positions readable */}
          {[describe.p05, describe.p95].map((v, i) => (
            <div key={i} className="absolute top-1/2 -translate-y-1/2 h-3 w-[2px] bg-slate-500"
              style={{ left: `${pos(v)}%` }} />
          ))}
          {/* IQR box — where the middle half of readings sat */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-6 rounded"
            style={{
              left: `${pos(describe.p25)}%`,
              width: `${pos(describe.p75) - pos(describe.p25)}%`,
              backgroundColor: color,
              opacity: 0.55,
            }}
          />
          {/* median */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-7 w-[2px] bg-slate-100"
            style={{ left: `${pos(describe.median)}%` }}
          />
        </div>
      </div>

      {/* Percentiles as an INLINE list, deliberately not a 5-column grid.
          A grid beneath the strip reads as an axis, and evenly-spaced columns
          would point at positions the marks don't actually occupy (p05 sits
          ~40% across, not at the far left). An inline run carries no positional
          claim at all. */}
      <dl className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 mt-2 pl-1">
        {([
          ["p05", describe.p05], ["p25", describe.p25], ["median", describe.median],
          ["p75", describe.p75], ["p95", describe.p95],
        ] as const).map(([k, v], i) => (
          <span key={k} className="inline-flex items-baseline gap-1">
            {i > 0 && <span className="text-slate-700 mr-1">·</span>}
            <dt className="text-[11px] uppercase tracking-wider text-slate-500">{k}</dt>
            <dd className={clsx(
              "font-mono-num tabular-nums",
              k === "median" ? "text-sm text-slate-100 font-bold" : "text-xs text-slate-300",
              v > threshold && k !== "median" && "text-amber-500",
            )}>
              {v.toFixed(1)}{unit}
            </dd>
          </span>
        ))}
      </dl>
      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
        The bar spans the middle half of readings (p25–p75); the line through it is the median.
        Whiskers reach the 5th and 95th percentiles — on the worst 5% of readings it was above{" "}
        <span className="font-mono-num text-slate-400">{describe.p95.toFixed(1)}{unit}</span>.
      </p>
    </div>
  );
}
