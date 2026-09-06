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
// 48px of head-room so the threshold and median labels can sit on two separate
// rows. They routinely land on almost the same value (humidity's median 69.5
// against a 70% threshold), and on one row they overprinted each other.
const CHART_MARGIN = { top: 48, right: PLOT_RIGHT, bottom: 4, left: 0 };

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

          {/* Two rows of labels: threshold on the upper row, median on the
              lower one. Fixed rows rather than collision detection, because
              these two lines can sit at practically the same x and any
              same-row arrangement would overprint. */}
          <ReferenceLine
            x={threshold}
            stroke="var(--chart-critical)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{
              value: `threshold ${threshold}${unit}`,
              position: "top", offset: 26,
              fill: "var(--chart-critical)", fontSize: 12, fontWeight: 600,
            }}
          />
          <ReferenceLine
            x={describe.median}
            stroke="#94a3b8"
            strokeWidth={1.5}
            label={{
              value: `median ${describe.median.toFixed(1)}${unit}`,
              position: "top", offset: 6,
              fill: "#94a3b8", fontSize: 12,
            }}
          />
        </BarChart>
      </ResponsiveContainer>

      <BoxPlotStrip
        describe={describe}
        domain={[domainLo, domainHi]}
        unit={unit}
        color={color}
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
 * A proper Tukey box plot, drawn on the histogram's own x-scale and inset to
 * its plot area so the two line up vertically.
 *
 * Anatomy, all labelled at its true position rather than in a separate list:
 *   whisker ends  most extreme readings still inside the 1.5·IQR fences
 *   box           Q1 → Q3 (the middle half of readings)
 *   centre line   median
 *   outlier zone  readings beyond a fence, shown as a tinted end-stub with a
 *                 count, since we hold summary statistics rather than the raw
 *                 points needed to plot them individually
 *
 * Labels alternate between two rows — Q1/Q3 on the lower row, whiskers and the
 * median on the upper one — so neighbouring landmarks can never overprint each
 * other however tightly the distribution is packed.
 */
function BoxPlotStrip({
  describe, domain, unit, color,
}: {
  describe: Describe;
  domain: [number, number];
  unit: string;
  color: string;
}) {
  const [lo, hi] = domain;
  const span = hi - lo || 1;
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - lo) / span) * 100));

  const hasLowOutliers = describe.outliers_low > 0;
  const hasHighOutliers = describe.outliers_high > 0;

  // Upper row: whisker ends + median. Lower row: the quartiles. Alternating
  // guarantees adjacent landmarks never share a row.
  const upper = [
    { key: "min-in", label: "Min", value: describe.whisker_low },
    { key: "median", label: "Median", value: describe.median, strong: true },
    { key: "max-in", label: "Max", value: describe.whisker_high },
  ];
  const lower = [
    { key: "q1", label: "Q1", value: describe.p25 },
    { key: "q3", label: "Q3", value: describe.p75 },
  ];

  const Tick = ({ label, value, strong }: { label: string; value: number; strong?: boolean }) => (
    <div
      className="absolute -translate-x-1/2 text-center whitespace-nowrap"
      style={{ left: `${pos(value)}%` }}
    >
      <span className="block text-[11px] uppercase tracking-wide text-slate-500 leading-none">{label}</span>
      <span className={clsx(
        "block font-mono-num tabular-nums leading-tight mt-0.5",
        strong ? "text-sm font-bold text-slate-100" : "text-xs text-slate-300",
      )}>
        {value.toFixed(1)}{unit}
      </span>
    </div>
  );

  return (
    <div>
      <div style={{ marginLeft: PLOT_LEFT, marginRight: PLOT_RIGHT }}>
        <div
          className="relative h-11"
          role="img"
          aria-label={
            `Box plot: whiskers ${describe.whisker_low.toFixed(1)} to ${describe.whisker_high.toFixed(1)}${unit}, ` +
            `Q1 ${describe.p25.toFixed(1)}, median ${describe.median.toFixed(1)}, Q3 ${describe.p75.toFixed(1)}${unit}, ` +
            `${describe.outliers_low + describe.outliers_high} outliers`
          }
        >
          {/* Outlier stubs — readings beyond a fence live out here */}
          {hasLowOutliers && (
            <div className="absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-amber-500/50"
              style={{ left: 0, width: `${pos(describe.whisker_low)}%` }} />
          )}
          {hasHighOutliers && (
            <div className="absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-amber-500/50"
              style={{ left: `${pos(describe.whisker_high)}%`, right: 0 }} />
          )}

          {/* Whisker spanning the non-outlier range */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-[2px] bg-slate-400"
            style={{
              left: `${pos(describe.whisker_low)}%`,
              width: `${pos(describe.whisker_high) - pos(describe.whisker_low)}%`,
            }}
          />
          {[describe.whisker_low, describe.whisker_high].map((v) => (
            <div key={v} className="absolute top-1/2 -translate-y-1/2 h-3.5 w-[2px] bg-slate-400"
              style={{ left: `${pos(v)}%` }} />
          ))}

          {/* Interquartile box */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-7 rounded-md ring-1 ring-black/10"
            style={{
              left: `${pos(describe.p25)}%`,
              width: `${pos(describe.p75) - pos(describe.p25)}%`,
              backgroundColor: color,
              opacity: 0.5,
            }}
          />
          {/* Median */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-8 w-[2.5px] bg-slate-100 rounded-full"
            style={{ left: `${pos(describe.median)}%` }}
          />
        </div>

        {/* Direct labels, staggered across two rows */}
        <div className="relative h-8 mt-1">
          {upper.map((t) => (
            <Tick key={t.key} label={t.label} value={t.value} strong={t.strong} />
          ))}
        </div>
        <div className="relative h-8">
          {lower.map((t) => (
            <Tick key={t.key} label={t.label} value={t.value} />
          ))}
        </div>
      </div>

      <p className="text-sm text-slate-500 mt-2 leading-relaxed">
        The box holds the middle half of readings (Q1&nbsp;{describe.p25.toFixed(1)}{unit} to
        Q3&nbsp;{describe.p75.toFixed(1)}{unit}); the line inside it is the median. Whiskers reach the
        furthest readings within 1.5&nbsp;×&nbsp;IQR of the box.
        {(hasLowOutliers || hasHighOutliers) ? (
          <>
            {" "}The amber stub{hasLowOutliers && hasHighOutliers ? "s mark" : " marks"}{" "}
            <span className="text-amber-500 font-semibold">
              {(describe.outliers_low + describe.outliers_high).toLocaleString()} outlier
              {describe.outliers_low + describe.outliers_high === 1 ? "" : "s"}
            </span>{" "}
            beyond that range
            {hasLowOutliers && ` (${describe.outliers_low.toLocaleString()} below ${describe.lower_fence.toFixed(1)}${unit}`}
            {hasLowOutliers && hasHighOutliers && ", "}
            {!hasLowOutliers && hasHighOutliers && " ("}
            {hasHighOutliers && `${describe.outliers_high.toLocaleString()} above ${describe.upper_fence.toFixed(1)}${unit}`}
            {(hasLowOutliers || hasHighOutliers) && ")"}, reaching{" "}
            <span className="font-mono-num text-slate-400">
              {describe.min.toFixed(1)}–{describe.max.toFixed(1)}{unit}
            </span> in total.
          </>
        ) : (
          <> No readings fell outside those fences.</>
        )}
      </p>
    </div>
  );
}
