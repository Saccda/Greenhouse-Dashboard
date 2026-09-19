"use client";
/**
 * ForecastPanel — Stage 1: persistence forecast + validated 80% interval (§2.6).
 *
 * Validation found no model beats persistence, so the centre line is "wherever
 * it is now". That makes the INTERVAL the whole product, and the design follows
 * from it: the cone and its widening are the hero, the point value is support.
 *
 * The horizon selector is not decoration. Switching 15 -> 30 -> 60 min redraws
 * the focus marker and the readout, so the cost of looking further ahead is
 * something you feel rather than read. The threshold verdict turns that into a
 * decision — the question is never "what will the temperature be", it is "does
 * the plausible range reach the line where I have to act".
 */
import { useState } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  ReferenceLine, ReferenceDot, ResponsiveContainer, Tooltip,
} from "recharts";
import useSWR from "swr";
import { clsx } from "clsx";
import { format, parseISO } from "date-fns";
import {
  TrendingUp, TrendingDown, Minus, FlaskConical, ShieldCheck, AlertTriangle, Clock,
} from "lucide-react";
import { swrFetcher } from "@/lib/api";

interface HorizonEntry {
  minutes:   number;
  available: boolean;
  reason?:   string;
  center?:   number;
  low?:      number;
  high?:     number;
  coverage_observed?: number | null;
}
export interface ForecastResponse {
  status:        string;
  is_online?:    boolean;
  current?:      number | null;
  unit?:         string;
  interval_pct?: number;
  as_of?:        string;
  horizons?:     HorizonEntry[];
  recent?:       { t: string; v: number }[];
  recent_is_stale?: boolean;
}

type Point = { t: number; actual?: number; center?: number; band?: [number, number] };

function buildSeries(d: ForecastResponse, upTo: number): Point[] {
  const pts: Point[] = (d.recent ?? []).map((p) => ({
    t: parseISO(p.t).getTime(), actual: p.v,
  }));
  const usable = (d.horizons ?? [])
    .filter((h) => h.available && h.center != null && h.minutes <= upTo)
    .sort((a, b) => a.minutes - b.minutes);
  if (!usable.length || d.current == null) return pts;

  // Anchor at "now" with zero width so the cone opens out of the live reading
  // instead of appearing from nowhere at the first horizon.
  const now = d.as_of ? parseISO(d.as_of).getTime() : Date.now();
  pts.push({ t: now, actual: d.current, center: d.current, band: [d.current, d.current] });
  for (const h of usable) {
    pts.push({
      t: now + h.minutes * 60_000,
      center: h.center,
      band: [h.low as number, h.high as number],
    });
  }
  return pts;
}

