"use client";
/**
 * DashboardContent — the full dashboard page wrapped as a client component
 * so it can use hooks, state, and Socket.io.
 */
import { useState } from "react";
import {
  Thermometer,
  Droplets,
  Droplet,
  Timer,
  Clock,
  WifiOff,
} from "lucide-react";
import { format, parseISO } from "date-fns";

import { useDashboard } from "@/hooks/useDashboard";
import { useSettings }  from "@/hooks/useSettings";
import { useFarmSelection } from "@/hooks/useFarmSelection";
import Header           from "@/components/layout/Header";
import KPICard          from "@/components/ui/KPICard";
import SensorChart      from "@/components/charts/SensorChart";
import { RelayPanel }   from "@/components/hmi/RelayIndicator";
import AlertPanel       from "@/components/dashboard/AlertPanel";
import SprayEventsTable from "@/components/dashboard/SprayEventsTable";
import { TIME_RANGE_OPTIONS, type TimeRange, type Aggregation } from "@/types";

export default function DashboardContent() {
  const { settings }                  = useSettings();
  const { farm, setFarm, farms }      = useFarmSelection();
  const [timeRange,   setTimeRange]   = useState<TimeRange>("-24h");
  const [aggregation] = useState<Aggregation>("15m");
  const tempWarn                      = settings.tempWarn;
  const humWarn                       = settings.humWarn;

  const {
    latest,
    history,
    sprayStats,
    isLoading,
    connectionStatus,
    lastUpdated,
    refresh,
  } = useDashboard({ farm, timeRange, aggregation, tempWarn, humWarn });

  // ── Derived values ────────────────────────────────────────────────────
  const isOffline = latest ? !latest.is_online : false;

  const temp     = !isOffline ? latest?.readings?.temperature?.value : undefined;
  const humidity = !isOffline ? latest?.readings?.humidity?.value    : undefined;

  const sprayStats_ = sprayStats?.stats;
  const rangeLabel  = TIME_RANGE_OPTIONS.find((o) => o.value === timeRange)?.label ?? timeRange;
  const isMultiDay  = timeRange === "-7d" || timeRange === "-30d";

  // ── Status (ok / warn / danger) ───────────────────────────────────
  const tempStatus: "ok" | "warn" | "danger" | undefined =
    isOffline || temp == null ? undefined
    : temp >= tempWarn        ? "danger"
    : temp >= tempWarn - 3    ? "warn"
    : "ok";

  const humStatus: "ok" | "warn" | "danger" | undefined =
    isOffline || humidity == null ? undefined
    : humidity >= humWarn         ? "danger"
    : humidity >= humWarn - 5     ? "warn"
    : "ok";

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header bar */}
      <Header
        selectedFarm={farm}
        farms={farms}
        onFarmChange={setFarm}
        connectionStatus={connectionStatus}
        lastUpdated={lastUpdated}
        isLoading={isLoading}
        onRefresh={refresh}
      />

      {/* Offline banner — shown when sensor data is stale */}
      {isOffline && (
        <div className="flex items-center gap-3 px-5 py-2.5 bg-slate-800/60 border-b border-slate-700/50 text-sm text-slate-400">
          <WifiOff size={14} className="shrink-0 text-slate-500" />
          <span>
            System offline — sensor data is not being received.
            {latest?.data_age_minutes != null && (
              <> Last data was <strong className="text-slate-300">{latest.data_age_minutes.toFixed(0)} min ago</strong></>
            )}
            {latest?.last_seen && (
              <> (at {format(parseISO(latest.last_seen), "HH:mm")})</>
            )}
          </span>
        </div>
      )}

      {/* Scrollable main content */}
      <main className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* ── KPI row ───────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KPICard
            title="Temperature"
            value={temp != null ? temp.toFixed(1) : "—"}
            rawValue={temp}
            decimals={1}
            unit={!isOffline ? "°C" : undefined}
            icon={Thermometer}
            subtitle={
              isOffline
                ? "No signal from sensor"
                : `Warn threshold set at ${tempWarn}°C`
            }
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
            subtitle={
              isOffline
                ? "No signal from sensor"
                : "Target relative humidity 60–80%"
            }
            isLoading={isLoading && !latest}
            isStale={isOffline}
            status={humStatus}
          />
          <KPICard
            title="Sprays"
            value={sprayStats_?.total_sprays ?? "—"}
            icon={Droplet}
            subtitle={`Automated irrigation events — last ${rangeLabel}`}
            isLoading={isLoading && !sprayStats}
          />
          <KPICard
            title="Avg Duration"
            value={
              sprayStats_?.avg_spray_minutes != null
                ? sprayStats_.avg_spray_minutes.toFixed(1)
                : "—"
            }
            unit="min"
            icon={Timer}
            subtitle="Average time per spray cycle"
            isLoading={isLoading && !sprayStats}
          />
          <KPICard
            title="Total Spray"
            value={sprayStats_?.total_spray_display ?? "—"}
            icon={Clock}
            subtitle={`Total irrigation time — last ${rangeLabel}`}
            isLoading={isLoading && !sprayStats}
          />
        </section>

        {/* ── Time range selector ───────────────────────────────────── */}
        <section className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-slate-500 uppercase tracking-wider mr-1">
            Range:
          </span>
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
        </section>

        {/* ── Main chart ────────────────────────────────────────────── */}
        <section className="bg-surface-card border border-surface-border rounded-xl p-4">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Sensor Data Over Time
          </h2>
          <SensorChart
            temperature={history?.series?.temperature}
            humidity={history?.series?.humidity}
            relay3={history?.series?.relay3}
            tempWarn={tempWarn}
            humWarn={humWarn}
            isLoading={isLoading && !history}
          />
        </section>

        {/* ── Bottom row: HMI panel + spray events + alerts ─────────── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* HMI Relay panel */}
          <div className="bg-surface-card border border-surface-border rounded-xl p-4">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Control Panel
            </h2>
            <RelayPanel
              relays={latest?.relays ?? []}
              isLoading={isLoading && !latest}
            />
          </div>

          {/* Spray events */}
          <div className="bg-surface-card border border-surface-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Spray Events ({rangeLabel})
              </h2>
              {sprayStats_?.data_status === "stale" && (
                <span className="text-[10px] text-status-warning badge-warning px-2 py-0.5 rounded-full">
                  Stale data
                </span>
              )}
            </div>
            <SprayEventsTable
              stats={sprayStats_}
              isLoading={isLoading && !sprayStats}
              showDate={isMultiDay}
              emptyText={`No spray events in the last ${rangeLabel}`}
            />
          </div>

          {/* Alert panel */}
          <div className="bg-surface-card border border-surface-border rounded-xl p-4">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Active Alerts
            </h2>
            <AlertPanel
              alerts={latest?.alerts ?? []}
              isLoading={isLoading && !latest}
            />
          </div>

        </section>

      </main>
    </div>
  );
}
