"use client";
/**
 * ForecastCard — Stage 1 preview: persistence forecast + validated 80% interval.
 *
 * DEVELOPER-ONLY. The parent renders this only when the logged-in role is
 * "developer" (the owner must not see it yet — ML_METHODOLOGY.md §2.6), and the
 * backend enforces the same gate: /api/ml/forecast returns 403 to anyone else.
 * So this component assumes it is allowed to fetch, and simply renders whatever
 * the endpoint returns — including its own "unavailable" reasons per horizon.
 *
 * What it shows is deliberately NOT a single confident number. Validation found
 * no model beats persistence, so the point forecast IS the current reading; the
 * honest, useful part is the interval, which is why the range — not the centre —
 * is the visual emphasis.
 */
import useSWR from "swr";
import { clsx } from "clsx";
import { TrendingUp, FlaskConical } from "lucide-react";
import { swrFetcher } from "@/lib/api";

interface HorizonEntry {
  minutes:  number;
  available: boolean;
  reason?:  string;
  center?:  number;
  low?:     number;
  high?:    number;
  coverage_observed?: number | null;
}
interface ForecastResponse {
  status:       string;
  message?:     string;
  is_online?:   boolean;
  current?:     number | null;
  unit?:        string;
  interval_pct?: number;
  model?:       string;
  horizons?:    HorizonEntry[];
  trained_at?:  string | null;
}

export default function ForecastCard({ farm }: { farm: string }) {
  const { data, error, isLoading } = useSWR<ForecastResponse>(
    `/api/ml/forecast?farm=${farm}&target=temperature`,
    swrFetcher,
    { refreshInterval: 30_000 },
  );

  return (
    <section className="bg-surface-card border border-surface-border rounded-xl p-4">
      {/* Header: title + the DEV / preview tag that says "do not trust yet" */}
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <TrendingUp size={13} /> Temperature Outlook
        </h2>
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-sky-400/15 text-sky-400">
          <FlaskConical size={10} /> Dev Preview
        </span>
      </div>
      <p className="text-[11px] text-slate-500 mb-4">
        Persistence forecast with an {data?.interval_pct ?? 80}% interval measured on unseen days.
        The range is the signal, not the mid-point.
      </p>

      {isLoading && (
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-surface-hover animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-[color:var(--warn-ink)]">
          Could not load the forecast preview.
        </p>
      )}

      {data && data.status === "no_model" && (
        <p className="text-sm text-slate-500">
          No trained model yet — run <code className="text-slate-400">train_forecast.py</code> on the lab desktop.
        </p>
      )}

      {data && data.status === "ok" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {data.horizons?.map((h) => (
              <HorizonTile key={h.minutes} h={h} unit={data.unit ?? "°C"} />
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            {data.current != null ? (
              <>Now <strong className="text-slate-300">{data.current.toFixed(1)}{data.unit}</strong>. </>
            ) : (
              <>No live reading. </>
            )}
            Point forecast is persistence — validation found no model beats it
            (ML §2.6). Intervals never extend past the 16:00 shutdown.
          </p>
        </>
      )}
    </section>
  );
}

function HorizonTile({ h, unit }: { h: HorizonEntry; unit: string }) {
  if (!h.available) {
    return (
      <div className="rounded-lg px-3 py-3 ring-1 ring-surface-border bg-surface-base flex flex-col justify-center min-h-[6rem]">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          in {h.minutes} min
        </p>
        <p className="text-xs text-slate-500 mt-2 leading-snug">{h.reason}</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg px-3 py-3 ring-1 ring-surface-border bg-surface-hover min-h-[6rem]">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          in {h.minutes} min
        </p>
        {h.coverage_observed != null && (
          <span className="text-[10px] text-slate-500 font-mono-num">
            {Math.round(h.coverage_observed * 100)}% hit
          </span>
        )}
      </div>
      {/* The range is the emphasis. The centre (persistence) is shown small. */}
      <p className="text-xl font-bold font-mono-num tabular-nums text-slate-100 mt-2 leading-none">
        {h.low?.toFixed(1)}<span className="text-slate-500 font-normal"> – </span>{h.high?.toFixed(1)}
        <span className="text-xs text-slate-500 font-normal"> {unit}</span>
      </p>
      <p className="text-[11px] text-slate-500 mt-1.5">
        likely, centred on {h.center?.toFixed(1)}{unit}
      </p>
    </div>
  );
}
