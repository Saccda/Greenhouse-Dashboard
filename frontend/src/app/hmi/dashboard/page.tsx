"use client";
/**
 * HMI › Dashboard — every measured quantity, one panel each.
 *
 * The measurements had grown lopsided: water had a page of its own while
 * temperature and humidity appeared only as two bars beside the diagram, and
 * soil had nowhere to go at all. This is the Level 2 summary the standard
 * describes — one panel per family of measurement, each showing current value,
 * where it should be, and where it has just been.
 *
 * The daily water table moved to FM-01's equipment page, which is Level 3.
 * A row per day is detail; the dashboard wants the shape, not the ledger.
 *
 * The soil panel is real, not decoration. It reads has_soil_sensors from the
 * farm registry, so the day probes are wired and config is filled in, this
 * panel starts showing readings without anyone editing this file.
 */
import useSWR from "swr";

import { swrFetcher } from "@/lib/api";
import { HMI } from "@/components/hmi2/tokens";
import DeviationBar from "@/components/hmi2/DeviationBar";
import Sparkline from "@/components/hmi2/Sparkline";
import type { Farm, HistoryResponse, LatestResponse, WaterResponse } from "@/types";

type StoredZones = Record<string, { low: number; high: number; updated_at: string }>;

export default function HmiDashboard() {
  const { data: latest, error } = useSWR<LatestResponse>(
    "/api/sensors/latest?farm=campus", swrFetcher, { refreshInterval: 10_000 },
  );
  const { data: zones } = useSWR<StoredZones>("/api/campus/setpoint", swrFetcher, { refreshInterval: 30_000 });
  const { data: history } = useSWR<HistoryResponse>(
    "/api/sensors/history?farm=campus&range=-24h", swrFetcher, { refreshInterval: 120_000 },
  );
  const { data: water } = useSWR<WaterResponse>(
    "/api/sensors/water?farm=campus", swrFetcher, { refreshInterval: 300_000 },
  );
  const { data: farms } = useSWR<{ farms: Farm[] }>("/api/farms/", swrFetcher);

  const stale = !!error || (latest ? !latest.is_online : true);
  const temp = latest?.readings?.temperature?.value;
  const hum = latest?.readings?.humidity?.value;
  const hasSoil = farms?.farms?.find((f) => f.id === "campus")?.has_soil_sensors ?? false;

  const series = (field: string) => (history?.series?.[field] ?? []).map((p) => p.value ?? null);
  const span = (field: string) => {
    const v = series(field).filter((x): x is number => x != null);
    return v.length ? { min: Math.min(...v), max: Math.max(...v), n: v.length } : null;
  };

  const tTarget = zones?.["1"] ? (zones["1"].low + zones["1"].high) / 2 : null;
  const hTarget = zones?.["3"] ? (zones["3"].low + zones["3"].high) / 2 : null;
  const tBand = zones?.["1"] ? (zones["1"].high - zones["1"].low) / 2 : 1;
  const hBand = zones?.["3"] ? (zones["3"].high - zones["3"].low) / 2 : 10;

  return (
    <div className="h-full min-h-0 overflow-auto p-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel title="Temperature" tag="TH-01">
          <DeviationBar
            label="Air temperature" value={temp} unit="°C"
            target={tTarget} warnBand={tBand} alarmBand={tBand * 2}
            min={15} max={45} history={series("temperature").slice(-80)} band={zones?.["1"] ?? null}
          />
          <Range span={span("temperature")} unit="°C" />
        </Panel>

        <Panel title="Humidity" tag="TH-01">
          <DeviationBar
            label="Relative humidity" value={hum} unit="%"
            target={hTarget} warnBand={hBand} alarmBand={hBand * 2}
            min={0} max={100} history={series("humidity").slice(-80)} band={zones?.["3"] ?? null}
          />
          <Range span={span("humidity")} unit="%" />
        </Panel>

        <WaterPanel water={water} />

        <Panel title="Soil" tag="—">
          {hasSoil ? (
            <Absent>Soil probes are configured but no readings have arrived.</Absent>
          ) : (
            <Absent>
              No soil probes fitted.
              <span className="block mt-1.5" style={{ color: HMI.inkFaint }}>
                This panel reads the farm registry rather than a hardcoded note, so it will show
                readings as soon as probes are wired and configured — nothing here needs editing.
              </span>
            </Absent>
          )}
        </Panel>
      </div>

      {stale && (
        <p className="mt-3 px-3 py-2 text-[12px]" style={{ color: HMI.warn, backgroundColor: HMI.panel }}>
          The feed is stale, so every current value above is the last one recorded rather than the
          value now. The trends are still true history.
        </p>
      )}
    </div>
  );
}

