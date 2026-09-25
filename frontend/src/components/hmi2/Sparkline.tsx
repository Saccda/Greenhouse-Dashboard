"use client";
import { HMI } from "./tokens";

/**
 * A few hours of history beside the current value.
 *
 * ISA-101's "depict information, not data": a number on its own is a
 * measurement, but a number next to where it has just been is a situation.
 * 31.4 °C says nothing; 31.4 °C after an hour of climbing says a great deal,
 * and it is the difference between noticing a problem and reading about it in
 * an alarm ten minutes later.
 *
 * Deliberately tiny and axis-less. It is not a chart to read values off — the
 * Trends view is for that — it is a shape to glance at.
 */
export default function Sparkline({
  points, min, max, band,
}: {
  points: (number | null)[];
  min: number;
  max: number;
  /** The control band, drawn as a quiet region so "outside" is a position. */
  band?: { low: number; high: number } | null;
}) {
  const w = 100;
  const h = 22;
  const known = points.filter((p): p is number => p != null);

  if (known.length < 2) {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[22px]">
        <rect width={w} height={h} fill={HMI.panelAlt} />
        <text x={w / 2} y={h / 2 + 3} textAnchor="middle" fontSize="7" fill={HMI.inkFaint} letterSpacing="1">
          NO HISTORY
        </text>
      </svg>
    );
  }

  const y = (v: number) => h - ((v - min) / (max - min)) * h;
  const step = w / (points.length - 1);

  // Breaks in the line where data is missing, rather than a straight segment
  // bridging a gap — an invented line across an outage is the chart telling a
  // story that did not happen.
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((p, i) => {
    if (p == null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${current.length ? "L" : "M"} ${(i * step).toFixed(1)} ${y(p).toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current.join(" "));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[22px]" preserveAspectRatio="none">
      <rect width={w} height={h} fill={HMI.panelAlt} />
      {band && (
        <rect
          x={0}
          y={y(band.high)}
          width={w}
          height={Math.max(1, y(band.low) - y(band.high))}
          fill={HMI.panel}
        />
      )}
      {segments.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={HMI.inkMuted} strokeWidth={1.25}
              vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
