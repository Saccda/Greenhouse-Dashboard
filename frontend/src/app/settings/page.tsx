"use client";
import { useState, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  Settings, MapPin, Wifi, ExternalLink,
  RotateCcw, Check, Bell, SendHorizontal, Play, LogIn,
} from "lucide-react";
import { clsx } from "clsx";

import { swrFetcher, fetchFarms, API_BASE } from "@/lib/api";
import { useSettings, SETTINGS_DEFAULTS } from "@/hooks/useSettings";
import { useAuth } from "@/hooks/useAuth";
import type { Farm, HealthResponse } from "@/types";

interface NotifStatus {
  telegram_configured:       boolean;
  check_interval_minutes:    number;
  offline_alert_minutes:     number;
  temp_warn_threshold:       number;
  hum_warn_threshold:        number;
  max_spray_minutes:         number;
  min_temp_drop_after_spray: number;
  active_alerts:             Record<string, { since: string; minutes: number }>;
}

function Section({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <section className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col h-full">
      <h2 className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-5 shrink-0">
        <Icon size={13} />
        {title}
      </h2>
      <div className="flex flex-col flex-1">{children}</div>
    </section>
  );
}

function NumField({ label, value, unit, min, max, onChange }: {
  label: string; value: number; unit: string;
  min: number; max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-surface-border last:border-0">
      <span className="text-sm text-slate-300">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number" value={value} min={min} max={max} step={0.5}
          onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
          className="w-20 text-right bg-surface-hover border border-surface-bright text-slate-200 text-sm font-mono-num rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-green/50"
        />
        <span className="text-xs text-slate-500 w-6">{unit}</span>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono = false, isLink = false }: {
  label: string; value: string; mono?: boolean; isLink?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-surface-border last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      {isLink ? (
        <a
          href={value} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-sm text-brand-green hover:underline font-mono-num"
        >
          {value} <ExternalLink size={11} />
        </a>
      ) : (
        <span className={clsx("text-sm text-slate-300", mono && "font-mono-num")}>{value}</span>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { settings, update } = useSettings();
  const { user } = useAuth();
  const canWrite = !!user && user.role !== "pending";
  const [farms, setFarms] = useState<Farm[]>([]);
  const [saved, setSaved] = useState(false);
  const [tempWarn, setTempWarn] = useState(settings.tempWarn);
  const [humWarn,  setHumWarn]  = useState(settings.humWarn);
  const [defFarm,  setDefFarm]  = useState(settings.defaultFarm);

  const [userName,   setUserName]  = useState(settings.userName);
  const [testState, setTestState] = useState<"idle" | "sending" | "ok" | "fail">("idle");
  const [checkState, setCheckState] = useState<"idle" | "running" | "done">("idle");

  useEffect(() => {
    setTempWarn(settings.tempWarn);
    setHumWarn(settings.humWarn);
    setDefFarm(settings.defaultFarm);
    setUserName(settings.userName);
  }, [settings.tempWarn, settings.humWarn, settings.defaultFarm, settings.userName]);

  useEffect(() => {
    fetchFarms().then((r) => setFarms(r.farms)).catch(console.error);
  }, []);

  const { data: health } = useSWR<HealthResponse>(
    "/api/health",
    swrFetcher,
    { refreshInterval: 30_000 },
  );

  const { data: notif, mutate: reloadNotif } = useSWR<NotifStatus>(
    "/api/notifications/status",
    swrFetcher,
    { refreshInterval: 60_000 },
  );

  const handleTestTelegram = async () => {
    setTestState("sending");
    try {
      const r = await fetch(`${API_BASE}/api/notifications/test`, { method: "POST" });
      const j = await r.json();
      setTestState(j.success ? "ok" : "fail");
    } catch {
      setTestState("fail");
    }
    setTimeout(() => setTestState("idle"), 4000);
  };

  const handleCheckNow = async () => {
    setCheckState("running");
    try {
      await fetch(`${API_BASE}/api/notifications/check-now`, { method: "POST" });
      await reloadNotif();
    } catch { /* ignore */ }
    setCheckState("done");
    setTimeout(() => setCheckState("idle"), 3000);
  };

  const handleSave = () => {
    update({ tempWarn, humWarn, defaultFarm: defFarm, userName });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleReset = () => {
    setTempWarn(SETTINGS_DEFAULTS.tempWarn);
    setHumWarn(SETTINGS_DEFAULTS.humWarn);
    setDefFarm(SETTINGS_DEFAULTS.defaultFarm);
    setUserName(SETTINGS_DEFAULTS.userName);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex items-center justify-between px-5 py-3.5 bg-surface-card border-b border-surface-border shrink-0">
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-slate-400" />
          <h1 className="text-sm font-semibold text-slate-200">Settings</h1>
        </div>
        <span className={clsx(
          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium",
          health ? "bg-brand-green/10 text-brand-green" : "bg-slate-800 text-slate-500",
        )}>
          <span className={clsx(
            "w-1.5 h-1.5 rounded-full",
            health ? "bg-brand-green animate-pulse" : "bg-slate-600",
          )} />
          {health ? "Backend online" : "Connecting…"}
        </span>
      </header>

      <main className="flex-1 overflow-y-auto p-5">
        {/* 4 sections as direct grid children — CSS equalises each row's height */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

          {/* ── Row 1 col 1: Alert Thresholds ─────────────────── */}
          <Section title="Alert Thresholds" icon={Settings}>
            <NumField label="Temperature warning" value={tempWarn} unit="°C" min={15} max={50} onChange={setTempWarn} />
            <NumField label="Humidity warning"    value={humWarn}  unit="%" min={30} max={100} onChange={setHumWarn} />

            <div className="flex items-center justify-between py-3 border-b border-surface-border">
              <span className="text-sm text-slate-300">Display name</span>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="ME Team"
                maxLength={32}
                className="w-40 text-right bg-surface-hover border border-surface-bright text-slate-200 text-sm rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-green/50"
              />
            </div>

            <div className="flex items-center justify-between py-3 border-b border-surface-border">
              <span className="text-sm text-slate-300">Default farm</span>
              <select
                value={defFarm}
                onChange={(e) => setDefFarm(e.target.value)}
                className="bg-surface-hover border border-surface-bright text-slate-200 text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-green/50"
              >
                {farms.length === 0 && <option value={defFarm}>{defFarm}</option>}
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>{f.display_name}</option>
                ))}
              </select>
            </div>

            <p className="text-[11px] text-slate-600 mt-auto pt-4">
              Settings are stored in browser localStorage and take effect immediately after saving.
            </p>

            <div className="flex items-center gap-3 pt-4">
              {canWrite ? (
                <button
                  onClick={handleSave}
                  className={clsx(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    saved
                      ? "bg-brand-green/20 text-brand-green border border-brand-green/30"
                      : "bg-brand-green text-black hover:bg-brand-green/90",
                  )}
                >
                  {saved && <Check size={14} />}
                  {saved ? "Saved!" : "Save Settings"}
                </button>
              ) : user ? (
                <p className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-amber-500 bg-amber-500/10 border border-amber-500/30">
                  Awaiting owner approval
                </p>
              ) : (
                <Link
                  href="/login?redirect=/settings"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 border border-surface-border hover:border-brand-green/40 transition-colors"
                >
                  <LogIn size={14} /> Log in to save
                </Link>
              )}
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 border border-surface-border hover:border-surface-bright transition-colors"
              >
                <RotateCcw size={13} /> Reset to Defaults
              </button>
            </div>
          </Section>

          {/* ── Row 1 col 2: Notifications ────────────────────── */}
          <Section title="Notifications" icon={Bell}>
            <div className="flex items-center justify-between py-3 border-b border-surface-border">
              <span className="text-sm text-slate-300">Telegram</span>
              <span className={clsx(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium",
                notif?.telegram_configured
                  ? "bg-brand-green/10 text-brand-green"
                  : "bg-amber-500/10 text-amber-400",
              )}>
                <span className={clsx(
                  "w-1.5 h-1.5 rounded-full",
                  notif?.telegram_configured ? "bg-brand-green" : "bg-amber-400",
                )} />
                {notif?.telegram_configured ? "Configured" : "Not configured"}
              </span>
            </div>

            {!notif?.telegram_configured && (
              <div className="mt-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg text-[11px] text-amber-400/80 space-y-1">
                <p className="font-semibold">Setup required:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Open Telegram → search <span className="font-mono-num">@BotFather</span> → /newbot</li>
                  <li>Copy the token → add to <span className="font-mono-num">backend/.env</span> as <span className="font-mono-num">TELEGRAM_BOT_TOKEN</span></li>
                  <li>Message your bot, then visit <span className="font-mono-num">getUpdates</span> to find your chat ID → <span className="font-mono-num">TELEGRAM_CHAT_ID</span></li>
                  <li>Restart the backend</li>
                </ol>
              </div>
            )}

            {notif && (
              <>
                <InfoRow label="Check interval"        value={`${notif.check_interval_minutes} min`}    mono />
                <InfoRow label="Offline alert after"   value={`${notif.offline_alert_minutes} min`}     mono />
                <InfoRow label="Max spray duration"    value={`${notif.max_spray_minutes} min`}         mono />
                <InfoRow label="Min temp drop (spray)" value={`${notif.min_temp_drop_after_spray} °C`}  mono />
              </>
            )}

            {notif && Object.keys(notif.active_alerts).length > 0 && (
              <div className="mt-3 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                <p className="text-[11px] font-semibold text-red-400 mb-2">Currently active</p>
                <div className="space-y-1">
                  {Object.entries(notif.active_alerts).map(([key, info]) => (
                    <div key={key} className="flex items-center justify-between py-0.5 text-[11px]">
                      <span className="text-red-300 font-mono-num">{key}</span>
                      <span className="text-red-400/70 font-mono-num">{info.minutes} min</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {notif && Object.keys(notif.active_alerts).length === 0 && (
              <p className="text-[11px] text-slate-600 mt-3">No active alerts — all conditions normal.</p>
            )}

            <div className="flex items-center gap-3 mt-auto pt-4">
              <button
                onClick={handleTestTelegram}
                disabled={!notif?.telegram_configured || testState === "sending"}
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border",
                  !notif?.telegram_configured
                    ? "opacity-40 cursor-not-allowed border-surface-border text-slate-500"
                    : testState === "ok"
                    ? "border-brand-green/30 bg-brand-green/10 text-brand-green"
                    : testState === "fail"
                    ? "border-red-500/30 bg-red-500/10 text-red-400"
                    : "border-surface-bright text-slate-300 hover:text-slate-100 hover:border-brand-green/40",
                )}
              >
                <SendHorizontal size={14} />
                {testState === "sending" ? "Sending…"
                  : testState === "ok"   ? "Sent!"
                  : testState === "fail" ? "Failed"
                  : "Send Test Message"}
              </button>
              <button
                onClick={handleCheckNow}
                disabled={checkState === "running"}
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border",
                  checkState === "done"
                    ? "border-brand-green/30 bg-brand-green/10 text-brand-green"
                    : "border-surface-bright text-slate-300 hover:text-slate-100 hover:border-brand-green/40",
                )}
              >
                <Play size={14} />
                {checkState === "running" ? "Checking…" : checkState === "done" ? "Done!" : "Run Check Now"}
              </button>
            </div>
          </Section>

          {/* ── Row 2 col 1: Farm Configuration ───────────────── */}
          <Section title="Farm Configuration" icon={MapPin}>
            {farms.length === 0 ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <div key={i} className="h-14 bg-surface-hover animate-pulse rounded-lg" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {farms.map((farm) => (
                  <div key={farm.id} className="flex items-center gap-4 p-3.5 bg-surface-hover rounded-lg border border-surface-border">
                    <div className="w-2 h-2 rounded-full bg-brand-green shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 font-medium">{farm.display_name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {farm.location} · <span className="font-mono-num">{farm.measurement}</span>
                      </p>
                    </div>
                    <span className="text-xs text-slate-600 font-mono-num shrink-0">{farm.id}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-600 mt-auto pt-4">
              To add farms, update <code className="bg-surface-bright px-1 rounded text-slate-400">config.py → FARMS</code>.
            </p>
          </Section>

          {/* ── Row 2 col 2: API & Connection ─────────────────── */}
          <Section title="API & Connection" icon={Wifi}>
            <InfoRow label="Backend URL"             value={API_BASE} mono />
            <InfoRow label="API docs (Swagger)"      value={`${API_BASE}/docs`} isLink />
            <InfoRow label="InfluxDB status"         value={health?.influxdb ?? "—"} />
            <InfoRow label="Backend status"          value={health?.status ?? "—"} />
            <InfoRow label="Live data refresh"       value="15 s" mono />
            <InfoRow label="History / stats refresh" value="30 s" mono />
            <p className="text-[11px] text-slate-600 mt-auto pt-4">
              Alert thresholds are set in <code className="bg-surface-bright px-1 rounded text-slate-400">backend/.env</code> or fall back to config.py defaults.
            </p>
          </Section>

        </div>
      </main>
    </div>
  );
}
