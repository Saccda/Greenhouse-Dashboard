"use client";
/**
 * One sensor domain in full: /dashboard/ambient, /water, /soil, /energy.
 *
 * WHO THIS IS FOR
 *   Farm staff, not whoever is debugging the sensors. An earlier draft carried
 *   a "reading health" panel and the MQTT topic each field arrives on, which
 *   was designing for the person who had just spent a week chasing a renamed
 *   topic rather than for the person deciding whether to water the crop. Both
 *   were cut.
 *
 *   The trust problem they existed for is real — a probe has been frozen at
 *   0.2% for a week — but a permanent "coverage 97% OK" is a badge people stop
 *   reading, which is how eighteen days of silence went unnoticed. So those
 *   checks now say nothing at all when things are fine, and say it in plain
 *   words when they are not.
 *
 * WHAT EARNS A PLACE
 *   A figure has to imply an action. "1,420 readings" does not. "Too hot for
 *   2 h 40 min" does, and so does the TIME of a peak: 38.3 °C at 14:35 tells
 *   you when to be in the greenhouse; 38.3 °C alone does not.
 *
 * THE SHADING IS THE NAVIGATION
 *   Spells above the threshold are shaded the full height of the chart, so
 *   "when was it too hot" is answered by looking rather than by tracing a line
 *   against an axis. The threshold is drawn as a dashed line so the shading
 *   explains itself.
 */
import { useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, ArrowUpRight, AlertTriangle } from "lucide-react";
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { swrFetcher } from "@/lib/api";
import Header from "@/components/layout/Header";
import { useFarmSelection } from "@/hooks/useFarmSelection";
import { useDashboard } from "@/hooks/useDashboard";
import { useSettings } from "@/hooks/useSettings";
import type { Farm, SoilProbe, TimeRange, Aggregation, TimePoint } from "@/types";

const RANGES: { value: TimeRange; label: string }[] = [
  { value: "-6h", label: "6 h" },
  { value: "-24h", label: "24 h" },
  { value: "-7d", label: "7 days" },
  { value: "-30d", label: "30 days" },
];

/** A probe plus the threshold it is judged against, where one exists. */
interface Reading extends SoilProbe {
  /** Above this is "too much". Null when nothing defines a limit yet. */
  threshold?: number | null;
  /** How to name an exceedance to a person: "Too hot", "Too humid". */
  exceedLabel?: string;
}

interface Spec {
  title: string;
  blurb: string;
  related?: { href: string; label: string };
}

const SPECS: Record<string, Spec> = {
  ambient: {
    title: "Ambient",
    blurb: "Air temperature and humidity inside the greenhouse.",
    related: { href: "/analytics", label: "Distribution and daily pattern" },
  },
  water: {
    title: "Water",
    blurb: "Tank temperature, consumption and every spray cycle.",
    related: { href: "/historical", label: "Daily totals and meter readings" },
  },
  spraying: {
    title: "Spraying",
    blurb: "When the system ran, and for how long.",
    related: { href: "/analytics", label: "Whether spraying actually cooled" },
  },
  soil: {
    title: "Soil",
    blurb: "Moisture, temperature and nutrients in the root zone.",
  },
  energy: {
    title: "Energy",
    blurb: "Mains voltage, current and power drawn by the rig.",
  },
};