export default function ForecastPanel({ farm, tempWarn }: { farm: string; tempWarn?: number }) {
  const [focus, setFocus] = useState(60);
  const { data, error, isLoading } = useSWR<ForecastResponse>(
    `/api/ml/forecast?farm=${farm}&target=temperature`,
    swrFetcher,
    { refreshInterval: 30_000 },
  );

  const unit    = data?.unit ?? "°C";
  const pct     = data?.interval_pct ?? 80;
  const horizons = data?.horizons ?? [];
  const focused = horizons.find((h) => h.minutes === focus);
  const series  = data ? buildSeries(data, focus) : [];
  const nowMs   = data?.as_of ? parseISO(data.as_of).getTime() : null;
  const hasFan  = series.some((p) => p.band);

  // Trend over the last half hour of measurements, for the delta chip.
  const recent = data?.recent ?? [];
  const delta = recent.length > 8
    ? recent[recent.length - 1].v - recent[Math.max(0, recent.length - 16)].v
    : null;

  // Does the plausible range reach the line where someone has to act?
  const reaches = tempWarn != null && focused?.available && focused.high != null
    ? focused.high >= tempWarn : null;

  // The header copy has to match what is actually on screen. With no live
  // reading there is nothing to project from, so no band is drawn — and
  // describing one anyway sends the reader hunting for something that is not
  // there. Service refuses the forecast (§1.2); the wording follows it.
  const anyAvailable = horizons.some((h) => h.available);
  const blurb = data?.status !== "ok" || anyAvailable
    ? `${pct}% of outcomes land inside the shaded band, measured on days the method never saw. The band is the forecast — the line is only its middle.`
    : "No live reading, so there is no band to draw — a forecast projected from stale data could never be checked. The chart shows the last session; the band returns when the rig does.";

  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <TrendingUp size={15} className="text-sky-400" /> Temperature Outlook
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-md leading-relaxed">{blurb}</p>
        </div>
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-sky-400/15 text-sky-400 shrink-0">
          <FlaskConical size={10} /> Dev Preview
        </span>
      </div>

      {isLoading && <div className="mx-5 mb-5 h-72 rounded-xl bg-surface-hover animate-pulse" />}
      {error && <p className="px-5 pb-5 text-sm text-[color:var(--warn-ink)]">Could not load the forecast.</p>}
      {data?.status === "no_model" && (
        <p className="px-5 pb-5 text-sm text-slate-500">
          No trained model yet — run <code className="text-slate-400">train_forecast.py</code> on the lab desktop.
        </p>
      )}

      {data?.status === "ok" && (
        <>
          {/* ── Hero: the reading now, and the horizon selector ──── */}
          <div className="flex items-end justify-between gap-4 px-5 pb-4 flex-wrap">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                {data.current != null ? "Reading now" : "Last reading"}
              </p>
              <div className="flex items-baseline gap-2.5 mt-1">
                <span className="text-4xl font-extrabold font-mono-num tabular-nums tracking-tight text-slate-100 leading-none">
                  {data.current != null
                    ? data.current.toFixed(1)
                    : recent.length ? recent[recent.length - 1].v.toFixed(1) : "—"}
                </span>
                <span className="text-lg font-bold text-slate-500 leading-none">{unit}</span>
                {delta != null && <DeltaChip delta={delta} unit={unit} />}
              </div>
            </div>

            <div className="flex gap-1 p-1 rounded-xl bg-surface-hover ring-1 ring-surface-border">
              {[15, 30, 60].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setFocus(m)}
                  aria-pressed={focus === m}
                  className={clsx(
                    "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                    focus === m
                      ? "bg-sky-500 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200",
                  )}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>

          {/* ── The cone ─────────────────────────────────────────── */}
          {series.length > 1 ? (
            <div className="h-64 px-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <defs>
                    <linearGradient id="coneFill" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%"   stopColor="var(--chart-temp)" stopOpacity={0.34} />
                      <stop offset="100%" stopColor="var(--chart-temp)" stopOpacity={0.16} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis
                    dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]}
                    tickFormatter={(t) => format(new Date(t), "HH:mm")}
                    tick={{ fontSize: 10, fill: "currentColor" }} className="text-slate-500"
                    stroke="var(--chart-grid)" tickLine={false} minTickGap={30}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "currentColor" }} className="text-slate-500"
                    stroke="var(--chart-grid)" tickLine={false} width={36}
                    domain={["auto", "auto"]} tickFormatter={(v) => `${v}°`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface-card, #002068)",
                      border: "1px solid var(--chart-grid)", borderRadius: 10, fontSize: 11,
                    }}
                    labelFormatter={(t) => format(new Date(Number(t)), "HH:mm")}
                    formatter={(v: unknown, name: string) => {
                      if (name === "band" && Array.isArray(v)) return [`${v[0]}–${v[1]}${unit}`, `${pct}% range`];
                      return [`${v}${unit}`, name === "actual" ? "Measured" : "Forecast"];
                    }}
                  />
                  {tempWarn != null && (
                    <ReferenceLine
                      y={tempWarn} stroke="var(--chart-warning)" strokeDasharray="5 4"
                      label={{ value: `warn ${tempWarn}°`, position: "insideTopRight",
                               fontSize: 9, fill: "var(--chart-warning)" }}
                    />
                  )}
                  {hasFan && nowMs && (
                    <ReferenceLine x={nowMs} stroke="var(--chart-grid)" strokeWidth={1.5} />
                  )}
                  <Area dataKey="band" stroke="none" fill="url(#coneFill)"
                        isAnimationActive={false} connectNulls />
                  <Line dataKey="center" stroke="var(--chart-temp)" strokeWidth={1.5}
                        strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />
                  <Line dataKey="actual" stroke="var(--chart-temp)" strokeWidth={2.25}
                        dot={false} isAnimationActive={false} />
                  {focused?.available && nowMs && focused.center != null && (
                    <ReferenceDot
                      x={nowMs + focused.minutes * 60_000} y={focused.center} r={4}
                      fill="var(--chart-temp)" stroke="var(--surface-card, #002068)" strokeWidth={2}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mx-5 h-64 flex items-center justify-center rounded-xl bg-surface-base">
              <p className="text-xs text-slate-500">No readings to plot.</p>
            </div>
          )}

          {/* ── The readout for the selected horizon ─────────────── */}
          <div className="mt-4 mx-5 mb-5 rounded-xl bg-surface-hover ring-1 ring-surface-border p-4">
            {focused?.available ? (
              <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    In {focused.minutes} minutes
                  </p>
                  <p className="text-2xl font-bold font-mono-num tabular-nums text-slate-100 mt-1 leading-none">
                    {focused.low?.toFixed(1)}
                    <span className="text-slate-500 font-normal mx-1">–</span>
                    {focused.high?.toFixed(1)}
                    <span className="text-sm text-slate-500 font-normal ml-1">{unit}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {focused.coverage_observed != null && (
                    <span className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-surface-card text-slate-400">
                      <ShieldCheck size={12} className="text-[color:var(--ok-ink)]" />
                      {Math.round(focused.coverage_observed * 100)}% observed coverage
                    </span>
                  )}
                  {reaches != null && (
                    <span className={clsx(
                      "flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg",
                      reaches
                        ? "bg-amber-500/15 text-[color:var(--warn-ink)]"
                        : "bg-brand-green/15 text-[color:var(--ok-ink)]",
                    )}>
                      {reaches ? <AlertTriangle size={12} /> : <ShieldCheck size={12} />}
                      {reaches
                        ? `Range reaches ${tempWarn}${unit}`
                        : `Stays below ${tempWarn}${unit}`}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <Clock size={15} className="text-slate-500 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-slate-300">
                    No forecast for +{focus} min
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {focused?.reason ?? "Unavailable"}
                    {data.recent_is_stale && recent.length
                      ? ` · chart shows the last session, ended ${format(parseISO(recent[recent.length - 1].t), "HH:mm")}`
                      : ""}
                  </p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function DeltaChip({ delta, unit }: { delta: number; unit: string }) {
  const flat = Math.abs(delta) < 0.15;
  const Icon = flat ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={clsx(
      "flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg",
      flat ? "bg-surface-hover text-slate-400"
      : delta > 0 ? "bg-amber-500/15 text-[color:var(--warn-ink)]"
      : "bg-sky-400/15 text-sky-400",
    )}>
      <Icon size={11} />
      {flat ? "steady" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}${unit} / 30 min`}
    </span>
  );
}
