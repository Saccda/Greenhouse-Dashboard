"use client";
/**
 * Analytics — decision-oriented statistics.
 *
 * Structured so the answer comes first and the raw statistics support it,
 * rather than presenting means and standard deviations and leaving the reader
 * to work out what to do. Section order is deliberate:
 *
 *   0. Data coverage      — how much of the day was actually observed, stated
 *                           before any percentage that depends on it.
 *   1. Environment health — time in range, exceedance, longest exposure.
 *   2. Distribution       — the shape behind the average.
 *   3. Daily pattern      — when the problem window is.
 *   4. System effectiveness — is the spraying doing anything measurable.
 *
 * Every statistic is computed server-side (see backend/services/
 * analytics_service.py); this page renders and explains, it does not calculate.
 */
import { useState } from "react";
import useSWR from "swr";
import { clsx } from "clsx";
import {
  Activity, Thermometer, Droplets, BarChart3, Clock, CloudDrizzle, AlertCircle,
} from "lucide-react";

import { swrFetcher } from "@/lib/api";
import { useFarmSelection } from "@/hooks/useFarmSelection";
import Header from "@/components/layout/Header";
import CoverageNotice from "@/components/analytics/CoverageNotice";
import TimeInRangeBar from "@/components/analytics/TimeInRangeBar";
import DistributionChart from "@/components/analytics/DistributionChart";
import DiurnalChart from "@/components/analytics/DiurnalChart";
import SprayEffectPanel from "@/components/analytics/SprayEffectPanel";
import type { AnalyticsSummary, ParameterAnalytics } from "@/types/analytics";

const RANGES = [
  { label: "24 Hours", value: "-24h" },
  { label: "7 Days",   value: "-7d"  },
  { label: "30 Days",  value: "-30d" },
  { label: "90 Days",  value: "-90d" },
];

const PARAMS = [
  { key: "temperature" as const, label: "Temperature", unit: "°C", icon: Thermometer, color: "var(--chart-temp)" },
  { key: "humidity"    as const, label: "Humidity",    unit: "%",  icon: Droplets,    color: "var(--chart-hum)"  },
];

function SectionTitle({ n, title, subtitle, icon: Icon }: {
  n: string; title: string; subtitle: string; icon: typeof Activity;
}) {
  return (
    <div className="mb-3">
      <h2 className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
        <span className="text-slate-600 font-mono-num">{n}</span>
        <Icon size={13} /> {title}
      </h2>
      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{subtitle}</p>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("bg-surface-card border border-surface-border rounded-xl p-4", className)}>
      {children}
    </div>
  );
}

/**
 * Hero number — the figure, then the plain fact behind it.
 *
 * `facts` are declarative ("13 episodes, 24.7 h total") and belong to the
 * reading. `note` is the "why this metric matters" line, deliberately smaller
 * and separated: it explains our choice of measure, which is useful once and
 * then just noise on every future visit.
 */
function HeroStat({ value, unit, label, facts, note, tone = "neutral" }: {
  value: string; unit?: string; label: string;
  facts: string; note?: string;
  tone?: "neutral" | "warn" | "good";
}) {
  return (
    <Card className="flex flex-col">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className={clsx(
          "text-4xl font-extrabold font-mono-num tabular-nums leading-none",
          tone === "warn" ? "text-amber-500" : tone === "good" ? "text-brand-green" : "text-slate-100",
        )}>
          {value}
        </span>
        {unit && <span className="text-base font-semibold text-slate-400">{unit}</span>}
      </p>
      <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">{facts}</p>
      {note && (
        <p className="text-[11px] text-slate-600 mt-auto pt-2.5 leading-relaxed border-t border-surface-border/60">
          {note}
        </p>
      )}
    </Card>
  );
}

