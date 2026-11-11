/**
 * Maths for turning sensor series into things a person can act on.
 *
 * These lived inside the section page while there was one layout for every
 * domain. The four pages have their own shapes now and all of them need this,
 * so it moved here rather than being imported out of a page component.
 *
 * The recurring idea: a gap in the feed is not a reading. Every function here
 * either skips nulls or treats a gap as unknown, because the alternative —
 * interpolating across a dead feed — invents measurements nobody took, and
 * this project has already lost eighteen days to silence that looked like
 * data.
 */
import type { TimePoint } from "@/types";

/** Typical spacing between readings. Median, so one long gap does not set it. */
export function medianGap(points: TimePoint[]): number | null {
  if (points.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 1; i < points.length; i++) {
    gaps.push(new Date(points[i].time).getTime() - new Date(points[i - 1].time).getTime());
  }
  gaps.sort((a, b) => a - b);
  const m = gaps[Math.floor(gaps.length / 2)];
  return m > 0 ? m : null;
}

/**
 * Unbroken spells at or above a threshold, as {start, end} in epoch ms.
 *
 * A span closes at the LAST reading still over, not at the first one under:
 * shading forward to a reading that was already back in range would overstate
 * how long the greenhouse was too hot, and this figure is also printed as
 * "Too hot for 2 h 40 min".
 */
export function exceedSpans(
  points: TimePoint[], threshold: number,
): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  let start: number | null = null;
  let lastOver: number | null = null;

  for (const p of points) {
    const ts = new Date(p.time).getTime();
    const over = p.value != null && p.value >= threshold;
    if (over) {
      if (start == null) start = ts;
      lastOver = ts;
    } else if (start != null && lastOver != null) {
      spans.push({ start, end: lastOver });
      start = null;
      lastOver = null;
    }
  }
  if (start != null && lastOver != null) spans.push({ start, end: lastOver });

  // A single sample over the line has zero width and would not draw at all.
  // Give it one reading's width so a brief spike is still visible.
  const gap = medianGap(points) ?? 60_000;
  return spans.map((s) => (s.end === s.start ? { start: s.start, end: s.start + gap } : s));
}

/** Minutes spent at or above a threshold, from the spans above. */
export function minutesOver(points: TimePoint[], threshold: number): number {
  return exceedSpans(points, threshold).reduce((s, w) => s + (w.end - w.start) / 60_000, 0);
}

export function extreme(
  points: TimePoint[], which: "min" | "max",
): { value: number; time: string } | null {
  let best: { value: number; time: string } | null = null;
  for (const p of points) {
    if (p.value == null) continue;
    if (!best || (which === "min" ? p.value < best.value : p.value > best.value)) {
      best = { value: p.value, time: p.time };
    }
  }
  return best;
}

/** A reading that has not moved at all is almost never a steady reading. */
export function isStuck(values: number[]): boolean {
  if (values.length < 20) return false;
  return values.every((v) => v === values[0]);
}

/** Share of the period that actually has readings, or null when unknowable. */
export function coverage(points: TimePoint[]): number | null {
  if (points.length < 3) return null;
  const gap = medianGap(points);
  if (!gap) return null;
  const span = new Date(points[points.length - 1].time).getTime()
    - new Date(points[0].time).getTime();
  const expected = span / gap + 1;
  return expected > 0 ? Math.min(1, points.length / expected) : null;
}

export const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

export const at = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const RANGE_PHRASE: Record<string, string> = {
  "-1h": "last hour", "-6h": "last 6 h", "-12h": "last 12 h", "-24h": "last 24 h",
  "-3d": "last 3 days", "-7d": "last 7 days", "-30d": "last 30 days",
};

/** How a range reads in a sentence: "in the last 24 h". */
export const rangePhrase = (range: string) => RANGE_PHRASE[range] ?? "selected period";

/**
 * When something happened, precise enough for the range: the time alone
 * within a day, the date as well once the range spans several, where
 * "02:35 PM" on its own would not say which day.
 */
