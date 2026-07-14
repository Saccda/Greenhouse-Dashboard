"use client";
import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Sliders, Save, Cpu, AlertTriangle, CheckCircle, LogIn } from "lucide-react";
import { clsx } from "clsx";
import { format } from "date-fns";

import { swrFetcher, fetchFarms, API_BASE } from "@/lib/api";
import { useSettings, syncThresholdsToBackend } from "@/hooks/useSettings";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/layout/Header";
import { RelayPanel } from "@/components/hmi/RelayIndicator";
import EquipmentMimic from "@/components/hmi/EquipmentMimic";
import type { LatestResponse, Farm } from "@/types";

type StoredSetpoints = Record<string, { low: number; high: number; updated_at: string }>;

// ── Relay setpoint configuration ─────────────────────────────────────────────

const RELAY_CFG = {
  1: { label: "Cooling System", pLow: "P1", pHigh: "P2", unit: "°C", min: 20, max: 45, step: 0.5,  defaultLow: 25,    defaultHigh: 35 },
  2: { label: "Standby",        pLow: "P3", pHigh: "P4", unit: "",   min: 0,  max: 100, step: 1,    defaultLow: 40,    defaultHigh: 60 },
  3: { label: "Spray Pump",     pLow: "P5", pHigh: "P6", unit: "°C", min: 20, max: 45,  step: 0.01, defaultLow: 35.76, defaultHigh: 35.86 },
} as const;
type RelayNum = keyof typeof RELAY_CFG;
type SpStatus = "idle" | "sending" | "sent" | "error" | "unauthorized";

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