function ParameterHealth({ p, unit, label }: { p: ParameterAnalytics; unit: string; label: string }) {
  const ex = p.exceedance;
  const tir = p.time_in_range;
  if (!ex || !tir) return <p className="text-sm text-slate-600 py-4">No data for {label.toLowerCase()}.</p>;

  const optimalPct = tir.optimal_fraction * 100;
  const longestH = ex.longest_episode_minutes / 60;
  const totalH = ex.total_minutes_above / 60;
  const optimalBand = tir.bands.find((b) => b.status === "optimal");
  const optimalRangeText =
    optimalBand == null ? "target"
    : optimalBand.min !== null && optimalBand.max !== null ? `${optimalBand.min}–${optimalBand.max}${unit}`
    : optimalBand.max !== null ? `under ${optimalBand.max}${unit}`
    : `over ${optimalBand.min}${unit}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <HeroStat
          label="Time in target range"
          value={optimalPct.toFixed(0)} unit="%"
          tone={optimalPct >= 70 ? "good" : "warn"}
          facts={`${optimalBand?.count.toLocaleString() ?? "—"} of ${tir.n.toLocaleString()} readings sat in the ${optimalRangeText} target band.`}
        />
        <HeroStat
          label={`Above ${ex.threshold}${unit}`}
          value={(ex.probability * 100).toFixed(0)} unit="%"
          tone={ex.probability > 0.3 ? "warn" : "good"}
          facts={`${ex.count_above.toLocaleString()} of ${ex.n.toLocaleString()} readings were over the ${ex.threshold}${unit} alert threshold.`}
          note="Share of monitored readings — see the coverage note above."
        />
        <HeroStat
          label="Longest hot stretch"
          value={longestH >= 1 ? longestH.toFixed(1) : ex.longest_episode_minutes.toFixed(0)}
          unit={longestH >= 1 ? "hours" : "min"}
          tone={longestH >= 2 ? "warn" : "neutral"}
          facts={`Longest single stretch above ${ex.threshold}${unit} without dropping back. ${ex.episodes} such stretch${ex.episodes === 1 ? "" : "es"} in total, adding up to ${totalH >= 1 ? `${totalH.toFixed(1)} hours` : `${ex.total_minutes_above.toFixed(0)} min`}.`}
          note="Shown separately from the percentage because one long stretch is harder on the crop than the same hours split into short spikes."
        />
      </div>

      <Card>
        <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-3">
          Where the readings sat
        </p>
        <TimeInRangeBar bands={tir.bands} unit={unit} />
      </Card>
    </div>
  );
}

export default function AnalyticsPage() {
  const { farm, setFarm, farms } = useFarmSelection();
  const [range, setRange] = useState("-7d");

  const { data, isLoading, error, mutate } = useSWR<AnalyticsSummary>(
    `/api/analytics/summary?farm=${farm}&range=${range}`,
    swrFetcher,
    { revalidateOnFocus: false },
  );

  const connectionStatus = error ? "offline" : data ? "online" : "loading";

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header
        selectedFarm={farm} farms={farms} onFarmChange={setFarm}
        connectionStatus={connectionStatus}
        lastUpdated={data ? new Date(data.generated_at) : null}
        isLoading={isLoading} onRefresh={() => mutate()}
      />

      <main className="flex-1 overflow-y-auto p-5">
        <div className="max-w-screen-2xl mx-auto space-y-8">

          {/* Range selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-slate-500 uppercase tracking-wider mr-1">Period:</span>
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                  range === r.value
                    ? "bg-brand-green/15 text-brand-green border-brand-green/30"
                    : "bg-surface-card text-slate-400 border-surface-border hover:text-slate-200",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          {isLoading && !data && (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-40 rounded-xl bg-surface-hover animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <Card className="flex items-center gap-3 border-red-500/30 bg-red-500/10">
              <AlertCircle size={16} className="text-red-400 shrink-0" />
              <p className="text-sm text-red-300">Could not load analytics for this period.</p>
            </Card>
          )}

          {data && (
            <>
              {/* ── 0. Coverage — the caveat that governs everything below ── */}
              <CoverageNotice coverage={data.parameters.temperature.coverage} />

              {/* ── 1. Environment health ── */}
              <section>
                <SectionTitle
                  n="01" icon={Activity}
                  title="Environment Health"
                  subtitle="How much of the monitored time the crop spent in a good range, how often conditions crossed the alert threshold, and how long the worst unbroken spell lasted."
                />
                <div className="space-y-6">
                  {PARAMS.map(({ key, label, unit }) => (
                    <div key={key}>
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
                      <ParameterHealth p={data.parameters[key]} unit={unit} label={label} />
                    </div>
                  ))}
                </div>
              </section>

              {/* ── 2. Distribution ── */}
              <section>
                <SectionTitle
                  n="02" icon={BarChart3}
                  title="Distribution & Variability"
                  subtitle="The shape behind the average. A steady 32 °C and a day swinging between 26 °C and 37 °C share the same mean but call for different decisions — this is where they look different."
                />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {PARAMS.map(({ key, label, unit, color, icon: Icon }) => {
                    const p = data.parameters[key];
                    if (!p.histogram || !p.describe) {
                      return (
                        <Card key={key}>
                          <p className="text-sm text-slate-600">Not enough {label.toLowerCase()} data.</p>
                        </Card>
                      );
                    }
                    const d = p.describe;
                    return (
                      <Card key={key}>
                        <p className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                          <Icon size={13} /> {label}
                        </p>

                        {/* Headline statistics get real weight — they are the
                            finding; the chart below is the supporting evidence.
                            Median is emphasised over mean when the distribution
                            is skewed enough for the two to disagree. */}
                        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                          {([
                            ["Mean", `${d.mean.toFixed(1)}${unit}`, Math.abs(d.skewness ?? 0) <= 0.3],
                            ["Median", `${d.median.toFixed(1)}${unit}`, Math.abs(d.skewness ?? 0) > 0.3],
                            ["Std dev", `± ${d.sd.toFixed(2)}`, false],
                            ["Range", `${d.min.toFixed(1)}–${d.max.toFixed(1)}`, false],
                          ] as const).map(([k, v, emphasised]) => (
                            <div
                              key={k}
                              className={clsx(
                                "rounded-lg px-2.5 py-2 border",
                                emphasised
                                  ? "bg-surface-hover border-brand-green/30"
                                  : "bg-surface-hover border-surface-border",
                              )}
                            >
                              <dt className="text-[10px] uppercase tracking-widest text-slate-500">{k}</dt>
                              <dd className="text-lg font-bold font-mono-num tabular-nums text-slate-100 mt-0.5 leading-none">
                                {v}
                              </dd>
                            </div>
                          ))}
                        </dl>

                        <DistributionChart
                          histogram={p.histogram}
                          describe={d}
                          threshold={data.thresholds[key]}
                          unit={unit}
                          color={color}
                        />
                        {d.skewness != null && Math.abs(d.skewness) > 0.3 && (
                          <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                            Skew of {d.skewness.toFixed(2)} means the distribution leans{" "}
                            {d.skewness > 0 ? "right — occasional high spikes stretch further than the lows" : "left — occasional low readings stretch further than the highs"}.
                            The median ({d.median.toFixed(1)}{unit}) is the more reliable summary here than the mean ({d.mean.toFixed(1)}{unit}).
                          </p>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </section>

              {/* ── 3. Daily pattern ── */}
              <section>
                <SectionTitle
                  n="03" icon={Clock}
                  title="Daily Pattern"
                  subtitle="The average shape of a day, with a confidence band showing how much each hour varies from one day to the next — this is what identifies the problem window to act on."
                />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {PARAMS.map(({ key, label, unit, color, icon: Icon }) => {
                    const p = data.parameters[key];
                    return (
                      <Card key={key}>
                        <p className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                          <Icon size={13} /> {label} by hour
                        </p>
                        {p.diurnal?.peak_hour != null && (
                          <p className="text-[11px] text-slate-500 mb-3">
                            Peaks around{" "}
                            <strong className="text-slate-300 font-mono-num">
                              {String(p.diurnal.peak_hour).padStart(2, "0")}:00
                            </strong>{" "}
                            at{" "}
                            <strong className="text-slate-300 font-mono-num">
                              {p.diurnal.peak_mean?.toFixed(1)}{unit}
                            </strong>
                          </p>
                        )}
                        {p.diurnal ? (
                          <DiurnalChart
                            diurnal={p.diurnal}
                            threshold={data.thresholds[key]}
                            unit={unit}
                            color={color}
                          />
                        ) : (
                          <p className="text-sm text-slate-600 py-6 text-center">No hourly data.</p>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </section>

              {/* ── 4. System effectiveness ── */}
              <section>
                <SectionTitle
                  n="04" icon={CloudDrizzle}
                  title="System Effectiveness"
                  subtitle="Whether spraying produced a measurable temperature change, how confident that estimate is, and what it costs in water. Each spray is compared against its own immediately-preceding baseline."
                />
                <Card>
                  <SprayEffectPanel effect={data.spray.effect} water={data.spray.water_efficiency} />
                </Card>
              </section>

              <p className="text-[11px] text-slate-600 text-center pb-2">
                Generated {new Date(data.generated_at).toLocaleString()} · farm {data.farm} · period {data.range_days}d ·
                methodology documented in ANALYTICS_METHODOLOGY.md
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
