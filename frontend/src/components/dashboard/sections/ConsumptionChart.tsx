"use client";
/**
 * Consumption over time, as bars.
 *
 * Bars rather than a line because consumption is a quantity USED within a
 * bucket, not a level measured at an instant. A line between two daily totals
 * implies the value passed through everything in between, which is meaningless
 * for a figure that only exists once a day is over.
 *
 * The most recent bar is drawn in full colour and the rest muted, so "how does
 * today compare" is answered by looking. A bucket still filling is marked, so
 * a part-finished day is not read as a drop in usage — which is the one
 * mistake this chart could otherwise make every morning.
 */
import {
  Bar, BarChart, CartesianGrid, Cell, Label, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

/**
 * Axis captions.
 *
 * Both axes carried bare numbers: a row of times along the bottom and a column
 * of figures up the side, with the only statement of what either MEANT sitting
 * in the card's subtitle, in a different unit and a different sentence. A
 * reader who starts at the chart — which is most of them, since it is the
 * largest thing on the card — had to work backwards to find out they were
 * looking at cubic metres per day rather than a running total.
 *
 * They are drawn from currentColor so they theme with everything else; the
 * class sets the colour and the fill resolves it. A fill-slate-500 would
 * reach past the themed text scale into raw Tailwind and come out wrong in
 * light mode.
 *
 * The same three lines exist in OverlayChart, which captions a line chart the
 * same way. Kept separate rather than shared because this component is on the
 * main dashboard and that one is not, and importing it would pull the whole
 * line chart into that bundle for three lines of style.
 */
const AXIS_LABEL = {
  className: "text-slate-500",
  style: { fontSize: 10, fill: "currentColor" } as const,
};

export interface Bucket {
  /** Epoch ms for the start of the bucket. */
  ts: number;
  value: number | null;
  /** True when this bucket has not finished yet. */
  partial?: boolean;
}

export default function ConsumptionChart({
  buckets, unit, color, height, labelFormat, empty, xLabel, yLabel, showZeros,
}: {
  /**
   * Draw a measured zero as a thin line, so it reads differently from a
   * bucket with no data. Without it the two are the same blank space, and a
   * meter that reported "0 m³" every day looked like a chart that failed to
   * load.
   */
  showZeros?: boolean;
  buckets: Bucket[];
  unit: string;
  color: string;
  /** What the bottom axis counts along — "Hour", "Day". */
  xLabel?: string;
  /** What a bar's height is, unit included — "Water used (m³)". */
  yLabel?: string;
  /**
   * Omit it to fill the card instead. The dashboard leaves it off so the two
   * charts stretch to match the photograph beside them — a fixed height there
   * left a band of empty card under each one, which is the same bare gap this
   * layout was trying to close, just moved inside a border.
   */
  height?: number;
  labelFormat: (ts: number) => string;
  empty: string;
}) {
  const withValues = buckets.filter((b) => b.value != null);
  // min-height so a short card cannot squeeze the plot into nothing.
  const box = height != null
    ? { style: { height }, className: "" }
    : { style: undefined, className: "flex-1 min-h-[170px]" };

  if (withValues.length === 0) {
    return (
      <div style={box.style} className={`grid place-items-center ${box.className}`}>
        <p className="text-[12px] text-slate-500 text-center px-4">{empty}</p>
      </div>
    );
  }

  const lastIndex = buckets.length - 1;

  return (
    <div style={box.style} className={box.className}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor"
            className="text-surface-border" />
          <XAxis
            dataKey="ts"
            tick={{ fontSize: 10, fill: "currentColor" }}
            className="text-slate-500"
            stroke="currentColor"
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tickFormatter={labelFormat}
            // The caption lives inside the axis band rather than in the chart
            // margin, so switching it on cannot shift the plot area under it.
            height={xLabel ? 44 : 30}
          >
            {/* The offset is clearance for DESCENDERS. Recharts puts an
                insideBottom label's BASELINE at the bottom edge of the band,
                which here is the bottom edge of the SVG, so at offset 0 the
                tail of the "y" in "Day" fell outside the viewport and was
                clipped off. Six pixels at 10px type clears any descender. */}
            {xLabel && (
              <Label value={xLabel} position="insideBottom" offset={6} {...AXIS_LABEL} />
            )}
          </XAxis>
          <YAxis
            tick={{ fontSize: 10, fill: "currentColor" }}
            className="text-slate-500"
            stroke="currentColor"
            tickLine={false}
            axisLine={false}
            width={yLabel ? 56 : 38}
          >
            {yLabel && (
              <Label
                value={yLabel}
                angle={-90}
                position="insideLeft"
                offset={4}
                {...AXIS_LABEL}
                style={{ ...AXIS_LABEL.style, textAnchor: "middle" }}
              />
            )}
          </YAxis>
          <Tooltip
            cursor={{ fill: "currentColor", className: "text-surface-hover", opacity: 0.4 }}
            labelFormatter={(ts: number) => labelFormat(ts)}
            formatter={(v, _n, p) =>
              typeof v !== "number"
                ? ["—", "no report"]
                : [
                    `${v.toFixed(v >= 100 ? 0 : 1)} ${unit}`,
                    (p?.payload as Bucket)?.partial ? "so far" : "used",
                  ]
            }
            contentStyle={{ fontSize: 12, borderRadius: 8, padding: "6px 10px" }}
          />
          <Bar
            dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}
            minPointSize={showZeros ? (v) => (v === 0 ? 2 : 0) : undefined}
          >
            {buckets.map((b, i) => (
              <Cell
                key={i}
                fill={color}
                // The latest bucket full strength, earlier ones muted, and a
                // bucket still filling fainter still so it is not compared
                // like for like against finished ones.
                fillOpacity={b.partial ? 0.35 : i === lastIndex ? 1 : 0.45}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
