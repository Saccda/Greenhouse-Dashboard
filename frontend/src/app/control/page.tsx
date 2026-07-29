"use client";
import { useState, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Sliders, Save, Cpu, AlertTriangle, CheckCircle, LogIn } from "lucide-react";
import { clsx } from "clsx";
import { format } from "date-fns";

import { swrFetcher, API_BASE } from "@/lib/api";
import { useSettings, syncThresholdsToBackend } from "@/hooks/useSettings";
import { useFarmSelection } from "@/hooks/useFarmSelection";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/layout/Header";
import { RelayPanel } from "@/components/hmi/RelayIndicator";
import EquipmentMimic from "@/components/hmi/EquipmentMimic";
import SetpointPanel from "@/components/hmi/SetpointPanel";
import Sparkline from "@/components/charts/Sparkline";
import type { LatestResponse } from "@/types";

// ── Sub-components ────────────────────────────────────────────────────────────

function ThresholdInput({
  label, value, unit, min, max, step = 0.5, color, onChange,
}: {
  label: string; value: number; unit: string;
  min: number; max: number; step?: number;
  color: string; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-slate-400">{label}</label>
        <span className={clsx("text-sm font-bold font-mono-num", color)}>{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-brand-green bg-surface-bright"
      />
      <div className="flex justify-between text-[10px] text-slate-600">
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ControlPage() {
  const { settings, update } = useSettings();
  const { user, logout } = useAuth();
  const canWrite = !!user && user.role !== "pending";
  const { farm, setFarm, farms } = useFarmSelection();
  const [saved,    setSaved]    = useState(false);
  const [tempWarn, setTempWarn] = useState(settings.tempWarn);
  const [humWarn,  setHumWarn]  = useState(settings.humWarn);

  const [tempHistory, setTempHistory] = useState<number[]>([]);
  const [humHistory,  setHumHistory]  = useState<number[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/settings`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { setTempWarn(d.temp_warn); setHumWarn(d.hum_warn); })
      .catch(() => { setTempWarn(settings.tempWarn); setHumWarn(settings.humWarn); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: latest, isLoading, error, mutate } = useSWR<LatestResponse>(
    `/api/sensors/latest?farm=${farm}`, swrFetcher, { refreshInterval: 15_000 },
  );

  const connectionStatus = error ? "offline" : latest ? "online" : "loading";
  const isOnline  = latest?.is_online ?? false;
  const temp      = !isOnline ? undefined : latest?.readings?.temperature?.value;
  const hum       = !isOnline ? undefined : latest?.readings?.humidity?.value;
  const relays    = latest?.relays ?? [];
  const mqttTopic = farm === "kampot" ? "soge/product/set"
                  : farm === "kep"    ? "kep/reaksafarm/set_data"
                  : "campus/set_data (TBD — not wired up yet)";

  useEffect(() => {
    if (temp != null) setTempHistory(prev => [...prev.slice(-29), temp]);
  }, [temp]);
  useEffect(() => {
    if (hum != null) setHumHistory(prev => [...prev.slice(-29), hum]);
  }, [hum]);

  const alarms: string[] = [
    ...(!isOnline && connectionStatus === "offline" ? ["SYSTEM OFFLINE"] : []),
    ...(temp != null && temp > tempWarn ? [`TEMP HIGH  ${temp.toFixed(1)}°C > ${tempWarn}°C`] : []),
    ...(hum  != null && hum  > humWarn  ? [`HUM HIGH  ${Math.round(hum)}% > ${humWarn}%`]     : []),
  ];

  const handleSave = async () => {
    update({ tempWarn, humWarn });
    const result = await syncThresholdsToBackend(tempWarn, humWarn);
    if (result === "unauthorized") { logout(); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header
        selectedFarm={farm} farms={farms} onFarmChange={setFarm}
        connectionStatus={connectionStatus}
        lastUpdated={latest ? new Date(latest.timestamp) : null}
        isLoading={isLoading} onRefresh={() => mutate()}
      />

      <main className="flex-1 overflow-y-auto p-5">
        <div className="max-w-screen-2xl mx-auto space-y-5">

        {/* ── Section 1: Live relay status cards ─────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className={clsx(
              "inline-block w-2 h-2 rounded-full",
              connectionStatus === "online" ? "bg-brand-green animate-pulse" : "bg-slate-600",
            )} />
            Live Relay Status
          </h2>
          {isLoading && !latest ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 bg-surface-card border border-surface-border rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <RelayPanel relays={latest?.relays ?? []} />
          )}
          {latest?.timestamp && (
            <p className="text-[11px] text-slate-600 mt-2">
              Last refreshed: {format(new Date(latest.timestamp), "HH:mm:ss")} · auto-updates every 15s
            </p>
          )}
        </section>

        {/* ── Section 2: Alert thresholds ─────────────────────────────── */}
        <section className="bg-surface-card border border-surface-border rounded-xl p-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-5 flex items-center gap-2">
            <Sliders size={13} /> Alert Thresholds
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <ThresholdInput
              label="Temperature warning trigger"
              value={tempWarn} unit="°C" min={20} max={50} step={0.5}
              color="text-orange-400" onChange={setTempWarn}
            />
            <ThresholdInput
              label="Humidity warning trigger"
              value={humWarn} unit="%" min={30} max={100} step={1}
              color="text-blue-400" onChange={setHumWarn}
            />
          </div>
          <div className="mt-6 flex items-center gap-3">
            {canWrite ? (
              <>
                <button
                  onClick={handleSave}
                  className={clsx(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    saved
                      ? "bg-brand-green/20 text-brand-green border border-brand-green/30"
                      : "bg-brand-green text-black hover:bg-brand-green/90",
                  )}
                >
                  <Save size={14} />
                  {saved ? "Saved!" : "Save Thresholds"}
                </button>
                <p className="text-[11px] text-slate-600">Synced to backend — alert bot uses these values</p>
              </>
            ) : user ? (
              <p className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-amber-500 bg-amber-500/10 border border-amber-500/30">
                Your account is awaiting approval from a farm owner
              </p>
            ) : (
              <Link
                href="/login?redirect=/control"
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-400 border border-surface-border hover:border-brand-green/40 hover:text-slate-200 transition-colors"
              >
                <LogIn size={14} /> Log in to save thresholds
              </Link>
            )}
          </div>
        </section>

        {/* ── Section 3: Controller HMI (SCADA-style) ─────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Cpu size={13} /> Controller HMI
            {alarms.length > 0 && (
              <span className="ml-auto flex items-center gap-1 text-red-400 text-[10px]">
                <AlertTriangle size={11} />
                {alarms.length} Alarm{alarms.length !== 1 ? "s" : ""}
              </span>
            )}
          </h2>

          {/* Alarm banner strip */}
          {alarms.length > 0 && (
            <div className="mb-3 flex items-center gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 overflow-x-auto">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0 animate-pulse" />
              <div className="flex gap-6">
                {alarms.map((a, i) => (
                  <span key={i} className="text-xs font-mono text-red-300 whitespace-nowrap">{a}</span>
                ))}
              </div>
            </div>
          )}

          {/* Equipment photo diagram, with live flow-dot animation */}
          <div className="mb-4">
            <EquipmentMimic relays={relays} temp={temp} hum={hum} />
          </div>

          {/* Bottom row: 3 panels */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* ── Trend chart ── */}
            <div className="border border-surface-border bg-surface-card rounded-xl p-4 space-y-4">
              <p className="text-xs font-semibold tracking-wider uppercase text-slate-300">
                Process Trend — Live
              </p>
              <Sparkline data={tempHistory} label="Temperature" unit="°C" hiColor="#fb923c" />
              <Sparkline data={humHistory}  label="Humidity"    unit="%" hiColor="#38bdf8" />
            </div>

            {/* ── System status & alarms ── */}
            <div className="border border-surface-border bg-surface-card rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold tracking-wider uppercase text-slate-300">
                System &amp; Alarms
              </p>

              {/* Online badge */}
              <div className={clsx(
                "flex items-center gap-2 px-3 py-2.5 rounded-lg border",
                isOnline ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30",
              )}>
                <div className={clsx(
                  "w-2.5 h-2.5 rounded-full shrink-0",
                  isOnline ? "bg-green-400 animate-pulse" : "bg-red-400",
                )} />
                <span className={clsx(
                  "text-sm font-mono font-bold uppercase tracking-widest",
                  isOnline ? "text-green-500" : "text-red-500",
                )}>
                  {isOnline ? "ONLINE" : "OFFLINE"}
                </span>
                {latest?.data_age_minutes != null && (
                  <span className="text-xs font-mono-num ml-auto text-slate-400">
                    {latest.data_age_minutes < 1
                      ? "Just now"
                      : `${Math.round(latest.data_age_minutes)}m ago`}
                  </span>
                )}
              </div>

              {/* PV vs warn threshold */}
              <div className="space-y-1.5">
                <div className="flex text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  <span className="flex-1">Param</span>
                  <span className="mr-4">PV</span>
                  <span>Warn</span>
                </div>
                {[
                  { label: "TEMP", pv: temp,  warn: tempWarn, unit: "°C", hiColor: "#fb923c" },
                  { label: "HUM",  pv: hum,   warn: humWarn,  unit: "%",  hiColor: "#38bdf8" },
                ].map(row => {
                  const alarm = row.pv != null && row.pv > row.warn;
                  return (
                    <div key={row.label}
                      className={clsx(
                        "flex items-center px-3 py-2 rounded border text-xs font-mono-num gap-2",
                        alarm ? "bg-red-500/10 border-red-500/30" : "bg-surface-hover border-surface-border",
                      )}>
                      <span className="w-10 uppercase tracking-widest shrink-0 text-slate-400">
                        {row.label}
                      </span>
                      <span className={clsx("font-bold text-sm", row.pv == null && "text-slate-400")}
                        style={row.pv != null ? { color: alarm ? "#f87171" : row.hiColor } : undefined}>
                        {row.pv != null ? `${row.pv.toFixed(1)}${row.unit}` : "--"}
                      </span>
                      <span className="ml-auto text-slate-400">
                        / {row.warn}{row.unit}
                      </span>
                      {alarm && <AlertTriangle size={12} className="text-red-500 shrink-0" />}
                    </div>
                  );
                })}
              </div>

              {/* Alarm list */}
              <div className="pt-2.5 space-y-1.5 border-t border-surface-border">
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-2 text-slate-400">Active Alarms</p>
                {alarms.length === 0 ? (
                  <div className="flex items-center gap-2 text-xs font-mono text-green-600 py-1">
                    <CheckCircle size={13} /> No active alarms
                  </div>
                ) : (
                  alarms.map((a, i) => (
                    <div key={i}
                      className="flex items-center gap-2 px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-xs font-mono text-red-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
                      {a}
                    </div>
                  ))
                )}
              </div>

              {/* MQTT info */}
              <div className="pt-2.5 border-t border-surface-border">
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-1 text-slate-400">MQTT Topic</p>
                <p className="text-xs font-mono-num leading-relaxed text-slate-400">
                  {mqttTopic}
                </p>
              </div>
            </div>

            {/* ── Setpoint programming ── */}
            <SetpointPanel farm={farm} canWrite={canWrite} />

          </div>
        </section>

        </div>
      </main>
    </div>
  );
}
