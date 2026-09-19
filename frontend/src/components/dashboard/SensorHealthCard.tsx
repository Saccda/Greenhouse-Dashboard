"use client";
/**
 * SensorHealthCard — Stage 2 preview: sensor health and anomaly detection (§3).
 *
 * DEVELOPER-ONLY, same gate as ForecastCard: the parent renders it only for the
 * developer role and the backend returns 403 to anyone else.
 *
 * This answers a different question from the threshold alerts already in
 * production. Those say "it is too hot". This says "this reading cannot be
 * trusted" — a saturated humidity sensor pinned at 100%, a frozen value, a dead
 * feed during working hours.
 *
 * It shows INCIDENTS, not raw events, deliberately. A thrashing sensor emits
 * dozens of flags in minutes; presenting those as dozens of alerts is how an
 * alert channel gets muted (§3.3). The raw count still rides along on each row
 * as "x15" so grouping can never hide volume.
 */
import useSWR from "swr";
import { clsx } from "clsx";
import {
  ShieldCheck, ShieldAlert, FlaskConical, Activity,
  WifiOff, Snowflake, AlertTriangle, TrendingUp,
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
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
interface HealthResponse {
  status:     string;
  days?:      number;
  readings?:  number;
  incidents?: Incident[];
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

export default function SensorHealthCard({ farm }: { farm: string }) {
  const { data, error, isLoading } = useSWR<HealthResponse>(
    `/api/ml/anomalies?farm=${farm}&days=7`,
    swrFetcher,
    { refreshInterval: 120_000 },
  );

  const faults = data?.incidents?.filter((i) => i.family === "fault") ?? [];
  const healthy = data?.status === "ok" && faults.length === 0;

  return (
    <section className="bg-surface-card border border-surface-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          {healthy
            ? <ShieldCheck size={13} className="text-brand-green" />
            : <ShieldAlert size={13} className="text-[color:var(--warn-ink)]" />}
          Sensor Health
        </h2>
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-sky-400/15 text-sky-400">
          <FlaskConical size={10} /> Dev Preview
        </span>
      </div>
      <p className="text-[11px] text-slate-500 mb-4">
        Can these readings be trusted? Separate from the temperature and humidity
        alerts — this watches the instrument, not the weather.
      </p>

      {isLoading && <div className="h-28 rounded-lg bg-surface-hover animate-pulse" />}

      {error && (
        <p className="text-sm text-[color:var(--warn-ink)]">
          Could not load sensor health.
        </p>
      )}

      {data?.status === "no_data" && (
        <p className="text-sm text-slate-500">No readings in the last {data.days} days.</p>
      )}

      {data?.status === "ok" && (
        <>
          {/* Alert rate — the number that decides whether this gets muted (§3.3) */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Incidents / day"
                  value={data.summary?.incidents_per_day?.toFixed(2) ?? "—"} />
            <Stat label="Faults / day"
                  value={data.summary?.fault_incidents_per_day?.toFixed(2) ?? "—"}
                  tone={(data.summary?.fault_incidents_per_day ?? 0) > 1 ? "warn" : "good"} />
            <Stat label={`Readings / ${data.days}d`}
                  value={data.readings?.toLocaleString() ?? "—"} />
          </div>

          {data.incidents && data.incidents.length > 0 ? (
            <ul className="divide-y divide-surface-border/70">
              {data.incidents.slice(0, 6).map((i, n) => (
                <IncidentRow key={`${i.detector}-${i.start}-${n}`} i={i} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 py-3">
              No anomalies detected in the last {data.days} days.
            </p>
          )}

          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            Thresholds are set from a robust scale (MAD) and an explicit alert
            budget, not a Gaussian assumption — the readings are heavy-tailed
            (ML §3.2). Bursts are grouped into one incident; “×N” is the raw count.
          </p>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, tone = "neutral" }:
  { label: string; value: string; tone?: "neutral" | "good" | "warn" }) {
  return (
    <div className="rounded-lg px-3 py-2.5 ring-1 ring-surface-border bg-surface-hover">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={clsx(
        "text-lg font-bold font-mono-num tabular-nums mt-1 leading-none",
        tone === "good" ? "text-brand-green"
        : tone === "warn" ? "text-[color:var(--warn-ink)]"
        : "text-slate-100",
      )}>
        {value}
      </p>
    </div>
  );
}

function IncidentRow({ i }: { i: Incident }) {
  const meta = DETECTOR_META[i.detector] ?? { label: i.detector, icon: Activity };
  const Icon = meta.icon;
  const isFault = i.family === "fault";
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Icon
        size={15}
        className={clsx("shrink-0 mt-0.5",
          isFault ? "text-[color:var(--warn-ink)]" : "text-slate-500")}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={clsx("text-xs font-semibold",
            isFault ? "text-[color:var(--warn-ink)]" : "text-slate-300")}>
            {meta.label}
          </span>
          <span className="text-[11px] text-slate-500">{i.field}</span>
          {i.count > 1 && (
            <span className="text-[10px] font-bold font-mono-num px-1.5 py-0.5 rounded bg-surface-hover text-slate-400">
              ×{i.count}
            </span>
          )}
          {isFault && (
            <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-[color:var(--warn-ink)]">
              Fault
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{i.detail}</p>
      </div>
      <span className="text-[10px] text-slate-500 shrink-0 whitespace-nowrap font-mono-num">
        {formatDistanceToNow(parseISO(i.start), { addSuffix: true })}
      </span>
    </li>
  );
}
