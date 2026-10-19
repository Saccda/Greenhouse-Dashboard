"use client";
/**
 * DashboardContent — the landing page for whichever farm is selected.
 *
 * WHAT WAS WRONG, AND IT WAS NOT MAINLY LAYOUT
 *
 * On PP Campus three of the five figures across the top were permanently "—",
 * the chart never shaded a single spray, and the spray table was always empty.
 * Not a styling problem: every piece of spray analysis queried the field
 * "relay3" literally, and campus runs an eight-channel controller whose pump
 * is CH2. The query matched nothing and returned a clean empty result, so the
 * page reported, confidently and without one error anywhere, that the farm had
 * never watered itself. The farm now sends its own spray_field and the
 * analysis honours it.
 *
 * WHAT THIS PAGE IS FOR, NOW THAT THE OTHERS EXIST
 *
 * It had drifted into showing a weaker copy of three other pages: a relay
 * panel that Control owns, an alert list that Alert Log owns, and a spray
 * table that Analytics and Historical both do better. So each page gets one
 * question:
 *
 *   Dashboard    is the farm all right, and what has it done today
 *   Control      change something
 *   Analytics    is the cooling actually working
 *   Historical   look up a specific day
 *   Alert Log    what has gone wrong, and when
 *
 * Which leaves this page owning the glance. Everything on it is either a
 * current condition or today's behaviour, and anything that invites a decision
 * links to the page that owns the decision rather than reproducing its
 * controls.
 *
 * THE CHART CARRIES THE RELATIONSHIP
 *
 * Temperature, humidity, the warning thresholds and the spray periods share
 * one time axis, because every question worth asking here is about how they
 * relate — did it spray when it got hot, did the temperature come down
 * afterwards. Split across separate panels that becomes a memory exercise.
 */
