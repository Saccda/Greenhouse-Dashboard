"use client";
import { useState, useEffect } from "react";
import useSWR from "swr";
import { Bell, Filter, RefreshCw, Download, Thermometer, Droplets, Droplet, Timer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { clsx } from "clsx";
import { format, parseISO } from "date-fns";

import { API_BASE, swrFetcher } from "@/lib/api";
import KPICard from "@/components/ui/KPICard";

// ── Types ─────────────────────────────────────────────────────────────────

interface AlertRow {
  id:           number;
  farm_id:      string;
  alert_type:   string;
  event:        string;
  sensor_value: number | null;
  threshold:    number | null;
  duration_min: number | null;
  gap_minutes:  number | null;   // offline gap excluded from duration_min; null = exact
  message:      string;
  created_at:   string;
}

interface LogResponse   { logs: AlertRow[]; count: number }
interface SummaryItem   { alert_type: string; event: string; count: number }
interface DurationItem  { alert_type: string; avg_min: number; resolved_count: number }
interface SummaryResponse { by_type: SummaryItem[]; avg_duration: DurationItem[] }

// ── Helpers ───────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  temperature: "Temperature",
  humidity:    "Humidity",
  empty_tank:  "Empty Tank",
  long_spray:  "Long Spray",
};

const EVENT_STYLE: Record<string, string> = {
  alert:    "bg-red-500/15 text-red-400 border-red-500/30",
  reminder: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  resolved: "bg-brand-green/15 text-brand-green border-brand-green/30",
};

const TYPE_STYLE: Record<string, string> = {
  temperature: "text-orange-400",
  humidity:    "text-blue-400",
  empty_tank:  "text-red-400",
  long_spray:  "text-amber-400",
};

function unitFor(type: string) {
  if (type === "temperature") return "°C";
  if (type === "humidity")    return "%";
  return " min";
}

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={clsx("inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border", cls)}>
      {text}
    </span>
  );
}

// ── Summary cards ─────────────────────────────────────────────────────────

const ALERT_ICONS: Record<string, LucideIcon> = {
  temperature: Thermometer,
  humidity:    Droplets,
  empty_tank:  Droplet,
  long_spray:  Timer,
};

