"use client";
/**
 * HMI › Dashboard — what the system has been DOING, and whether to trust the record.
 *
 * The previous version of this page had no question of its own. It showed live
 * temperature and humidity, which the state strip already shows on every page
 * and the Process view shows again against their bands; and it showed their
 * recent history as sparklines, which Trends draws properly with axes. Three
 * copies of two numbers. Its only unique content was the water panel and a
 * quadrant of screen saying no soil probes are fitted.
 *
 * So the pages now divide by QUESTION rather than by widget:
 *
 *   Process Diagram   what is happening right now, and where
 *   Trends & History  let me look closely at a range I choose
 *   Dashboard         what happened over this period, and is the record sound
 *
 * Which makes this page a conclusion rather than an instrument. Two deliberate
 * choices follow from that:
 *
 * ONE CHART, NOT TWO. Temperature and humidity share a time axis with the
 * channel traces beneath, because the questions worth asking here are about
 * the relationship — did spraying bend the temperature, does humidity climb
 * while it runs. Two charts on separate axes make that a memory exercise.
 *
 * COVERAGE IS A HEADLINE, NOT A FOOTNOTE. Campus published nothing for
 * seventeen days in October 2026 while the hardware was healthy, because the
 * controller's MQTT topic had been renamed and nothing was subscribed to the
 * new one. Every average on this page would have been computed over whatever
 * scraps survived and shown with the same confidence as a full day. A summary
 * that cannot say how much of the period it actually saw is not a summary.
 */
import { useState } from "react";
import useSWR from "swr";
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { swrFetcher } from "@/lib/api";
import { HMI } from "@/components/hmi2/tokens";
import ActivityStrip, { type Trace } from "@/components/hmi2/ActivityStrip";
import type { Farm, HistoryResponse, TimePoint, WaterResponse } from "@/types";

type StoredZones = Record<string, { low: number; high: number; updated_at: string }>;

const RANGES = [
  { value: "-6h", label: "6 h", minutes: 360 },
  { value: "-24h", label: "24 h", minutes: 1440 },
  { value: "-7d", label: "7 days", minutes: 10080 },
];

/** Plot-area insets. The strip below the chart is padded to match these. */
const Y_AXIS_W = 44;
const RIGHT_W = 46;