export default function SectionPage({ params }: { params: { section: string } }) {
  // Next 14 passes params as a plain object. It only becomes a Promise (and
  // only then needs React.use) in Next 15 — calling use() on a non-thenable
  // throws, which crashed every one of these pages on entry.
  const { section } = params;
  const spec = SPECS[section];

  const { settings } = useSettings();
  const { farm, setFarm, farms } = useFarmSelection();
  const [range, setRange] = useState<TimeRange>("-24h");
  const [aggregation] = useState<Aggregation>("15m");

  const { latest, history, sprayStats, isLoading, connectionStatus, lastUpdated, refresh } =
    useDashboard({
      farm, timeRange: range, aggregation,
      tempWarn: settings.tempWarn, humWarn: settings.humWarn,
    });
  const { data: farmList } = useSWR<{ farms: Farm[] }>("/api/farms/", swrFetcher);
  const thisFarm = farmList?.farms?.find((f) => f.id === farm);

  if (!spec) notFound();

  const isOffline = latest ? !latest.is_online : false;

  const readings: Reading[] = (() => {
    if (section === "ambient") {
      return [
        {
          field: "temperature", label: "Air temperature", unit: "°C", min: 15, max: 45,
          threshold: settings.tempWarn, exceedLabel: "Too hot",
        },
        {
          field: "humidity", label: "Humidity", unit: "%", min: 0, max: 100,
          threshold: settings.humWarn, exceedLabel: "Too humid",
        },
      ];
    }
    if (section === "water") return thisFarm?.water_temp ? [thisFarm.water_temp] : [];
    if (section === "soil") return thisFarm?.soil_probes ?? [];
    if (section === "energy") return thisFarm?.energy ?? [];
    return [];
  })();

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header
        selectedFarm={farm}
        farms={farms}
        onFarmChange={setFarm}
        connectionStatus={connectionStatus}
        dataAgeMinutes={latest?.data_age_minutes}
        lastUpdated={lastUpdated}
        isLoading={isLoading}
        onRefresh={refresh}
      />

      <main className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-[12px] text-slate-400 hover:text-slate-200 transition-colors mb-2"
            >
              <ArrowLeft size={13} />
              Dashboard
            </Link>
            <h1 className="text-xl font-semibold text-slate-100">{spec.title}</h1>
            <p className="text-[13px] text-slate-400 mt-1">{spec.blurb}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  range === r.value
                    ? "bg-brand-green/15 text-brand-green border border-brand-green/30"
                    : "bg-surface-card text-slate-500 border border-surface-border hover:text-slate-300"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {spec.related && (
          <Link
            href={spec.related.href}
            className="inline-flex items-center gap-1.5 text-[12px] text-slate-400 hover:text-slate-200 transition-colors"
          >
            {spec.related.label}
            <ArrowUpRight size={13} />
          </Link>
        )}

        {readings.length === 0 && section !== "water" && section !== "spraying" ? (
          <Empty>
            {section === "soil"
              ? "No probes are fitted to this farm. This page reads the farm registry, so it fills in by itself once they are wired and configured."
              : "This farm has no sensor for these readings."}
          </Empty>
        ) : (
          readings.map((r) => (
            <ReadingPanel
              key={r.field}
              reading={r}
              points={history?.series?.[r.field] ?? []}
              current={!isOffline ? latest?.readings?.[r.field]?.value : undefined}
              isLoading={isLoading && !history}
            />
          ))
        )}

        {/* Spray cycles belong on the Water page now that the card merged
            them: the pump IS the consumption. */}
        {(section === "water" || section === "spraying") && (
          <SprayDetail sprayStats={sprayStats} isLoading={isLoading} />
        )}
      </main>
    </div>
  );
}

/* ── One reading: headline figures, then the chart ───────────────────────── */