function SummaryCards({ summary }: { summary: SummaryResponse | undefined }) {
  const types = ["temperature", "humidity", "empty_tank", "long_spray"];

  if (!summary) return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      {types.map((t) => (
        <KPICard key={t} title={TYPE_LABEL[t]} value="—" icon={ALERT_ICONS[t]} isLoading />
      ))}
    </div>
  );

  const alertCounts: Record<string, number> = {};
  summary.by_type.filter(r => r.event === "alert").forEach(r => {
    alertCounts[r.alert_type] = r.count;
  });

  const avgMap: Record<string, number> = {};
  summary.avg_duration.forEach(r => { avgMap[r.alert_type] = r.avg_min; });

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      {types.map((t) => (
        <KPICard
          key={t}
          title={TYPE_LABEL[t]}
          value={alertCounts[t] ?? 0}
          icon={ALERT_ICONS[t]}
          subtitle={avgMap[t] != null ? `Avg ${avgMap[t].toFixed(0)} min active` : "Incidents (30 d)"}
        />
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function AlertLogPage() {
  const [days,      setDays]      = useState(7);
  const [typeFilter, setTypeFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");

  // Mark all current alerts as seen the moment this page mounts
  useEffect(() => {
    localStorage.setItem("gh_last_alert_view", new Date().toISOString());
  }, []);

  const params = new URLSearchParams({ days: String(days) });
  if (typeFilter)  params.set("type",  typeFilter);
  if (eventFilter) params.set("event", eventFilter);

  const { data, isLoading, mutate } = useSWR<LogResponse>(
    `/api/notifications/log?${params}`,
    swrFetcher,
    { refreshInterval: 60_000 },
  );

  const { data: summary } = useSWR<SummaryResponse>(
    "/api/notifications/log/summary?days=30",
    swrFetcher,
    { refreshInterval: 300_000 },
  );

  function handleExport() {
    window.location.href = `${API_BASE}/api/notifications/log/export?${params}`;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3.5 bg-surface-card border-b border-surface-border shrink-0">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-slate-400" />
          <h1 className="text-sm font-semibold text-slate-200">Alert Log</h1>
          {data && (
            <span className="text-[11px] text-slate-500 font-mono-num ml-1">
              {data.count} rows
            </span>
          )}
        </div>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-5">

        {/* 30-day summary */}
        <SummaryCards summary={summary} />

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter size={12} /> Filters:
          </div>

          {/* Days */}
          <div className="flex items-center gap-1 bg-surface-card border border-surface-border rounded-lg p-0.5">
            {[1, 7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={clsx(
                  "px-2.5 py-1 rounded-md text-xs transition-colors",
                  days === d
                    ? "bg-brand-green/15 text-brand-green font-medium"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                {d === 1 ? "24 h" : `${d} d`}
              </button>
            ))}
          </div>

          {/* Type */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-surface-card border border-surface-border text-slate-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-green/40"
          >
            <option value="">All types</option>
            <option value="temperature">Temperature</option>
            <option value="humidity">Humidity</option>
            <option value="empty_tank">Empty Tank</option>
            <option value="long_spray">Long Spray</option>
          </select>

          {/* Event */}
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="bg-surface-card border border-surface-border text-slate-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-green/40"
          >
            <option value="">All events</option>
            <option value="alert">Alert (new)</option>
            <option value="reminder">Reminder</option>
            <option value="resolved">Resolved</option>
          </select>

          {/* Export */}
          <button
            onClick={handleExport}
            disabled={!data?.logs.length}
            className="flex items-center gap-1.5 bg-surface-card border border-surface-border text-slate-300 text-xs rounded-lg px-3 py-1.5 hover:text-slate-100 hover:border-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-300 disabled:hover:border-surface-border ml-auto"
          >
            <Download size={13} /> Export CSV
          </button>
        </div>

        {/* Table */}
        <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="space-y-px">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-12 bg-surface-hover animate-pulse" />
              ))}
            </div>
          ) : !data?.logs.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-600">
              <Bell size={32} className="mb-3 opacity-30" />
              <p className="text-sm">No alerts in this period</p>
              <p className="text-xs mt-1">Alerts will appear here when conditions are triggered</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-border text-left">
                  <th className="px-4 py-2.5 text-slate-500 font-medium">Time</th>
                  <th className="px-4 py-2.5 text-slate-500 font-medium">Farm</th>
                  <th className="px-4 py-2.5 text-slate-500 font-medium">Type</th>
                  <th className="px-4 py-2.5 text-slate-500 font-medium">Event</th>
                  <th className="px-4 py-2.5 text-slate-500 font-medium text-right">Value</th>
                  <th className="px-4 py-2.5 text-slate-500 font-medium text-right">Threshold</th>
                  <th className="px-4 py-2.5 text-slate-500 font-medium text-right">Duration</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-surface-border/50 last:border-0 hover:bg-surface-hover transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono-num text-slate-400 whitespace-nowrap">
                      {format(parseISO(row.created_at), "MMM d, HH:mm:ss")}
                    </td>
                    <td className="px-4 py-2.5 text-slate-300 capitalize">{row.farm_id}</td>
                    <td className={clsx("px-4 py-2.5 font-medium", TYPE_STYLE[row.alert_type])}>
                      {TYPE_LABEL[row.alert_type] ?? row.alert_type}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        text={row.event.charAt(0).toUpperCase() + row.event.slice(1)}
                        cls={EVENT_STYLE[row.event] ?? "bg-slate-700 text-slate-300 border-slate-600"}
                      />
                    </td>
                    <td className="px-4 py-2.5 font-mono-num text-slate-300 text-right">
                      {row.sensor_value != null
                        ? `${row.sensor_value.toFixed(1)}${unitFor(row.alert_type)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono-num text-slate-500 text-right">
                      {row.threshold != null
                        ? `${row.threshold.toFixed(1)}${unitFor(row.alert_type)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono-num text-right">
                      {row.duration_min != null ? (
                        <span
                          className="text-amber-400"
                          title={row.gap_minutes
                            ? `Approximate — excludes ${row.gap_minutes.toFixed(0)} min of connectivity gaps`
                            : "Exact duration"}
                        >
                          {row.gap_minutes ? "~" : ""}{row.duration_min.toFixed(1)} min
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </main>
    </div>
  );
}
