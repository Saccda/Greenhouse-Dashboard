"use client";
import { useState, useEffect, useMemo } from "react";
import useSWR from "swr";
import { format, subDays, parseISO } from "date-fns";
import { CalendarDays, CloudDrizzle } from "lucide-react";

import { swrFetcher } from "@/lib/api";
import Header from "@/components/layout/Header";
import SensorChart from "@/components/charts/SensorChart";
import SprayEventsTable from "@/components/dashboard/SprayEventsTable";
import { DateRangePicker, AggregationDropdown, type RangePreset } from "@/components/historical/DateRangeControls";
import { useFarmSelection } from "@/hooks/useFarmSelection";
import { fmt } from "@/lib/stats";
import type { HistoryResponse, SprayStatsResponse, Aggregation } from "@/types";

const today    = () => format(new Date(), "yyyy-MM-dd");
const nDaysAgo = (n: number) => format(subDays(new Date(), n), "yyyy-MM-dd");

function autoAgg(start: string, end: string): Aggregation {
  const days = (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000;
  if (days <= 1)  return "5m";
  if (days <= 7)  return "1h";
  if (days <= 30) return "6h";
  return "1d";
}

// Options offered alongside "Auto" - kept in the same safe tier as autoAgg's own thresholds,
// since the backend applies no validation or row cap of its own on this parameter.
function aggOptionsFor(start: string, end: string): Aggregation[] {
  const days = (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000;
  if (days <= 1)  return ["5m", "15m", "1h"];
  if (days <= 7)  return ["15m", "1h", "6h"];
  if (days <= 30) return ["1h", "6h", "1d"];
  return ["6h", "1d"];
}

const QUICK: RangePreset[] = [
  { label: "Today",     start: () => today(),     end: () => today()     },
  { label: "Yesterday", start: () => nDaysAgo(1),  end: () => nDaysAgo(1) },
  { label: "Last 7d",   start: () => nDaysAgo(6),  end: () => today()     },
  { label: "Last 30d",  start: () => nDaysAgo(29), end: () => today()     },
];

function SprayStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-hover rounded-lg px-4 py-3 text-center border border-surface-border">
      <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-lg font-bold font-mono-num text-cyan-400">{value}</p>
    </div>
  );
}

