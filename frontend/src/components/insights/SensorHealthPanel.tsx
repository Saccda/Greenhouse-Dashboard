"use client";
/**
 * SensorHealthPanel — Stage 2: sensor health and anomaly detection (§3).
 *
 * DEVELOPER-ONLY, same gate as the forecast card.
 *
 * Sits on the Insights page beside the forecast, because the two answer
 * consecutive questions: can this reading be trusted at all, and if so where is
 * it heading. A forecast built on an instrument nobody has checked is worth
 * nothing, so health comes first in reading order.
 *
 * Design: a status strip, in the manner of a service status page. The first
 * thing anyone needs is "is it fine?", answered in one glance by one row of day
 * cells. Only then does the detail matter, so the incident list is short,
 * faults first, and everything else is one muted line. The previous version led
 * with three statistic tiles, which put the least urgent information — a rate —
 * in the most prominent position.
 */
import { useState } from "react";
import useSWR from "swr";
import { clsx } from "clsx";
import {
  ShieldCheck, ShieldAlert, FlaskConical, Activity,
  WifiOff, Snowflake, AlertTriangle, TrendingUp, ChevronDown,
} from "lucide-react";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { swrFetcher } from "@/lib/api";

interface Incident {
  detector: string;
  family:   "fault" | "unusual";
  field:    string;
  start:    string;
  end:      string;
  count:    number;
  span_min: number;
  detail:   string;
}
interface DayRow { date: string; readings: number; faults: number; unusual: number; }
interface HealthResponse {
  status:     string;
  days?:      number;
  readings?:  number;
  incidents?: Incident[];
  daily?:     DayRow[];
  summary?: {
    total: number; incidents: number;
    incidents_per_day: number | null;
    fault_incidents_per_day: number | null;
  } | null;
}

const DETECTOR_META: Record<string, { label: string; icon: typeof WifiOff }> = {
  dead_feed:    { label: "Dead feed",    icon: WifiOff },
  flatline:     { label: "Frozen value", icon: Snowflake },
  out_of_range: { label: "Out of range", icon: AlertTriangle },
  jump:         { label: "Spike",        icon: Activity },
  residual:     { label: "Unusual move", icon: TrendingUp },
};