function ReadingPanel({
  reading, points, current, isLoading,
}: {
  reading: Reading;
  points: TimePoint[];
  current?: number;
  isLoading: boolean;
}) {
  const values = points.map((p) => p.value).filter((v): v is number => v != null);
  const data = points.map((p) => ({ ts: new Date(p.time).getTime(), value: p.value }));

  const lo = extreme(points, "min");
  const hi = extreme(points, "max");
  const threshold = reading.threshold ?? null;
  const spans = threshold != null ? exceedSpans(points, threshold) : [];
  const overMinutes = spans.reduce((s, w) => s + (w.end - w.start) / 60_000, 0);

  const stuck = isStuck(values);
  const cover = coverage(points);

  return (
    <section className="bg-surface-card border border-surface-border rounded-xl p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <h2 className="text-sm font-semibold text-slate-200">{reading.label}</h2>
        {threshold != null && (
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="inline-block w-5 h-2.5 rounded-sm bg-red-500/20" />
            shaded where above {threshold} {reading.unit}
          </span>
        )}
      </div>

      {/* Plain words, only when something is wrong. A permanent "all fine"
          badge is one people stop reading. */}
      {stuck && (
        <Warning>
          This sensor has read exactly {values[0]} {reading.unit} for every one of its{" "}
          {values.length} readings in this period. A value that never moves at all usually
          means the probe is not in contact with what it is measuring, rather than a steady
          reading.
        </Warning>
      )}
      {!stuck && cover != null && cover < 0.5 && (
        <Warning>
          Readings are missing for roughly {Math.round((1 - cover) * 100)}% of this period,
          so the figures below describe only the part that was recorded.
        </Warning>
      )}

      {/* Every figure here implies an action. A count of readings does not,
          which is why there is not one. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        <Stat label="Now" value={current != null ? `${current.toFixed(1)} ${reading.unit}` : "—"} />
        <Stat
          label="Lowest"
          value={lo ? `${lo.value.toFixed(1)} ${reading.unit}` : "—"}
          sub={lo ? at(lo.time) : undefined}
        />
        <Stat
          label="Highest"
          value={hi ? `${hi.value.toFixed(1)} ${reading.unit}` : "—"}
          sub={hi ? at(hi.time) : undefined}
        />
        {threshold != null ? (
          <Stat
            label={reading.exceedLabel ?? "Above limit"}
            value={overMinutes > 0 ? duration(overMinutes) : "not at all"}
            sub={`above ${threshold} ${reading.unit}`}
            tone={overMinutes > 0 ? "warn" : "ok"}
          />
        ) : (
          <Stat
            label="Average"
            value={values.length ? `${mean(values).toFixed(1)} ${reading.unit}` : "—"}
          />
        )}
      </div>

      {/* Taller and full width on purpose: this is the whole reason for
          leaving the card. */}
      <div style={{ height: 360 }}>
        {isLoading ? (
          <div className="h-full bg-surface-hover rounded animate-pulse" />
        ) : values.length === 0 ? (
          <Empty>No readings stored for this range.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 20, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-surface-border" />

              {/* One shaded block per unbroken spell above the threshold. This
                  IS the navigation: "when was it too hot" becomes something
                  you see rather than something you trace along an axis. */}
              {spans.map((w, i) => (
                <ReferenceArea
                  key={i}
                  x1={w.start}
                  x2={w.end}
                  fill="#ef4444"
                  fillOpacity={0.13}
                  stroke="none"
                />
              ))}

              <XAxis
                dataKey="ts" type="number" scale="time"
                domain={["dataMin", "dataMax"]}
                tick={{ fontSize: 11 }} minTickGap={56} tickLine={false}
                tickFormatter={(t: number) =>
                  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                }
              />
              <YAxis
                domain={[reading.min ?? "auto", reading.max ?? "auto"]}
                tick={{ fontSize: 11 }} width={46} tickLine={false} axisLine={false}
              />
              <Tooltip
                labelFormatter={(t: number) => new Date(t).toLocaleString()}
                formatter={(v: number) => [`${v?.toFixed(1)} ${reading.unit}`, reading.label]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />

              {/* Drawn so the shading explains itself. */}
              {threshold != null && (
                <ReferenceLine
                  y={threshold}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  strokeOpacity={0.75}
                />
              )}

              {/* Gaps drawn as gaps: a line joined through a dead feed invents
                  readings nobody took. */}
              <Line
                dataKey="value" type="monotone" strokeWidth={1.8} dot={false}
                className="stroke-brand-green" stroke="currentColor"
                isAnimationActive={false} connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

/* ── Spray cycles ────────────────────────────────────────────────────────── */

function SprayDetail({
  sprayStats, isLoading,
}: {
  sprayStats?: import("@/types").SprayStatsResponse;
  isLoading: boolean;
}) {
  const stats = sprayStats?.stats;
  const events = stats?.spray_events ?? [];

  if (isLoading && !sprayStats) {
    return <div className="h-48 bg-surface-hover rounded-xl animate-pulse" />;
  }
  if (!events.length) return <Empty>No spray cycles recorded in this range.</Empty>;

  return (
    <section className="bg-surface-card border border-surface-border rounded-xl p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <h2 className="text-sm font-semibold text-slate-200">Spray cycles</h2>
        <span className="text-[12px] text-slate-500 font-mono-num">
          {stats?.total_sprays} cycles · {stats?.total_spray_display} in total
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500">
              <th className="text-left font-medium py-2">Started</th>
              <th className="text-right font-medium py-2">Ran for</th>
              <th className="text-left font-medium py-2 pl-4">Note</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={i} className="border-t border-surface-border">
                <td className="py-2 font-mono-num text-slate-300">
                  {new Date(e.start_time).toLocaleString()}
                </td>
                <td className="py-2 text-right font-mono-num text-slate-100">
                  {e.duration_minutes.toFixed(1)} min
                </td>
                <td className="py-2 pl-4 text-slate-400">
                  {/* A gap-bounded duration is a lower bound, not a
                      measurement, and the two look identical in a column. */}
                  {(e as { gap_interrupted?: boolean }).gap_interrupted
                    ? "cut short by a gap in the feed — at least this long"
                    : e.ongoing ? "still running" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function Stat({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-lg bg-surface-hover px-3 py-2.5 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 truncate">{label}</div>
      <div
        className={`text-[17px] font-semibold font-mono-num tabular-nums mt-0.5 truncate ${
          tone === "warn" ? "text-[color:var(--warn-ink)]"
            : tone === "ok" ? "text-brand-green" : "text-slate-100"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[13px] text-slate-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5 mb-4 leading-relaxed">
      <AlertTriangle size={15} className="shrink-0 mt-0.5 text-[color:var(--warn-ink)]" />
      <span>{children}</span>
    </p>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full min-h-[8rem] grid place-items-center bg-surface-card border border-surface-border rounded-xl p-6">
      <p className="text-[13px] text-slate-400 text-center max-w-md leading-relaxed">{children}</p>
    </div>
  );
}

/* ── Maths ───────────────────────────────────────────────────────────────── */

/**
 * Unbroken spells at or above a threshold, as {start, end} in epoch ms.
 *
 * A span closes at the LAST reading still over, not at the first one under:
 * shading forward to a reading that was already back in range would overstate
 * how long the greenhouse was too hot, and this figure is also printed as
 * "Too hot for 2 h 40 min".
 */
function exceedSpans(points: TimePoint[], threshold: number): { start: number; end: number }[] {
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

function extreme(points: TimePoint[], which: "min" | "max"): { value: number; time: string } | null {
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
function isStuck(values: number[]): boolean {
  if (values.length < 20) return false;
  return values.every((v) => v === values[0]);
}

/** Share of the period that actually has readings, or null when unknowable. */
function coverage(points: TimePoint[]): number | null {
  if (points.length < 3) return null;
  const gap = medianGap(points);
  if (!gap) return null;
  const span = new Date(points[points.length - 1].time).getTime()
    - new Date(points[0].time).getTime();
  const expected = span / gap + 1;
  return expected > 0 ? Math.min(1, points.length / expected) : null;
}

/** Typical spacing between readings. Median, so one long gap does not set it. */
function medianGap(points: TimePoint[]): number | null {
  if (points.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 1; i < points.length; i++) {
    gaps.push(new Date(points[i].time).getTime() - new Date(points[i - 1].time).getTime());
  }
  gaps.sort((a, b) => a - b);
  const m = gaps[Math.floor(gaps.length / 2)];
  return m > 0 ? m : null;
}

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

const at = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function duration(min: number): string {
  if (min < 1) return `${Math.round(min * 60)} sec`;
  if (min < 90) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}