export default function HistoricalPage() {
  const { farm, setFarm, farms } = useFarmSelection();
  const [start, setStart] = useState(nDaysAgo(6));
  const [end,   setEnd]   = useState(today());
  const [aggMode, setAggMode] = useState<"auto" | Aggregation>("auto");

  const computedAgg = useMemo(() => autoAgg(start, end), [start, end]);
  const aggOptions  = useMemo(() => aggOptionsFor(start, end), [start, end]);

  // If the range changes and the manually-picked aggregation is no longer in the safe
  // tier for it, fall back to auto rather than silently sending an unsafe value.
  useEffect(() => {
    if (aggMode !== "auto" && !aggOptions.includes(aggMode)) setAggMode("auto");
  }, [aggMode, aggOptions]);

  const agg = aggMode === "auto" ? computedAgg : aggMode;

  const { data: history, isLoading, error, mutate } = useSWR<HistoryResponse>(
    `/api/sensors/history?farm=${farm}&start_date=${start}&end_date=${end}&agg=${agg}`,
    swrFetcher,
    { revalidateOnFocus: false },
  );

  const { data: sprayStats, isLoading: sprayLoading } = useSWR<SprayStatsResponse>(
    `/api/sensors/spray-stats?farm=${farm}&start_date=${start}&end_date=${end}`,
    swrFetcher,
    { revalidateOnFocus: false },
  );

  const connectionStatus = error ? "offline" : history ? "online" : "loading";
  const stats = sprayStats?.stats;

  const tableRows = useMemo(() => {
    const temp = history?.series?.temperature ?? [];
    const hum  = history?.series?.humidity    ?? [];
    const map  = new Map<string, { temp?: number; hum?: number }>();
    temp.forEach((p) => { map.set(p.time, { temp: p.value }); });
    hum.forEach((p)  => {
      const ex = map.get(p.time) ?? {};
      map.set(p.time, { ...ex, hum: p.value });
    });
    return [...map.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 100);
  }, [history]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header
        selectedFarm={farm} farms={farms} onFarmChange={setFarm}
        connectionStatus={connectionStatus} lastUpdated={history ? new Date() : null}
        isLoading={isLoading} onRefresh={() => mutate()}
      />

      <main className="flex-1 overflow-y-auto p-5">
        <div className="max-w-screen-2xl mx-auto space-y-5">

        {/* Date range controls */}
        <section className="bg-surface-card border border-surface-border rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <CalendarDays size={13} /> Date Range
            </span>
            <DateRangePicker
              start={start} end={end} presets={QUICK}
              onChange={(s, e) => { setStart(s); setEnd(e); }}
            />
            <div className="hidden sm:block w-px h-6 bg-surface-border" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Aggregation</span>
            <AggregationDropdown
              value={aggMode} autoValue={computedAgg} options={aggOptions}
              onChange={setAggMode}
            />
          </div>
        </section>

        {/* Sensor trend chart */}
        <section className="bg-surface-card border border-surface-border rounded-xl p-4">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Sensor Trend — {start} to {end}
          </h2>
          <SensorChart
            temperature={history?.series?.temperature}
            humidity={history?.series?.humidity}
            relay3={history?.series?.relay3}
            isLoading={isLoading && !history}
          />
        </section>

        {/* Spray events */}
        <section className="bg-surface-card border border-surface-border rounded-xl p-4">
          <h2 className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            <CloudDrizzle size={13} className="text-cyan-400" />
            Spray Events — {start} to {end}
          </h2>

          {/* Summary KPIs */}
          {!sprayLoading && stats && stats.data_status !== "no_data" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <SprayStat label="Total Sprays"    value={String(stats.total_sprays)} />
              <SprayStat label="Total Duration"  value={
                stats.total_spray_minutes < 60
                  ? `${fmt(stats.total_spray_minutes, 1)}m`
                  : `${fmt(stats.total_spray_minutes / 60, 1)}h`
              } />
              <SprayStat label="Avg Duration"    value={`${fmt(stats.avg_spray_minutes, 1)}m`} />
              <SprayStat label="Est. Water Use"  value={
                stats.estimated_water_liters != null
                  ? `${fmt(stats.estimated_water_liters, 0)} L`
                  : "Not configured"
              } />
            </div>
          )}

          <SprayEventsTable
            stats={stats}
            isLoading={sprayLoading && !sprayStats}
            showDate={true}
            emptyText="No spray events in this date range"
          />
        </section>

        {/* Readings table */}
        <section className="bg-surface-card border border-surface-border rounded-xl p-4">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Readings (latest 100)
          </h2>
          {isLoading && !history ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 bg-surface-hover animate-pulse rounded" />
              ))}
            </div>
          ) : tableRows.length === 0 ? (
            <p className="text-sm text-slate-600 text-center py-6">No data for this range</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-600 border-b border-surface-border">
                    <th className="pb-2 pr-4 font-medium">Timestamp</th>
                    <th className="pb-2 pr-4 font-medium">Temperature (°C)</th>
                    <th className="pb-2 font-medium">Humidity (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map(([time, vals]) => (
                    <tr key={time} className="border-b border-surface-border/40 last:border-0">
                      <td className="py-1.5 pr-4 text-slate-400 font-mono-num">
                        {format(parseISO(time), "yyyy-MM-dd HH:mm")}
                      </td>
                      <td className="py-1.5 pr-4 font-mono-num text-orange-400">
                        {vals.temp != null ? vals.temp.toFixed(1) : "—"}
                      </td>
                      <td className="py-1.5 font-mono-num text-blue-400">
                        {vals.hum != null ? vals.hum.toFixed(1) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </div>
      </main>
    </div>
  );
}