export default function HmiDashboard() {
  const [range, setRange] = useState("-24h");
  const period = RANGES.find((r) => r.value === range)!;

  const { data: history, isLoading } = useSWR<HistoryResponse>(
    `/api/sensors/history?farm=campus&range=${range}`, swrFetcher, { refreshInterval: 60_000 },
  );
  const { data: zones } = useSWR<StoredZones>("/api/campus/setpoint", swrFetcher, { refreshInterval: 30_000 });
  const { data: water } = useSWR<WaterResponse>(
    "/api/sensors/water?farm=campus", swrFetcher, { refreshInterval: 300_000 },
  );
  const { data: farms } = useSWR<{ farms: Farm[] }>("/api/farms/", swrFetcher);
  const hasSoil = farms?.farms?.find((f) => f.id === "campus")?.has_soil_sensors ?? false;

  const series = (f: string): TimePoint[] => history?.series?.[f] ?? [];
  const temps = series("temperature");

  // The aggregation window, measured rather than parsed from the label, so it
  // stays right if the backend's bucketing ever changes.
  const windowMs = medianGap(temps) ?? 60_000;

  // Shared time domain for the chart and the traces below it. Anchored to the
  // requested period, not to the data, so a feed that died halfway through
  // leaves visible empty space instead of silently rescaling to look full.
  const to = Date.now();
  const from = to - period.minutes * 60_000;

  const merged = mergeByTime(series("temperature"), series("humidity"));
  // Setpoint 1 drives CH1, the system enable: the controller switches the
  // system ON above its high value. It is a THRESHOLD, not a target to sit
  // inside — which is how this page first came to report "temperature in
  // band", a figure that quietly rewarded the greenhouse for being hot.
  //
  // Setpoint 2 drives CH2 (spraying) and 3 drives CH3 (humidity). Naming them
  // "zones" cost a real conversation, so they are named for their channels.
  const enableBand = zones?.["1"] ?? null;

  // How much of the period actually arrived.
  const expected = Math.max(1, Math.round((period.minutes * 60_000) / windowMs));
  const coverage = Math.min(1, temps.length / expected);

  const traces: Trace[] = [
    { label: "System enable", points: series("CH1") },
    { label: "Spraying", points: series("CH2") },
    { label: "Humidity ctrl", points: series("CH3") },
    { label: "Cooling", points: series("CH4") },
  ];

  const sprayMin = dutyMinutes(series("CH2"), windowMs);
  const coolMin = dutyMinutes(series("CH4"), windowMs);
  // How much of the period the greenhouse was hot enough to call for cooling.
  const aboveEnable = fractionAbove(temps, enableBand?.high ?? null);

  const noData = !isLoading && temps.length === 0;

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Period and trust, together: the number of readings behind every
          figure below belongs next to the control that changes it. */}
      <header
        className="flex items-center gap-2 px-3 py-2 shrink-0 flex-wrap"
        style={{ borderBottom: "1px solid " + HMI.line }}
      >
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className="px-3 py-1 text-[11px] font-semibold tracking-wide"
            style={{
              backgroundColor: range === r.value ? HMI.panelAlt : "transparent",
              color: range === r.value ? HMI.ink : HMI.inkMuted,
              border: "1px solid " + (range === r.value ? HMI.line : "transparent"),
            }}
          >
            {r.label}
          </button>
        ))}
        <Coverage fraction={coverage} received={temps.length} expected={expected} loading={isLoading} />
      </header>

      <div className="flex-1 min-h-0 overflow-auto p-3 flex flex-col gap-3">
        <section className="flex flex-col" style={{ backgroundColor: HMI.panel }}>
          <div className="flex items-baseline justify-between px-3 py-2 gap-3 flex-wrap">
            <h2 className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: HMI.inkMuted }}>
              Climate and activity
            </h2>
            <div className="flex items-center gap-4 text-[10px]" style={{ color: HMI.inkFaint }}>
              <Key swatch={HMI.ink} label="Temperature °C" />
              <Key swatch={HMI.inkFaint} dashed label="Humidity %" />
              <Key swatch={HMI.panelAlt} block label={enableBand ? `CH1 enable ${enableBand.low}–${enableBand.high} °C` : "CH1 band not set"} />
            </div>
          </div>

          <div style={{ height: 260 }} className="px-1">
            {noData ? (
              <Empty>
                No readings stored for this period.
              </Empty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={merged} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke={HMI.line} strokeDasharray="2 4" vertical={false} />
                  {enableBand && (
                    <ReferenceArea
                      yAxisId="t" y1={enableBand.low} y2={enableBand.high}
                      fill={HMI.panelAlt} fillOpacity={1} stroke="none"
                    />
                  )}
                  <XAxis
                    dataKey="ts"
                    type="number"
                    scale="time"
                    domain={[from, to]}
                    tick={{ fill: HMI.inkFaint, fontSize: 10 }}
                    tickFormatter={(t: number) => fmtTick(t, period.minutes)}
                    stroke={HMI.line}
                    minTickGap={48}
                  />
                  <YAxis
                    yAxisId="t" domain={[15, 45]} width={Y_AXIS_W}
                    tick={{ fill: HMI.inkFaint, fontSize: 10 }} stroke={HMI.line}
                    label={{ value: "°C", position: "insideTopLeft", fill: HMI.inkFaint, fontSize: 10, dy: -2 }}
                  />
                  <YAxis
                    yAxisId="h" orientation="right" domain={[0, 100]} width={RIGHT_W}
                    tick={{ fill: HMI.inkFaint, fontSize: 10 }} stroke={HMI.line}
                    label={{ value: "%RH", position: "insideTopRight", fill: HMI.inkFaint, fontSize: 10, dy: -2 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: HMI.panelAlt, border: "1px solid " + HMI.line,
                      borderRadius: 0, fontSize: 12,
                    }}
                    labelStyle={{ color: HMI.inkMuted }}
                    itemStyle={{ color: HMI.ink }}
                    labelFormatter={(t: number) => new Date(t).toLocaleString()}
                    formatter={(v: number, n: string) =>
                      [v == null ? "—" : v.toFixed(1) + (n === "Temperature" ? " °C" : " %"), n]
                    }
                  />
                  {/* connectNulls off on purpose: a gap in the feed is
                      information, and a line drawn straight through one
                      invents readings nobody took. */}
                  <Line
                    yAxisId="t" name="Temperature" dataKey="temperature" type="linear"
                    stroke={HMI.ink} strokeWidth={1.6} dot={false}
                    isAnimationActive={false} connectNulls={false}
                  />
                  <Line
                    yAxisId="h" name="Humidity" dataKey="humidity" type="linear"
                    stroke={HMI.inkFaint} strokeWidth={1.2} strokeDasharray="3 3" dot={false}
                    isAnimationActive={false} connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* The traces sit directly under the chart, sharing its time axis.
              This adjacency is the point of the page. */}
          <div className="pb-3 pt-1">
            <div className="px-3 pb-1.5 text-[10px] tracking-widest uppercase" style={{ color: HMI.inkFaint }}>
              Channel activity
            </div>
            <ActivityStrip
              traces={traces}
              from={from}
              to={to}
              windowMs={windowMs}
              padLeft={Y_AXIS_W + 4}
              padRight={RIGHT_W + 12}
            />
          </div>
        </section>

        {/* Four figures, none of which appears anywhere else in the HMI. */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat
            label="Spraying ran"
            value={runtime(sprayMin)}
            note={
              sprayMin > 0
                ? `${pct(sprayMin / period.minutes)} of the period`
                : "did not run in this period"
            }
          />
          <Stat
            label="Cooling ran"
            value={runtime(coolMin)}
            note={
              coolMin > 0
                ? `${pct(coolMin / period.minutes)} of the period`
                : "did not run in this period"
            }
          />
          <WaterStat water={water} />
          {/* Not "temperature in band". CH1 switches the system on ABOVE its
              high setpoint, so what matters is how much of the period was hot
              enough to need it, not how much sat between two numbers. */}
          <Stat
            label="Called for cooling"
            value={aboveEnable == null ? "—" : pct(aboveEnable)}
            note={
              aboveEnable == null
                ? enableBand ? "no readings to judge" : "CH1 enable setpoint not set"
                : `of ${temps.length} readings above ${enableBand!.high} °C, CH1's enable point`
            }
          />
        </section>

        {/* One line, not a quadrant. An absence should take the space an
            absence deserves. */}
        <p className="text-[11px] px-3 py-2" style={{ color: HMI.inkFaint, backgroundColor: HMI.panel }}>
          {hasSoil
            ? "Soil probes are configured for this farm but no readings have arrived."
            : "No soil probes fitted. This line reads the farm registry, so soil appears here automatically once probes are wired and configured."}
        </p>
      </div>
    </div>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function Coverage({
  fraction, received, expected, loading,
}: { fraction: number; received: number; expected: number; loading: boolean }) {
  if (loading) {
    return <span className="ml-auto text-[11px] font-mono-num" style={{ color: HMI.inkFaint }}>loading…</span>;
  }
  // Thresholds, not a gradient: the question is whether to trust the figures
  // below, and that is a decision with steps in it.
  const bad = fraction < 0.5;
  const thin = fraction < 0.9;
  const color = bad ? HMI.alarm : thin ? HMI.warn : HMI.inkMuted;

  return (
    <div className="ml-auto flex items-center gap-2" title={`${received} readings received of about ${expected} expected`}>
      <span className="text-[10px] tracking-widest uppercase" style={{ color: HMI.inkFaint }}>
        Data coverage
      </span>
      <span className="relative block" style={{ width: 64, height: 8, backgroundColor: HMI.bg }}>
        <span
          className="absolute inset-y-0 left-0"
          style={{ width: `${Math.max(1.5, fraction * 100)}%`, backgroundColor: color }}
        />
      </span>
      <span className="text-[12px] font-mono-num tabular-nums font-semibold" style={{ color }}>
        {pct(fraction)}
      </span>
      {bad && (
        <span className="text-[11px]" style={{ color: HMI.alarm }}>
          — figures below cover only part of this period
        </span>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="px-3 py-3" style={{ backgroundColor: HMI.panel }}>
      <div className="text-[10px] font-bold tracking-[0.2em] uppercase mb-1.5" style={{ color: HMI.inkMuted }}>
        {label}
      </div>
      <div className="text-2xl font-mono-num tabular-nums font-semibold leading-none" style={{ color: HMI.ink }}>
        {value}
      </div>
      <div className="text-[11px] mt-1.5 leading-snug" style={{ color: HMI.inkFaint }}>{note}</div>
    </div>
  );
}

function WaterStat({ water }: { water?: WaterResponse }) {
  if (!water?.has_meter) {
    return <Stat label="Water Consumption" value="—" note={water?.reason ?? "No meter fitted."} />;
  }
  const r = water.readings[0];
  if (!r) {
    return (
      <Stat
        label="Water Consumption"
        value="—"
        note="Meter fitted but has never reported. It sends only once another cubic metre has passed, so quiet is normal on a system that runs briefly."
      />
    );
  }
  const unit = water.unit_label ?? "";
  const when = new Date(r.timestamp);
  const days = Math.floor((Date.now() - when.getTime()) / 86_400_000);
  return (
    <Stat
      label="Water Consumption"
      value={r.consumption != null ? `${r.consumption} ${unit}` : "—"}
      note={`meter reads ${r.last_totalizer ?? "—"} ${unit} · last reported ${
        days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`
      }`}
    />
  );
}

function Key({ swatch, label, dashed, block }: { swatch: string; label: string; dashed?: boolean; block?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        style={{
          width: 14,
          height: block ? 10 : 0,
          backgroundColor: block ? swatch : undefined,
          borderTop: block ? undefined : `2px ${dashed ? "dashed" : "solid"} ${swatch}`,
        }}
      />
      {label}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full grid place-items-center">
      <p className="text-[13px]" style={{ color: HMI.inkFaint }}>{children}</p>
    </div>
  );
}

/* ── Maths ───────────────────────────────────────────────────────────────── */

/** Merge two series onto one time axis without letting a gap in one shift the other. */
function mergeByTime(temperature: TimePoint[], humidity: TimePoint[]) {
  const rows = new Map<number, { ts: number; temperature?: number; humidity?: number }>();
  for (const p of temperature) {
    const ts = new Date(p.time).getTime();
    rows.set(ts, { ...(rows.get(ts) ?? { ts }), temperature: p.value ?? undefined });
  }
  for (const p of humidity) {
    const ts = new Date(p.time).getTime();
    rows.set(ts, { ...(rows.get(ts) ?? { ts }), humidity: p.value ?? undefined });
  }
  return [...rows.values()].sort((a, b) => a.ts - b.ts);
}

/** The typical spacing between readings. Median, so one long gap does not set it. */
function medianGap(points: TimePoint[]): number | null {
  if (points.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 1; i < points.length; i++) {
    gaps.push(new Date(points[i].time).getTime() - new Date(points[i - 1].time).getTime());
  }
  gaps.sort((a, b) => a - b);
  const m = gaps[Math.floor(gaps.length / 2)];
  return m > 0 ? m : null;
}

/**
 * Minutes a channel was actually energised.
 *
 * The API averages each window, so a half-open window arrives as 0.5 and
 * contributes half a window of runtime. Summing the fractions is therefore the
 * correct figure, and counting any-nonzero windows as full ones would inflate
 * it — on a page reporting pump runtime, in the direction that hides wear.
 */
function dutyMinutes(points: TimePoint[], windowMs: number): number {
  const windows = points.reduce((s, p) => s + Math.min(1, Math.max(0, p.value ?? 0)), 0);
  return (windows * windowMs) / 60_000;
}

/** Share of readings at or above a threshold. Null when there is nothing to judge. */
function fractionAbove(points: TimePoint[], threshold: number | null): number | null {
  if (threshold == null) return null;
  const v = points.map((p) => p.value).filter((x): x is number => x != null);
  if (!v.length) return null;
  return v.filter((x) => x >= threshold).length / v.length;
}

function runtime(min: number): string {
  if (min <= 0) return "0 min";
  if (min < 1) return `${Math.round(min * 60)} sec`;
  if (min < 90) return `${min < 10 ? min.toFixed(1) : Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

const pct = (f: number) => `${f >= 0.1 || f === 0 ? Math.round(f * 100) : (f * 100).toFixed(1)}%`;

function fmtTick(t: number, periodMinutes: number): string {
  const d = new Date(t);
  return periodMinutes > 1440
    ? d.toLocaleDateString([], { day: "numeric", month: "short" })
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