export function atWhen(iso: string, range: string): string {
  if (!range.endsWith("d")) return at(iso);
  const day = new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
  return `${day}, ${at(iso)}`;
}

/** Local midnight, so days split where the farm's day splits. */
function localDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Meter messages, turned into ONE figure per calendar day.
 *
 * The campus meter sends Day_consumption as a running total for the day, and
 * may send several times a day (on reconnect and on every new cubic metre).
 * Drawn one bar per message, 22 Oct appeared five times along the axis; and
 * summed, a day reported three times was counted three times. The day's
 * figure is its LAST report, which already includes the earlier ones.
 *
 * Every day from the first report to today is present, so a day the meter
 * said nothing about is a visible gap (`value: null`) and not a day silently
 * missing from the axis. Today is `partial` — still filling.
 */
export function dailyFromMeter(
  readings: { timestamp: string; consumption: number | null }[],
): { ts: number; value: number | null; partial?: boolean }[] {
  const byDay = new Map<number, number | null>();
  const oldestFirst = [...readings].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  for (const r of oldestFirst) {
    const day = localDay(new Date(r.timestamp).getTime());
    // Latest report wins, except that a reset (null) never overwrites a real
    // figure from earlier the same day.
    if (r.consumption != null || !byDay.has(day)) byDay.set(day, r.consumption);
  }
  if (!byDay.size) return [];

  const today = localDay(Date.now());
  const first = Math.min(...byDay.keys());
  const out: { ts: number; value: number | null; partial?: boolean }[] = [];
  // Stepped by date rather than by 24 h, so a DST change cannot skip a day.
  for (const d = new Date(first); d.getTime() <= today; d.setDate(d.getDate() + 1)) {
    const ts = d.getTime();
    out.push({ ts, value: byDay.get(ts) ?? null, partial: ts === today || undefined });
  }
  return out;
}

export function duration(min: number): string {
  if (min < 1) return `${Math.round(min * 60)} sec`;
  if (min < 90) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export type Row = { ts: number } & Record<string, number | null>;

/**
 * Several series merged into the rows Recharts wants, keyed by timestamp.
 *
 * Fields that do not share a timestamp simply leave their key missing on that
 * row, which Recharts draws as a break. That is the honest rendering: the
 * campus soil probes and the ambient sensor publish on separate topics at
 * separate intervals, and nudging one onto the other's clock to make the
 * lines meet would be inventing agreement between two instruments.
 */
export function mergeSeries(
  series: Record<string, TimePoint[]> | undefined,
  fields: string[],
): Row[] {
  const rows = new Map<number, Row>();
  for (const field of fields) {
    for (const p of series?.[field] ?? []) {
      const ts = new Date(p.time).getTime();
      const row = rows.get(ts) ?? ({ ts } as Row);
      row[field] = p.value;
      rows.set(ts, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.ts - b.ts);
}

/** Buckets a series into per-day totals of minutes over a threshold. */
export function dailyMinutesOver(
  points: TimePoint[], threshold: number,
): { ts: number; value: number }[] {
  const DAY = 86_400_000;
  const byDay = new Map<number, number>();
  for (const span of exceedSpans(points, threshold)) {
    // A spell crossing midnight is split, so neither day is credited with
    // time it did not have.
    let cursor = span.start;
    while (cursor < span.end) {
      const dayStart = Math.floor(cursor / DAY) * DAY;
      const dayEnd = Math.min(span.end, dayStart + DAY);
      byDay.set(dayStart, (byDay.get(dayStart) ?? 0) + (dayEnd - cursor) / 60_000);
      cursor = dayEnd;
    }
  }
  // Every day in range, including the quiet ones: a missing bar and a zero
  // bar say different things, and "it was never too hot on Tuesday" is the
  // more useful of the two.
  if (points.length) {
    const first = Math.floor(new Date(points[0].time).getTime() / DAY) * DAY;
    const last = Math.floor(new Date(points[points.length - 1].time).getTime() / DAY) * DAY;
    for (let d = first; d <= last; d += DAY) if (!byDay.has(d)) byDay.set(d, 0);
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([ts, value]) => ({ ts, value }));
}