import { useState } from "react";
import Link from "next/link";
import {
  Thermometer, Droplets, Droplet, Timer, WifiOff, ArrowUpRight, AlertTriangle,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import useSWR from "swr";

import { useDashboard } from "@/hooks/useDashboard";
import { useSettings } from "@/hooks/useSettings";
import { useFarmSelection } from "@/hooks/useFarmSelection";
import { swrFetcher } from "@/lib/api";
import Header from "@/components/layout/Header";
import KPICard from "@/components/ui/KPICard";
import SensorChart from "@/components/charts/SensorChart";
import ChannelSummary from "@/components/dashboard/ChannelSummary";
import SoilPanel from "@/components/dashboard/SoilPanel";
import { TIME_RANGE_OPTIONS, type Farm, type TimeRange, type Aggregation, type WaterResponse } from "@/types";

export default function DashboardContent() {
  const { settings } = useSettings();
  const { farm, setFarm, farms } = useFarmSelection();
  const [timeRange, setTimeRange] = useState<TimeRange>("-24h");
  const [aggregation] = useState<Aggregation>("15m");
  const tempWarn = settings.tempWarn;
  const humWarn = settings.humWarn;

  const {
    latest, history, sprayStats, isLoading, connectionStatus, lastUpdated, refresh,
  } = useDashboard({ farm, timeRange, aggregation, tempWarn, humWarn });

  const { data: farmList } = useSWR<{ farms: Farm[] }>("/api/farms/", swrFetcher);
  const thisFarm = farmList?.farms?.find((f) => f.id === farm);
  // Which series carries the pump here. Falls back rather than assuming, so a
  // farm the API has not described yet degrades to the old behaviour instead
  // of charting nothing.
  const sprayField = thisFarm?.spray_field ?? "relay3";
  const measuresWater = thisFarm?.water_source === "measured";
  // Empty until probes are configured, at which point the panel appears on its
  // own. Nothing here names a probe.
  const soilProbes = thisFarm?.soil_probes ?? [];

  const { data: water } = useSWR<WaterResponse>(
    measuresWater ? `/api/sensors/water?farm=${farm}` : null,
    swrFetcher, { refreshInterval: 300_000 },
  );

  const isOffline = latest ? !latest.is_online : false;
  const temp = !isOffline ? latest?.readings?.temperature?.value : undefined;
  const humidity = !isOffline ? latest?.readings?.humidity?.value : undefined;

  const stats = sprayStats?.stats;
  const rangeLabel = TIME_RANGE_OPTIONS.find((o) => o.value === timeRange)?.label ?? timeRange;

  const activeAlerts = latest?.alerts ?? [];

  // Any spray whose duration is bounded by a blackout rather than by the pump
  // stopping. Surfaced because the figure beside it would otherwise look like
  // a measurement when it is a lower bound.
  const interrupted = (stats?.spray_events ?? []).filter(
    (e) => (e as { gap_interrupted?: boolean }).gap_interrupted,
  ).length;

  const tempStatus: "ok" | "warn" | "danger" | undefined =
    isOffline || temp == null ? undefined
      : temp >= tempWarn ? "danger"
        : temp >= tempWarn - 3 ? "warn"
          : "ok";

  const humStatus: "ok" | "warn" | "danger" | undefined =
    isOffline || humidity == null ? undefined
      : humidity >= humWarn ? "danger"
        : humidity >= humWarn - 5 ? "warn"
          : "ok";

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

      {isOffline && (
        <div className="flex items-center gap-3 px-5 py-3 bg-amber-500/10 border-b border-amber-500/30 text-sm text-slate-200">
          <WifiOff size={16} className="shrink-0 text-[color:var(--warn-ink)]" />
          <span>
            <strong className="font-semibold text-[color:var(--warn-ink)]">System offline</strong>
            {" — sensor data is not being received."}
            {latest?.data_age_minutes != null && (
              <> Last reading was <strong className="font-semibold text-[color:var(--warn-ink)]">{latest.data_age_minutes.toFixed(0)} min ago</strong></>
            )}
            {latest?.last_seen && <> (at {format(parseISO(latest.last_seen), "HH:mm")})</>}
          </span>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* ── Conditions and today's work ─────────────────────────────
            Four, not five. The fifth was "Total Spray" beside "Sprays" and
            "Avg Duration", which is the same fact three ways — total is
            count times average. Water takes the freed slot, and it is the
            figure nothing else on this page carries. */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard
            title="Temperature"
            value={temp != null ? temp.toFixed(1) : "—"}
            rawValue={temp}
            decimals={1}
            unit={!isOffline ? "°C" : undefined}
            icon={Thermometer}
            subtitle={isOffline ? "No signal from sensor" : `Warns at ${tempWarn}°C`}
            isLoading={isLoading && !latest}
            isStale={isOffline}
            status={tempStatus}
          />
          <KPICard
            title="Humidity"
            value={humidity != null ? humidity.toFixed(1) : "—"}
            rawValue={humidity}
            decimals={1}
            unit={!isOffline ? "%" : undefined}
            icon={Droplets}
            subtitle={isOffline ? "No signal from sensor" : "Target 60–80%"}
            isLoading={isLoading && !latest}
            isStale={isOffline}
            status={humStatus}
          />
          <KPICard
            title="Spraying"
            value={stats?.total_spray_display ?? "—"}
            icon={Timer}
            subtitle={
              stats == null ? `Last ${rangeLabel}`
                : stats.total_sprays === 0 ? `Did not run · last ${rangeLabel}`
                  : `${stats.total_sprays} cycle${stats.total_sprays === 1 ? "" : "s"}, averaging ${stats.avg_spray_minutes?.toFixed(1)} min`
            }
            isLoading={isLoading && !sprayStats}
          />
          <WaterCard
            measured={measuresWater}
            water={water}
            estimatedLiters={stats?.estimated_water_liters}
            rangeLabel={rangeLabel}
            isLoading={isLoading && !sprayStats}
          />
        </section>

        {/* ── Range ───────────────────────────────────────────────────── */}
        <section className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-slate-500 uppercase tracking-wider mr-1">Range:</span>
          {(["-1h", "-6h", "-24h", "-7d", "-30d"] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                timeRange === r
                  ? "bg-brand-green/15 text-brand-green border border-brand-green/30"
                  : "bg-surface-card text-slate-500 border border-surface-border hover:text-slate-300"
              }`}
            >
              {r.replace("-", "")}
            </button>
          ))}
          {interrupted > 0 && (
            <span className="flex items-center gap-1.5 ml-auto text-[11px] text-[color:var(--warn-ink)]">
              <AlertTriangle size={13} className="shrink-0" />
              {interrupted} spray{interrupted === 1 ? "" : "s"} cut short by a gap in the feed — runtime above is a minimum
            </span>
          )}
        </section>

        {/* ── The chart ───────────────────────────────────────────────── */}
        <section className="bg-surface-card border border-surface-border rounded-xl p-4">
          <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Temperature, humidity and spraying
            </h2>
            <span className="text-[11px] text-slate-500">
              Shaded bands are spray periods
            </span>
          </div>
          <SensorChart
            temperature={history?.series?.temperature}
            humidity={history?.series?.humidity}
            relay3={history?.series?.[sprayField]}
            tempWarn={tempWarn}
            humWarn={humWarn}
            isLoading={isLoading && !history}
          />
        </section>

        {/* Soil, when fitted. Sits under the chart because it is a slower
            story than air temperature, and above the status cards because a
            root-zone reading is a condition, not a control. */}
        <SoilPanel
          probes={soilProbes}
          latest={latest}
          history={history}
          isOffline={isOffline}
        />

        {/* ── What is running, and anything wrong ─────────────────────
            Both read-only. The relay panel that used to sit here offered
            the same switches as the Control page; two places to turn a
            pump on is one place too many. */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card
            title="What's running now"
            href="/control"
            hrefLabel="Control"
          >
            <ChannelSummary
              relays={latest?.relays ?? []}
              isLoading={isLoading && !latest}
              isOffline={isOffline}
            />
          </Card>

          <Card
            title={activeAlerts.length ? `Active alerts (${activeAlerts.length})` : "Active alerts"}
            href="/alert-log"
            hrefLabel="Full history"
          >
            {activeAlerts.length === 0 ? (
              <p className="text-[13px] text-slate-400 py-3">
                Nothing active. Everything is inside its thresholds.
              </p>
            ) : (
              <ul className="space-y-2">
                {activeAlerts.map((a, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30"
                  >
                    <AlertTriangle size={14} className="shrink-0 mt-0.5 text-[color:var(--warn-ink)]" />
                    <span className="text-[13px] text-slate-200 leading-snug">{a.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

      </main>
    </div>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function Card({
  title, href, hrefLabel, children,
}: { title: string; href: string; hrefLabel: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</h2>
        <Link
          href={href}
          className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-200 transition-colors"
        >
          {hrefLabel}
          <ArrowUpRight size={12} />
        </Link>
      </div>
      {children}
    </div>
  );
}

function WaterCard({
  measured, water, estimatedLiters, rangeLabel, isLoading,
}: {
  measured: boolean;
  water?: WaterResponse;
  estimatedLiters?: number | null;
  rangeLabel: string;
  isLoading: boolean;
}) {
  // A measured figure and an estimated one are different claims, so they are
  // never shown in the same words. The estimate exists because there is no
  // meter; labelling both "Water" would hide which one you are reading.
  if (measured) {
    const r = water?.readings?.[0];
    const unit = water?.unit_label ?? "";
    const days = r ? Math.floor((Date.now() - new Date(r.timestamp).getTime()) / 86_400_000) : null;
    return (
      <KPICard
        title="Water Consumption"
        value={r?.consumption != null ? String(r.consumption) : "—"}
        unit={r?.consumption != null ? unit : undefined}
        icon={Droplet}
        subtitle={
          !water ? "Reading meter…"
            : !r ? "Meter fitted, nothing reported yet"
              : `Metered · last reported ${days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}`
        }
        isLoading={isLoading && !water}
      />
    );
  }
  return (
    <KPICard
      title="Water Consumption"
      value={estimatedLiters != null ? Math.round(estimatedLiters).toLocaleString() : "—"}
      unit={estimatedLiters != null ? "L" : undefined}
      icon={Droplet}
      subtitle={
        estimatedLiters != null
          ? `Estimated from runtime · last ${rangeLabel}`
          : "No meter and no nozzle spec configured"
      }
      isLoading={isLoading}
    />
  );
}
