"use client";
/**
 * SCADA — control-first HMI, built for the campus test rig (nav item only
 * shows for the campus farm — see Sidebar.tsx). Live control (setpoints,
 * relay status, alarms) is the primary content, not a passive diagram —
 * the earlier /scada attempt (a P&ID photo overlay) was removed for being
 * the opposite of that.
 */
import { useState, useEffect } from "react";
import useSWR from "swr";
import { AlertTriangle, CheckCircle } from "lucide-react";
import { clsx } from "clsx";

import { swrFetcher } from "@/lib/api";
import { useSettings } from "@/hooks/useSettings";
import { useFarmSelection } from "@/hooks/useFarmSelection";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/layout/Header";
import { RelayPanel } from "@/components/hmi/RelayIndicator";
import SetpointPanel from "@/components/hmi/SetpointPanel";
import Sparkline from "@/components/charts/Sparkline";
import type { LatestResponse } from "@/types";

export default function ScadaPage() {
  const { settings } = useSettings();
  const { user } = useAuth();
  const canWrite = !!user && user.role !== "pending";
  const { farm, setFarm, farms } = useFarmSelection();

  const tempWarn = settings.tempWarn;
  const humWarn  = settings.humWarn;

  const [tempHistory, setTempHistory] = useState<number[]>([]);
  const [humHistory,  setHumHistory]  = useState<number[]>([]);

  const { data: latest, isLoading, error, mutate } = useSWR<LatestResponse>(
    `/api/sensors/latest?farm=${farm}`, swrFetcher, { refreshInterval: 15_000 },
  );

  const connectionStatus = error ? "offline" : latest ? "online" : "loading";
  const isOnline = latest?.is_online ?? false;
  const temp     = !isOnline ? undefined : latest?.readings?.temperature?.value;
  const hum      = !isOnline ? undefined : latest?.readings?.humidity?.value;

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

          {/* Alarm banner — top, high visibility */}
          {alarms.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 overflow-x-auto">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0 animate-pulse" />
              <div className="flex gap-6">
                {alarms.map((a, i) => (
                  <span key={i} className="text-xs font-mono text-red-300 whitespace-nowrap">{a}</span>
                ))}
              </div>
            </div>
          )}

          {/* ── Hero row: setpoint control is the primary element, not the bottom-of-page afterthought ── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">

            <div className="lg:col-span-2">
              <SetpointPanel farm={farm} canWrite={canWrite} />
            </div>

            <div className="lg:col-span-3 flex flex-col gap-4">
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
              </section>

              <div className="border border-surface-border bg-surface-card rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold tracking-wider uppercase text-slate-300">
                  System &amp; Alarms
                </p>

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

                <div className="space-y-1.5">
                  <div className="flex text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    <span className="flex-1">Param</span>
                    <span className="mr-4">PV</span>
                    <span>Warn</span>
                  </div>
                  {[
                    { label: "TEMP", pv: temp, warn: tempWarn, unit: "°C", hiColor: "#fb923c" },
                    { label: "HUM",  pv: hum,  warn: humWarn,  unit: "%",  hiColor: "#38bdf8" },
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
              </div>
            </div>
          </div>

          {/* ── Secondary: live trend — clearly not the focus of this page ── */}
          <section className="border border-surface-border bg-surface-card rounded-xl p-4">
            <p className="text-xs font-semibold tracking-wider uppercase text-slate-300 mb-4">
              Process Trend — Live
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Sparkline data={tempHistory} label="Temperature" unit="°C" hiColor="#fb923c" />
              <Sparkline data={humHistory}  label="Humidity"    unit="%" hiColor="#38bdf8" />
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