function WaterPanel({ water }: { water?: WaterResponse }) {
  if (!water?.has_meter) {
    return (
      <Panel title="Water consumption" tag="FM-01">
        <Absent>{water?.reason ?? "No water meter fitted."}</Absent>
      </Panel>
    );
  }
  if (water.readings.length === 0) {
    return (
      <Panel title="Water consumption" tag="FM-01">
        {/* Distinguished from "no meter" deliberately: this one is a fault
            worth chasing, the other is a permanent and expected absence. */}
        <Absent>
          <span style={{ color: HMI.warn }}>Meter has not reported.</span>
          <span className="block mt-1.5">It publishes about once a day; nothing has arrived yet.</span>
        </Absent>
      </Panel>
    );
  }

  const unit = water.unit_label ?? "";
  const perUnit = water.liters_per_unit ?? 1000;
  const latest = water.readings[0];
  const usable = water.readings.filter((r) => r.consumption_liters != null);
  const totalL = usable.reduce((s, r) => s + (r.consumption_liters ?? 0), 0);
  // Oldest first for the sparkline, so time runs left to right like every
  // other chart on the screen.
  const dailyL = [...water.readings].reverse().map((r) => r.consumption_liters ?? null);
  const maxL = Math.max(1, ...dailyL.filter((v): v is number => v != null));

  const vol = (l: number) =>
    l >= 1000 ? `${Number((l / perUnit).toFixed(2))} ${unit}` : `${Number(l.toFixed(0))} L`;

  return (
    <Panel title="Water consumption" tag="FM-01">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11px] tracking-widest uppercase" style={{ color: HMI.inkMuted }}>
          Latest day
        </span>
        <span className="font-mono-num tabular-nums text-2xl font-semibold" style={{ color: HMI.ink }}>
          {latest.consumption_liters != null ? vol(latest.consumption_liters) : "—"}
        </span>
      </div>
      {/* Daily totals, oldest to newest. Zero-based because a bar or line of
          consumption read against anything else misleads about proportion. */}
      <Sparkline points={dailyL} min={0} max={maxL} />
      <div className="grid grid-cols-3 gap-px mt-3">
        <Mini label={`${usable.length}-day total`} value={vol(totalL)} />
        <Mini label="Meter reading" value={latest.last_totalizer != null ? `${latest.last_totalizer} ${unit}` : "—"} />
        <Mini
          label="Last report"
          value={new Date(latest.timestamp).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
        />
      </div>
    </Panel>
  );
}

function Panel({ title, tag, children }: { title: string; tag: string; children: React.ReactNode }) {
  return (
    <section className="p-3" style={{ backgroundColor: HMI.panel }}>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: HMI.inkMuted }}>
          {title}
        </h2>
        <span className="text-[10px] font-mono-num" style={{ color: HMI.inkFaint }}>{tag}</span>
      </div>
      {children}
    </section>
  );
}

function Range({ span, unit }: { span: { min: number; max: number; n: number } | null; unit: string }) {
  if (!span) {
    return (
      <p className="text-[11px]" style={{ color: HMI.inkFaint }}>
        No stored history for the last 24 hours.
      </p>
    );
  }
  return (
    <div className="flex gap-6 text-[11px] font-mono-num" style={{ color: HMI.inkFaint }}>
      <span>MIN <span style={{ color: HMI.inkMuted }}>{span.min.toFixed(1)} {unit}</span></span>
      <span>MAX <span style={{ color: HMI.inkMuted }}>{span.max.toFixed(1)} {unit}</span></span>
      <span>over {span.n} readings, 24 h</span>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2" style={{ backgroundColor: HMI.panelAlt }}>
      <div className="text-[9px] tracking-widest uppercase mb-0.5" style={{ color: HMI.inkFaint }}>{label}</div>
      <div className="text-[13px] font-mono-num font-semibold tabular-nums" style={{ color: HMI.ink }}>{value}</div>
    </div>
  );
}

function Absent({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] leading-relaxed py-6 text-center" style={{ color: HMI.inkMuted }}>
      {children}
    </p>
  );
}
