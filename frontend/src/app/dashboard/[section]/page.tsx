"use client";
/**
 * One sensor domain in full: /dashboard/ambient, /water, /soil, /energy.
 *
 * WHAT THIS FILE IS NOW
 *   Data and chrome only. It fetches, works out the window, and hands the
 *   whole lot to the layout for that section. The four layouts used to be one
 *   layout with a different number of charts in it, which is why none of them
 *   felt designed: the page could never say which reading mattered most or
 *   how two readings related, because it did not know what it was showing.
 *
 * WHO THIS IS FOR
 *   Farm staff, not whoever is debugging the sensors. An earlier draft carried
 *   a "reading health" panel and the MQTT topic each field arrives on, which
 *   was designing for the person who had just spent a week chasing a renamed
 *   topic rather than for the person deciding whether to water the crop.
 *
 *   The trust problem they existed for is real — a probe has been frozen at
 *   0.2% for weeks — but a permanent "coverage 97% OK" is a badge people stop
 *   reading, which is how eighteen days of silence went unnoticed. So those
 *   checks say nothing at all when things are fine, and say it in plain words
 *   when they are not.
 *
 * WHAT EARNS A PLACE
 *   A figure has to imply an action. "1,420 readings" does not. "Too hot for
 *   2 h 40 min" does, and so does the TIME of a peak: 38.3 °C at 14:35 tells
 *   you when to be in the greenhouse; 38.3 °C alone does not.
 */
import { useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

import { swrFetcher } from "@/lib/api";
import Header from "@/components/layout/Header";
import { useFarmSelection } from "@/hooks/useFarmSelection";
import { useDashboard } from "@/hooks/useDashboard";
import { useSettings } from "@/hooks/useSettings";
import type { Farm, TimeRange, Aggregation, HistoryResponse, WaterResponse } from "@/types";

import SectionInsights, {
  ambientInsights, waterInsights, soilInsights,
} from "@/components/dashboard/SectionInsights";
import AmbientDetail from "@/components/dashboard/detail/AmbientDetail";
import WaterDetail from "@/components/dashboard/detail/WaterDetail";
import SoilDetail from "@/components/dashboard/detail/SoilDetail";
import EnergyDetail from "@/components/dashboard/detail/EnergyDetail";

/** The window before the one on screen, fetched as a doubled range. */
const DOUBLED: Record<string, string> = {
  "-6h": "-12h", "-24h": "-48h", "-7d": "-14d", "-30d": "-60d",
};
const RANGE_MS: Record<string, number> = {
  "-6h": 6 * 3600_000, "-24h": 24 * 3600_000,
  "-7d": 7 * 86_400_000, "-30d": 30 * 86_400_000,
};

/**
 * The EARLIER half of a doubled fetch: everything older than one window ago.
 *
 * Doubling and splitting rather than issuing a second absolute query means the
 * two halves always share a length and an aggregation, so the comparison
 * cannot drift into measuring one against a differently-bucketed other.
 */
function splitEarlierHalf(
  doubled: HistoryResponse | undefined, windowMs: number,
): HistoryResponse | undefined {
  if (!doubled) return undefined;
  const cutoff = Date.now() - windowMs;
  const series: HistoryResponse["series"] = {};
  for (const [field, points] of Object.entries(doubled.series ?? {})) {
    series[field] = points.filter((p) => new Date(p.time).getTime() < cutoff);
  }
  return { ...doubled, series };
}

const RANGES: { value: TimeRange; label: string }[] = [
  { value: "-6h", label: "6 h" },
  { value: "-24h", label: "24 h" },
  { value: "-7d", label: "7 days" },
  { value: "-30d", label: "30 days" },
];

interface Spec {
  title: string;
  blurb: string;
  related?: { href: string; label: string };
}

const SPECS: Record<string, Spec> = {
  ambient: {
    title: "Ambient",
    blurb: "Air temperature and humidity inside the greenhouse, and what spraying did to them.",
    related: { href: "/analytics", label: "Distribution and daily pattern" },
  },
  water: {
    title: "Water",
    blurb: "Every spray cycle, what it cost in water, and why the controller ran it.",
    related: { href: "/historical", label: "Daily totals and meter readings" },
  },
  spraying: {
    title: "Spraying",
    blurb: "Every spray cycle, what it cost in water, and why the controller ran it.",
    related: { href: "/analytics", label: "Whether spraying actually cooled" },
  },
  soil: {
    title: "Soil",
    blurb: "The root zone, split by the decision each reading serves: watering, and feeding.",
  },
  energy: {
    title: "Energy",
    blurb: "What the rig drew, and what each spray cycle cost to run.",
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

  const prevRange = DOUBLED[range];
  const { data: doubled } = useSWR<HistoryResponse>(
    `/api/sensors/history?farm=${farm}&range=${prevRange}`, swrFetcher,
    { refreshInterval: 300_000 },
  );
  const previous = splitEarlierHalf(doubled, RANGE_MS[range]);
  const thisFarm = farmList?.farms?.find((f) => f.id === farm);

  // Requested only where a meter exists, so farms without one make no
  // pointless call.
  const { data: water } = useSWR<WaterResponse>(
    thisFarm?.water_source === "measured" ? `/api/sensors/water?farm=${farm}` : null,
    swrFetcher, { refreshInterval: 300_000 },
  );

  if (!spec) notFound();

  const isOffline = latest ? !latest.is_online : false;
  const rangeWord = range === "-6h" ? "6 hours"
    : range === "-24h" ? "day" : range === "-7d" ? "week" : "month";

  const windowEnd = Date.now();
  const windowStart = windowEnd - (RANGE_MS[range] ?? 86_400_000);

  // What each section gets differs because the decision differs. A shared set
  // of statistics would serve none of them properly.
  //
  // Energy gets nothing: every figure that used to sit here — energy used,
  // standing draw, peak draw — is now a card or a stat on the page itself, and
  // a line repeating the cards under it is noise wearing the costume of a
  // summary.
  const insights =
    section === "ambient" ? ambientInsights(history, previous, rangeWord)
    : section === "water" || section === "spraying"
      ? waterInsights(history, water, sprayStats, thisFarm?.water_temp?.field ?? null)
    : section === "soil" ? soilInsights(history, previous, rangeWord)
    : [];

  const detail = {
    farm: thisFarm,
    latest, history, previous, water, sprayStats,
    isOffline, isLoading,
    tempWarn: settings.tempWarn,
    humWarn: settings.humWarn,
    range, rangeWord, windowStart, windowEnd,
  };

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

      <main className="flex-1 overflow-y-auto p-5 space-y-4">
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

        {/* One line, above everything: whether what the page is about to show
            is unusual. It sits here rather than lower because it frames the
            figures, but it is set as text rather than cards so it cannot
            compete with them — it was a grid of boxes, and the boxes won. */}
        <SectionInsights insights={insights} />

        {section === "ambient" && <AmbientDetail {...detail} />}
        {(section === "water" || section === "spraying") && <WaterDetail {...detail} />}
        {section === "soil" && <SoilDetail {...detail} />}
        {section === "energy" && <EnergyDetail {...detail} />}
      </main>
    </div>
  );
}