function Sparkline({ data, label, unit, hiColor }: {
  data: number[]; label: string; unit: string; hiColor: string;
}) {
  const id = `sg-${label.replace(/\W/g, "").toLowerCase()}`;
  if (data.length < 2) {
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            {label}
          </span>
        </div>
        <div className="h-12 flex items-center justify-center text-xs font-mono-num text-slate-400">
          Awaiting data…
        </div>
      </div>
    );
  }
  const W = 200, H = 48;
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const range = (hi - lo) || 1;
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const arrow = last > prev + 0.1 ? "↑" : last < prev - 0.1 ? "↓" : "→";
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * W},${H - ((v - lo) / range) * H}`
  ).join(" ");
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          {label}
        </span>
        <span className="text-sm font-mono-num font-bold" style={{ color: hiColor }}>
          {last.toFixed(1)}{unit} {arrow}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12" preserveAspectRatio="none">
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={hiColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={hiColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`M0,${H} ${pts} ${W},${H} Z`} fill={`url(#${id})`} />
        <polyline points={pts} fill="none" stroke={hiColor} strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx={W} cy={H - ((last - lo) / range) * H} r="2.5" fill={hiColor} />
      </svg>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ControlPage() {
  const { settings, update } = useSettings();
  const { user, token, logout } = useAuth();
  const canWrite = !!user && user.role !== "pending";
  const [farm,  setFarm]  = useState(settings.defaultFarm);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [saved,    setSaved]    = useState(false);
  const [tempWarn, setTempWarn] = useState(settings.tempWarn);
  const [humWarn,  setHumWarn]  = useState(settings.humWarn);

  const [selectedRelay, setSelectedRelay] = useState<RelayNum>(1);
  const [lowSP,  setLowSP]  = useState<number>(RELAY_CFG[1].defaultLow);
  const [highSP, setHighSP] = useState<number>(RELAY_CFG[1].defaultHigh);
  const [spStatus, setSpStatus] = useState<SpStatus>("idle");
  const [lastSent, setLastSent] = useState<string | null>(null);
  const appliedKeyRef = useRef<string | null>(null);

  const [tempHistory, setTempHistory] = useState<number[]>([]);
  const [humHistory,  setHumHistory]  = useState<number[]>([]);

  useEffect(() => {
    fetchFarms().then((r) => setFarms(r.farms)).catch(console.error);
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/settings`)
      .then((r) => r.json())
      .then((d) => { setTempWarn(d.temp_warn); setHumWarn(d.hum_warn); })
      .catch(() => { setTempWarn(settings.tempWarn); setHumWarn(settings.humWarn); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: latest, isLoading, error, mutate } = useSWR<LatestResponse>(
    `/api/sensors/latest?farm=${farm}`, swrFetcher, { refreshInterval: 15_000 },
  );

  // Last-sent setpoints from any browser — lets a second tab pick up a
  // change someone else made, on the same 15s cadence as the sensor poll.
  const { data: spData } = useSWR<StoredSetpoints>(
    `/api/setpoint?farm=${farm}`, swrFetcher, { refreshInterval: 15_000 },
  );

  const connectionStatus = error ? "offline" : latest ? "online" : "loading";
  const isOnline  = latest?.is_online ?? false;
  const temp      = !isOnline ? undefined : latest?.readings?.temperature?.value;
  const hum       = !isOnline ? undefined : latest?.readings?.humidity?.value;
  const relays    = latest?.relays ?? [];
  const cfg       = RELAY_CFG[selectedRelay];
  const mqttTopic = farm === "kampot" ? "soge/product/set" : "kep/reaksafarm/set_data";

  useEffect(() => {
    if (temp != null) setTempHistory(prev => [...prev.slice(-29), temp]);
  }, [temp]);
  useEffect(() => {
    if (hum != null) setHumHistory(prev => [...prev.slice(-29), hum]);
  }, [hum]);

  // Apply the last-sent setpoint only at "checkpoints" — mount, relay
  // switch, or farm switch — never on every poll tick, and never while a
  // send is in flight. A tab already sitting on a relay won't jump under
  // the user's cursor if someone else changes that same relay elsewhere;
  // it'll pick that up on the next relay/farm switch or reload.
  useEffect(() => {
    const key = `${farm}:${selectedRelay}`;
    if (appliedKeyRef.current === key) return;
    if (spStatus === "sending") return;
    if (spData === undefined) return;

    const stored = spData[String(selectedRelay)];
    if (stored) {
      setLowSP(stored.low);
      setHighSP(stored.high);
    } else {
      setLowSP(RELAY_CFG[selectedRelay].defaultLow);
      setHighSP(RELAY_CFG[selectedRelay].defaultHigh);
    }
    appliedKeyRef.current = key;
  }, [farm, selectedRelay, spData, spStatus]);

  const alarms: string[] = [
    ...(!isOnline && connectionStatus === "offline" ? ["SYSTEM OFFLINE"] : []),
    ...(temp != null && temp > tempWarn ? [`TEMP HIGH  ${temp.toFixed(1)}°C > ${tempWarn}°C`] : []),
    ...(hum  != null && hum  > humWarn  ? [`HUM HIGH  ${Math.round(hum)}% > ${humWarn}%`]     : []),
  ];

  const handleRelayChange = (r: RelayNum) => {
    setSelectedRelay(r);
  };

  const handleSendSetpoint = async () => {
    if (lowSP >= highSP) { alert("Low setpoint must be less than high setpoint."); return; }
    setSpStatus("sending");
    try {
      const res = await fetch(`${API_BASE}/api/setpoint`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ farm, relay: selectedRelay, low: lowSP, high: highSP }),
      });
      if (res.status === 401) {
        logout();
        setSpStatus("unauthorized");
        setTimeout(() => setSpStatus("idle"), 4000);
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      setSpStatus("sent");
      setLastSent(
        `R${selectedRelay} ${cfg.pLow}:${lowSP}${cfg.unit}  ${cfg.pHigh}:${highSP}${cfg.unit}  ${format(new Date(), "HH:mm:ss")}`,
      );
      // We just sent this value ourselves — no need to re-apply it from the next poll.
      appliedKeyRef.current = `${farm}:${selectedRelay}`;
      setTimeout(() => setSpStatus("idle"), 3000);
    } catch {
      setSpStatus("error");
      setTimeout(() => setSpStatus("idle"), 4000);
    }
  };

  const handleSave = async () => {
    update({ tempWarn, humWarn });
    const result = await syncThresholdsToBackend(tempWarn, humWarn, token);
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
            <div className="border border-surface-border bg-surface-card rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-brand-green rounded-full" />
                <p className="text-xs font-semibold tracking-wider uppercase text-slate-300">
                  Setpoint Programming
                </p>
              </div>

              {/* Relay button group */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-2 text-slate-400">Target Relay</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {([1, 2, 3] as RelayNum[]).map(n => (
                    <button key={n}
                      onClick={() => handleRelayChange(n)}
                      className={clsx(
                        "py-2 rounded-lg text-xs font-mono-num font-bold uppercase tracking-widest border transition-all",
                        selectedRelay === n
                          ? "bg-brand-green/20 text-brand-green border-brand-green/40"
                          : "bg-surface-hover border-surface-border text-slate-400 hover:border-brand-green/30",
                      )}
                    >
                      R{n}
                    </button>
                  ))}
                </div>
                <p className="text-xs font-mono-num mt-2 text-slate-400">
                  {cfg.label} — {cfg.pLow} / {cfg.pHigh}
                </p>
              </div>

              {/* Low setpoint */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Low ({cfg.pLow})
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number" min={cfg.min} max={cfg.max} step={cfg.step} value={lowSP}
                      onChange={(e) => setLowSP(Number(e.target.value))}
                      className="w-16 text-green-500 text-xs font-mono-num text-right px-2 py-1.5 rounded-lg focus:outline-none border bg-surface-hover border-surface-border"
                    />
                    {cfg.unit && <span className="text-xs font-mono-num text-slate-400">{cfg.unit}</span>}
                  </div>
                </div>
                <input type="range" min={cfg.min} max={cfg.max} step={cfg.step} value={lowSP}
                  onChange={(e) => setLowSP(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-green-500 bg-surface-hover" />
              </div>

              {/* High setpoint */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    High ({cfg.pHigh})
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number" min={cfg.min} max={cfg.max} step={cfg.step} value={highSP}
                      onChange={(e) => setHighSP(Number(e.target.value))}
                      className="w-16 text-orange-500 text-xs font-mono-num text-right px-2 py-1.5 rounded-lg focus:outline-none border bg-surface-hover border-surface-border"
                    />
                    {cfg.unit && <span className="text-xs font-mono-num text-slate-400">{cfg.unit}</span>}
                  </div>
                </div>
                <input type="range" min={cfg.min} max={cfg.max} step={cfg.step} value={highSP}
                  onChange={(e) => setHighSP(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-orange-500 bg-surface-hover" />
              </div>

              {lowSP >= highSP && (
                <p className="text-xs font-mono text-amber-500">
                  ⚠ Low must be less than high
                </p>
              )}

              {/* Send button */}
              {canWrite ? (
                <button
                  onClick={handleSendSetpoint}
                  disabled={spStatus === "sending" || lowSP >= highSP}
                  className={clsx(
                    "mt-auto w-full py-3 rounded-xl text-xs font-mono-num font-bold tracking-[0.15em] uppercase transition-all active:scale-[0.98] border",
                    spStatus === "sent"
                      ? "bg-green-500/15 text-green-600 border-green-500/30"
                      : spStatus === "error" || spStatus === "unauthorized"
                      ? "bg-red-500/15 text-red-600 border-red-500/30"
                      : spStatus === "sending" || lowSP >= highSP
                      ? "bg-surface-hover border-surface-border text-slate-400 cursor-not-allowed"
                      : "bg-brand-green text-black hover:bg-brand-green/90 border-transparent",
                  )}
                >
                  {spStatus === "sent"         ? "✓  Sent to Controller"
                  : spStatus === "unauthorized" ? "✗  Session expired — log in again"
                  : spStatus === "error"        ? "✗  Failed — Retry"
                  : spStatus === "sending"      ? "Sending…"
                  :                              "Send to Controller"}
                </button>
              ) : user ? (
                <p className="mt-auto w-full py-3 rounded-xl text-xs font-mono-num font-bold tracking-[0.15em] uppercase text-center text-amber-500 bg-amber-500/10 border border-amber-500/30">
                  Awaiting owner approval
                </p>
              ) : (
                <Link
                  href="/login?redirect=/control"
                  className="mt-auto w-full py-3 rounded-xl text-xs font-mono-num font-bold tracking-[0.15em] uppercase transition-all border flex items-center justify-center gap-2 text-slate-400 border-surface-border hover:border-brand-green/40 hover:text-slate-200"
                >
                  <LogIn size={14} /> Log in to send commands
                </Link>
              )}

              {lastSent && (
                <p className="text-[11px] font-mono-num text-center leading-relaxed text-slate-400">
                  {lastSent}
                </p>
              )}
            </div>

          </div>
        </section>

        </div>
      </main>
    </div>
  );
}
