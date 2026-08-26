"use client";
import { useState } from "react";
import useSWR from "swr";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { Thermometer, Droplets, Activity, Droplet, Timer, Clock, CloudDrizzle } from "lucide-react";
import { clsx } from "clsx";

import { swrFetcher } from "@/lib/api";
import { calcStats, fmt } from "@/lib/stats";
import { useFarmSelection } from "@/hooks/useFarmSelection";
import Header from "@/components/layout/Header";
import KPICard from "@/components/ui/KPICard";
import type { HistoryResponse, SprayStatsResponse, TimeRange, Aggregation } from "@/types";

// ── Period options ────────────────────────────────────────────────────────
const PERIODS = [
  { label: "24 Hours", range: "-24h" as TimeRange, agg: "15m" as Aggregation },
  { label: "7 Days",   range: "-7d"  as TimeRange, agg: "1h"  as Aggregation },
  { label: "30 Days",  range: "-30d" as TimeRange, agg: "6h"  as Aggregation },
];

// ── Custom tooltip ────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-card border border-surface-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label ? format(new Date(label), "MMM d, HH:mm") : ""}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300 capitalize">{p.dataKey}:</span>
          <span className="font-mono-num font-semibold" style={{ color: p.color }}>
            {Number(p.value).toFixed(1)}{p.dataKey === "temperature" ? "°C" : "%"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { farm, setFarm, farms } = useFarmSelection();
  const [period, setPeriod] = useState(PERIODS[0]);

  const { data: history, isLoading, error } = useSWR<HistoryResponse>(
    `/api/sensors/history?farm=${farm}&range=${period.range}&agg=${period.agg}`,
    swrFetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const { data: sprayStats, isLoading: sprayLoading } = useSWR<SprayStatsResponse>(
    `/api/sensors/spray-stats?farm=${farm}&range=${period.range}`,
    swrFetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const sprayStats_ = sprayStats?.stats;

  const tempValues = history?.series?.temperature?.map((p) => p.value) ?? [];
  const humValues  = history?.series?.humidity?.map((p) => p.value)    ?? [];
  const tempStats  = calcStats(tempValues);
  const humStats   = calcStats(humValues);

  const chartData = (history?.series?.temperature ?? []).map((p) => ({
    time:        parseISO(p.time).getTime(),
    temperature: p.value,
    humidity:    history?.series?.humidity?.find((h) => h.time === p.time)?.value,
  }));

  const connectionStatus = error ? "offline" : history ? "online" : "loading";
  const loading = isLoading && !history;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header
        selectedFarm={farm}
        farms={farms}
        onFarmChange={setFarm}
        connectionStatus={connectionStatus}
        lastUpdated={history ? new Date() : null}
        isLoading={isLoading}
        onRefresh={() => {}}
      />

      <main className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Period selector */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500 uppercase tracking-wider mr-1">Period:</span>
          {PERIODS.map((p) => (
            <button
              key={p.label}
              onClick={() => setPeriod(p)}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                period.label === p.label
                  ? "bg-brand-green/15 text-brand-green border-brand-green/30"
                  : "bg-surface-card text-slate-400 border-surface-border hover:text-slate-200",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Temperature stats */}
        <section>
          <h2 className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            <Thermometer size={13} className="text-sky-400" /> Temperature Statistics
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPICard
              title="Average"
              value={fmt(tempStats?.mean)}
              unit="°C"
              icon={Thermometer}
              subtitle={`Over ${tempStats?.count ?? 0} samples`}
              isLoading={loading}
            />
            <KPICard
              title="Maximum"
              value={fmt(tempStats?.max)}
              unit="°C"
              icon={Thermometer}
              subtitle="Peak reading"
              isLoading={loading}
            />
            <KPICard
              title="Minimum"
              value={fmt(tempStats?.min)}
              unit="°C"
              icon={Thermometer}
              subtitle="Lowest reading"
              isLoading={loading}
            />
            <KPICard
              title="Std Dev"
              value={fmt(tempStats?.std)}
              unit="°C"
              icon={Activity}
              subtitle="Variability"
              isLoading={loading}
            />
          </div>
        </section>

        {/* Humidity stats */}
        <section>
          <h2 className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            <Droplets size={13} className="text-sky-400" /> Humidity Statistics
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPICard
              title="Average"
              value={fmt(humStats?.mean)}
              unit="%"
              icon={Droplets}
              subtitle={`Over ${humStats?.count ?? 0} samples`}
              isLoading={loading}
            />
            <KPICard
              title="Maximum"
              value={fmt(humStats?.max)}
              unit="%"
              icon={Droplets}
              subtitle="Peak reading"
              isLoading={loading}
            />
            <KPICard
              title="Minimum"
              value={fmt(humStats?.min)}
              unit="%"
              icon={Droplets}
              subtitle="Lowest reading"
              isLoading={loading}
            />
            <KPICard
              title="Std Dev"
              value={fmt(humStats?.std)}
              unit="%"
              icon={Activity}
              subtitle="Variability"
              isLoading={loading}
            />
          </div>
        </section>

        {/* Spray stats */}
        <section>
          <h2 className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            <CloudDrizzle size={13} className="text-cyan-400" /> Spray Statistics
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPICard
              title="Total Sprays"
              value={sprayStats_?.total_sprays ?? "—"}
              icon={Droplet}
              subtitle={`Irrigation events — ${period.label}`}
              isLoading={sprayLoading && !sprayStats}
            />
            <KPICard
              title="Avg Duration"
              value={sprayStats_?.avg_spray_minutes != null ? fmt(sprayStats_.avg_spray_minutes, 1) : "—"}
              unit="min"
              icon={Timer}
              subtitle="Average time per spray cycle"
              isLoading={sprayLoading && !sprayStats}
            />
            <KPICard
              title="Total Duration"
              value={sprayStats_?.total_spray_display ?? "—"}
              icon={Clock}
              subtitle={`Total irrigation time — ${period.label}`}
              isLoading={sprayLoading && !sprayStats}
            />
            <KPICard
              title="Est. Water Use"
              value={sprayStats_?.estimated_water_liters != null ? fmt(sprayStats_.estimated_water_liters, 0) : "Not configured"}
              unit={sprayStats_?.estimated_water_liters != null ? "L" : undefined}
              icon={CloudDrizzle}
              subtitle="Based on the farm's fogger spec"
              isLoading={sprayLoading && !sprayStats}
            />
          </div>
        </section>

        {/* Combined trend chart */}
        <section className="bg-surface-card border border-surface-border rounded-xl p-4">
          <h2 className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            <Activity size={13} /> Trend — {period.label}
          </h2>

          {isLoading && !history ? (
            <div className="h-64 animate-pulse rounded-lg bg-surface-hover" />
          ) : chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-600 text-sm">
              No data for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gradTemp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#fb923c" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#fb923c" stopOpacity={0}   />
                  </linearGradient>
                  <linearGradient id="gradHum" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#60a5fa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(80,140,255,0.15)" vertical={false} />
                <XAxis
                  dataKey="time" type="number" scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v) => format(new Date(v), period.range === "-24h" ? "HH:mm" : "MMM d")}
                  tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={60}
                />
                <YAxis yAxisId="temp" domain={["auto", "auto"]} tick={{ fill: "#fb923c", fontSize: 11 }}
                  axisLine={false} tickLine={false} width={36} tickFormatter={(v) => `${v}°`} />
                <YAxis yAxisId="hum" orientation="right" domain={[0, 100]}
                  tick={{ fill: "#60a5fa", fontSize: 11 }} axisLine={false} tickLine={false}
                  width={36} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#8b9eb3" }} />
                <Area yAxisId="temp" type="monotone" dataKey="temperature"
                  stroke="#fb923c" strokeWidth={1.5} fill="url(#gradTemp)" dot={false} isAnimationActive={false} />
                <Area yAxisId="hum" type="monotone" dataKey="humidity"
                  stroke="#60a5fa" strokeWidth={1.5} fill="url(#gradHum)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </section>

      </main>
    </div>
  );
}
