"use client";
/**
 * One sensor domain in full: /dashboard/ambient, /water, /spraying, /soil.
 *
 * The Dashboard's cards carry the figures worth seeing without asking. This is
 * where the rest lives — the chart with real axes, the range picker, and the
 * readings a card has no room for.
 *
 * One route rather than four pages because the shell is identical: a title, a
 * way back, a range picker, and a guard for a farm that has no such sensor.
 * Only the body differs, and it differs by data rather than by structure.
 *
 * These deliberately do NOT reproduce Analytics. Analytics answers questions
 * ABOUT the readings — how they were distributed, what a typical day looks
 * like, whether spraying actually cooled anything. These pages show the
 * readings themselves. Each page links across rather than redrawing the other.
 */
import { use, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { swrFetcher } from "@/lib/api";
import Header from "@/components/layout/Header";
import { useFarmSelection } from "@/hooks/useFarmSelection";
import { useDashboard } from "@/hooks/useDashboard";
import { useSettings } from "@/hooks/useSettings";
import type { Farm, SoilProbe, TimeRange, Aggregation } from "@/types";

const RANGES: { value: TimeRange; label: string }[] = [
  { value: "-6h", label: "6 h" },
  { value: "-24h", label: "24 h" },
  { value: "-7d", label: "7 days" },
  { value: "-30d", label: "30 days" },
];

interface Spec {
  title: string;
  blurb: string;
  /** Where the analysis of these readings lives, as opposed to the readings. */
  related?: { href: string; label: string };
}

const SPECS: Record<string, Spec> = {
  ambient: {
    title: "Ambient",
    blurb: "Air temperature and humidity, as measured.",
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
  energy: {
    title: "Energy",
    blurb: "Mains voltage, current and power drawn by the rig.",
  },
  soil: {
    title: "Soil",
    blurb: "Moisture, temperature and nutrients from the installed probes.",
  },
};

export default function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
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

  // Which series this page draws, decided from the farm registry rather than
  // hardcoded, so a farm without the sensor gets an explanation instead of an
  // empty chart.
  const lines: SoilProbe[] = (() => {
    if (section === "ambient") {
      return [
        { field: "temperature", label: "Air temperature", unit: "°C", min: 15, max: 45 },
        { field: "humidity", label: "Humidity", unit: "%", min: 0, max: 100 },
      ];
    }
    if (section === "water") {
      return thisFarm?.water_temp ? [thisFarm.water_temp] : [];
    }
    // Soil now shows every probe, nutrients included: the card merged them
    // and the detail page is where there is room to chart all five.
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
          {spec.related && (
            <Link
              href={spec.related.href}
              className="flex items-center gap-1.5 text-[12px] text-slate-400 hover:text-slate-200 transition-colors shrink-0"
            >
              {spec.related.label}
              <ArrowUpRight size={13} />
            </Link>
          )}
        </div>

        <section className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-slate-500 uppercase tracking-wider mr-1">Range:</span>
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
        </section>

        <div className="space-y-4">
          {lines.length === 0 && section !== "water" ? (
            <Empty>
              {section === "soil"
                ? "No probes are fitted to this farm. This page reads the farm registry, so it fills in by itself once they are wired and configured."
                : "This farm has no sensor for these readings."}
            </Empty>
          ) : (
            lines.map((l) => (
              <ReadingChart
                key={l.field}
                probe={l}
                points={history?.series?.[l.field] ?? []}
                current={!isOffline ? latest?.readings?.[l.field]?.value : undefined}
                isLoading={isLoading && !history}
              />
            ))
          )}

          {/* Spray cycles belong on the Water page now that the card merged
              them: the pump IS the consumption. The standalone /spraying
              route still works for anyone holding a link to it. */}
          {(section === "water" || section === "spraying") && (
            <SprayDetail sprayStats={sprayStats} isLoading={isLoading} />
          )}
        </div>
      </main>
    </div>
  );
}

function ReadingChart({
  probe, points, current, isLoading,
}: {
  probe: SoilProbe;
  points: { time: string; value: number | null }[];
  current?: number;
  isLoading: boolean;
}) {
  const data = points.map((p) => ({ ts: new Date(p.time).getTime(), value: p.value }));
  const seen = points.map((p) => p.value).filter((v): v is number => v != null);

  return (
    <section className="bg-surface-card border border-surface-border rounded-xl p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {probe.label}
        </h2>
        <div className="flex items-baseline gap-4 text-[12px] text-slate-500 font-mono-num">
          {seen.length > 0 && (
            <>
              <span>min {Math.min(...seen).toFixed(1)}</span>
              <span>max {Math.max(...seen).toFixed(1)}</span>
              <span>{seen.length} readings</span>
            </>
          )}
          {current != null && (
            <span className="text-lg font-semibold text-slate-100">
              {current.toFixed(1)} {probe.unit}
            </span>
          )}
        </div>
      </div>

      <div style={{ height: 240 }}>
        {isLoading ? (
          <div className="h-full bg-surface-hover rounded animate-pulse" />
        ) : seen.length === 0 ? (
          <Empty>No readings stored for this range.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="2 4" vertical={false} className="stroke-surface-border" />
              <XAxis
                dataKey="ts" type="number" scale="time"
                domain={["dataMin", "dataMax"]}
                tick={{ fontSize: 10 }} minTickGap={48}
                tickFormatter={(t: number) =>
                  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                }
              />
              {/* Instrument range where the farm declared one, so a steady
                  reading is not magnified into a jagged one by an axis fitted
                  to its own noise. */}
              <YAxis
                domain={[probe.min ?? "auto", probe.max ?? "auto"]}
                tick={{ fontSize: 10 }} width={42}
              />
              <Tooltip
                labelFormatter={(t: number) => new Date(t).toLocaleString()}
                formatter={(v: number) => [`${v?.toFixed(1)} ${probe.unit}`, probe.label]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              {/* Gaps drawn as gaps: a line through a dead feed invents
                  readings nobody took. */}
              <Line
                dataKey="value" type="linear" strokeWidth={1.6} dot={false}
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

function SprayDetail({
  sprayStats, isLoading,
}: {
  sprayStats?: import("@/types").SprayStatsResponse;
  isLoading: boolean;
}) {
  const stats = sprayStats?.stats;
  const events = stats?.spray_events ?? [];

  if (isLoading && !sprayStats) {
    return <div className="h-64 bg-surface-hover rounded-xl animate-pulse" />;
  }
  if (!events.length) {
    return <Empty>No spray cycles recorded in this range.</Empty>;
  }

  return (
    <section className="bg-surface-card border border-surface-border rounded-xl p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Spray cycles
        </h2>
        <span className="text-[12px] text-slate-500 font-mono-num">
          {stats?.total_sprays} cycles · {stats?.total_spray_display} total
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500">
              <th className="text-left font-medium py-2">Started</th>
              <th className="text-right font-medium py-2">Duration</th>
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

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full min-h-[8rem] grid place-items-center bg-surface-card border border-surface-border rounded-xl p-6">
      <p className="text-[13px] text-slate-400 text-center max-w-md leading-relaxed">{children}</p>
    </div>
  );
}