export default function SensorHealthPanel({ farm }: { farm: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data, error, isLoading } = useSWR<HealthResponse>(
    `/api/ml/anomalies?farm=${farm}&days=7`,
    swrFetcher,
    { refreshInterval: 120_000 },
  );

  const incidents = data?.incidents ?? [];
  // Faults first: a broken instrument outranks an unusual-but-real reading.
  const ordered = [...incidents].sort((a, b) =>
    a.family === b.family ? 0 : a.family === "fault" ? -1 : 1);
  const faultCount = incidents.filter((i) => i.family === "fault").length;
  const shown = expanded ? ordered : ordered.slice(0, 3);
  const healthy = data?.status === "ok" && faultCount === 0;

  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-5">
      {/* ── One-glance verdict ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck size={13} /> Sensor Health
        </h2>
        <div className="flex items-center gap-2">
          {data?.status === "ok" && (
            <span className={clsx(
              "flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full",
              healthy
                ? "bg-brand-green/15 text-[color:var(--ok-ink)]"
                : "bg-amber-500/15 text-[color:var(--warn-ink)]",
            )}>
              {healthy ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
              {healthy
                ? "No faults in 7 days"
                : `${faultCount} fault${faultCount > 1 ? "s" : ""} in 7 days`}
            </span>
          )}
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-sky-400/15 text-sky-400">
            <FlaskConical size={10} /> Dev
          </span>
        </div>
      </div>

      {isLoading && <div className="h-24 mt-4 rounded-lg bg-surface-hover animate-pulse" />}
      {error && (
        <p className="text-sm text-[color:var(--warn-ink)] mt-3">Could not load sensor health.</p>
      )}
      {data?.status === "no_data" && (
        <p className="text-sm text-slate-500 mt-3">No readings in the last {data.days} days.</p>
      )}

      {data?.status === "ok" && (
        <>
          {/* ── Day strip: the whole week in one row ──────────────── */}
          {data.daily && data.daily.length > 0 && (
            <div className="mt-4">
              <div className="flex items-end gap-1.5">
                {data.daily.map((d) => <DayCell key={d.date} d={d} />)}
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-slate-500">
                  {format(parseISO(data.daily[0].date), "d MMM")}
                </span>
                <div className="flex items-center gap-3 text-[10px] text-slate-500">
                  <Key className="bg-brand-green/70" label="clean" />
                  <Key className="bg-sky-400/60" label="unusual" />
                  <Key className="bg-amber-500/80" label="fault" />
                  <Key className="bg-surface-border" label="no data" />
                </div>
                <span className="text-[10px] text-slate-500">today</span>
              </div>
            </div>
          )}

          {/* ── Detail, only as much as is needed ────────────────── */}
          {ordered.length > 0 ? (
            <>
              <ul className="mt-3">
                {shown.map((i, n) => (
                  <IncidentRow key={`${i.detector}-${i.start}-${n}`} i={i} />
                ))}
              </ul>
              {ordered.length > 3 && (
                <button
                  type="button"
                  onClick={() => setExpanded((e) => !e)}
                  className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-200 transition-colors mt-1"
                >
                  <ChevronDown size={12} className={clsx("transition-transform", expanded && "rotate-180")} />
                  {expanded ? "Show fewer" : `${ordered.length - 3} more`}
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500 mt-3">
              Nothing flagged in the last {data.days} days.
            </p>
          )}

          <p className="text-[11px] text-slate-500 mt-3 pt-3 border-t border-surface-border/70">
            {data.summary?.incidents_per_day?.toFixed(2)} incidents/day ·{" "}
            {data.summary?.fault_incidents_per_day?.toFixed(2)} faults/day ·{" "}
            {data.readings?.toLocaleString()} readings. Watches the instrument, not the weather.
          </p>
        </>
      )}
    </section>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={clsx("w-2 h-2 rounded-sm", className)} />
      {label}
    </span>
  );
}

function DayCell({ d }: { d: DayRow }) {
  const tone =
    d.readings === 0 ? "bg-surface-border"
    : d.faults > 0   ? "bg-amber-500/80"
    : d.unusual > 0  ? "bg-sky-400/60"
    : "bg-brand-green/70";
  const summary =
    d.readings === 0 ? "no data"
    : d.faults > 0   ? `${d.faults} fault${d.faults > 1 ? "s" : ""}`
    : d.unusual > 0  ? `${d.unusual} unusual`
    : "clean";
  return (
    <div
      className="flex-1 group relative"
      title={`${format(parseISO(d.date), "EEE d MMM")} — ${summary} (${d.readings.toLocaleString()} readings)`}
    >
      <div className={clsx("h-8 rounded transition-opacity group-hover:opacity-70", tone)} />
    </div>
  );
}

function IncidentRow({ i }: { i: Incident }) {
  const meta = DETECTOR_META[i.detector] ?? { label: i.detector, icon: Activity };
  const Icon = meta.icon;
  const isFault = i.family === "fault";
  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <Icon size={13} className={clsx("shrink-0",
        isFault ? "text-[color:var(--warn-ink)]" : "text-slate-500")} />
      <span className={clsx("text-xs font-medium shrink-0",
        isFault ? "text-[color:var(--warn-ink)]" : "text-slate-300")}>
        {meta.label}
      </span>
      <span className="text-[11px] text-slate-500 shrink-0">{i.field}</span>
      {i.count > 1 && (
        <span className="text-[10px] font-mono-num text-slate-500 shrink-0">×{i.count}</span>
      )}
      <span className="text-[11px] text-slate-500 truncate flex-1 min-w-0">{i.detail}</span>
      <span className="text-[10px] text-slate-500 shrink-0 font-mono-num whitespace-nowrap">
        {formatDistanceToNow(parseISO(i.start), { addSuffix: true }).replace("about ", "")}
      </span>
    </li>
  );
}
