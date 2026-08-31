"use client";
/**
 * CampusSetpointPanel — the campus rig's auto threshold-setpoint control.
 * Distinct from SetpointPanel (Kampot/Kep, one relay at a time, proxied
 * through Node-RED): campus's controller expects all three zones' low/high
 * values in one combined MQTT publish every time (see routes/campus.py), so
 * this panel edits all three at once instead of switching between them.
 */
import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { clsx } from "clsx";
import { format } from "date-fns";

import { swrFetcher, API_BASE } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

type StoredZones = Record<string, { low: number; high: number; updated_at: string }>;

const ZONES = [
  { index: 1, label: "Zone 1", param: "temp", lowKey: "temp_low1", highKey: "temp_high1", unit: "°C", min: 0, max: 50, step: 0.5 },
  { index: 2, label: "Zone 2", param: "temp", lowKey: "temp_low2", highKey: "temp_high2", unit: "°C", min: 0, max: 50, step: 0.5 },
  { index: 3, label: "Zone 3", param: "hum",  lowKey: "hum_low3",  highKey: "hum_high3",  unit: "%",  min: 0, max: 100, step: 1 },
] as const;

const DEFAULTS: Record<string, number> = {
  temp_low1: 23.0, temp_high1: 24.5,
  temp_low2: 25.0, temp_high2: 26.0,
  hum_low3:  40.0, hum_high3:  60.0,
};

type Values = Record<string, number>;
type SpStatus = "idle" | "sending" | "sent" | "error" | "unauthorized";

interface Props {
  canWrite:  boolean;
  className?: string;
}

export default function CampusSetpointPanel({ canWrite, className }: Props) {
  const { user, logout } = useAuth();

  const [values, setValues] = useState<Values>(DEFAULTS);
  const [spStatus, setSpStatus] = useState<SpStatus>("idle");
  const [lastSent, setLastSent] = useState<string | null>(null);
  const appliedRef = useRef(false);

  const { data: stored } = useSWR<StoredZones>(
    `/api/campus/setpoint`, swrFetcher, { refreshInterval: 15_000 },
  );

  // Apply last-sent values once, the same "checkpoint" pattern SetpointPanel
  // uses — not on every poll tick, so a half-edited form doesn't jump under
  // the user mid-edit.
  useEffect(() => {
    if (appliedRef.current) return;
    if (spStatus === "sending") return;
    if (stored === undefined) return;

    const next: Values = { ...DEFAULTS };
    for (const zone of ZONES) {
      const z = stored[String(zone.index)];
      if (z) { next[zone.lowKey] = z.low; next[zone.highKey] = z.high; }
    }
    setValues(next);
    appliedRef.current = true;
  }, [stored, spStatus]);

  const setField = (key: string, v: number) => setValues((prev) => ({ ...prev, [key]: v }));

  const hasInvalidZone = ZONES.some((z) => values[z.lowKey] >= values[z.highKey]);

  const handleSend = async () => {
    if (hasInvalidZone) { alert("Each zone's low setpoint must be less than its high setpoint."); return; }
    setSpStatus("sending");
    try {
      const res = await fetch(`${API_BASE}/api/campus/setpoint`, {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify(values),
      });
      if (res.status === 401) {
        logout();
        setSpStatus("unauthorized");
        setTimeout(() => setSpStatus("idle"), 4000);
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      setSpStatus("sent");
      setLastSent(`Sent ${format(new Date(), "HH:mm:ss")}`);
      setTimeout(() => setSpStatus("idle"), 3000);
    } catch {
      setSpStatus("error");
      setTimeout(() => setSpStatus("idle"), 4000);
    }
  };

  return (
    <div className={clsx("border border-surface-border bg-surface-card rounded-xl p-4 flex flex-col gap-4", className)}>
      <div className="flex items-center gap-2">
        <div className="w-1 h-4 bg-brand-green rounded-full" />
        <p className="text-xs font-semibold tracking-wider uppercase text-slate-300">
          Auto Setpoints
        </p>
      </div>

      {ZONES.map((zone) => (
        <div key={zone.index} className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            {zone.label} — {zone.param === "temp" ? "Temperature" : "Humidity"}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase tracking-widest text-slate-500">Low</label>
                <span className="text-xs font-mono-num text-green-500">
                  {values[zone.lowKey]}{zone.unit}
                </span>
              </div>
              <input
                type="range" min={zone.min} max={zone.max} step={zone.step}
                value={values[zone.lowKey]}
                onChange={(e) => setField(zone.lowKey, Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-green-500 bg-surface-hover"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase tracking-widest text-slate-500">High</label>
                <span className="text-xs font-mono-num text-orange-500">
                  {values[zone.highKey]}{zone.unit}
                </span>
              </div>
              <input
                type="range" min={zone.min} max={zone.max} step={zone.step}
                value={values[zone.highKey]}
                onChange={(e) => setField(zone.highKey, Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-orange-500 bg-surface-hover"
              />
            </div>
          </div>

          {values[zone.lowKey] >= values[zone.highKey] && (
            <p className="text-[11px] font-mono text-amber-500">⚠ Low must be less than high</p>
          )}
        </div>
      ))}

      {canWrite ? (
        <button
          onClick={handleSend}
          disabled={spStatus === "sending" || hasInvalidZone}
          className={clsx(
            "w-full py-3 rounded-xl text-xs font-mono-num font-bold tracking-[0.15em] uppercase transition-all active:scale-[0.98] border",
            spStatus === "sent"
              ? "bg-green-500/15 text-green-600 border-green-500/30"
              : spStatus === "error" || spStatus === "unauthorized"
              ? "bg-red-500/15 text-red-600 border-red-500/30"
              : spStatus === "sending" || hasInvalidZone
              ? "bg-surface-hover border-surface-border text-slate-400 cursor-not-allowed"
              : "bg-brand-green text-black hover:bg-brand-green/90 border-transparent",
          )}
        >
          {spStatus === "sent"          ? "✓  Sent to Controller"
          : spStatus === "unauthorized" ? "✗  Session expired — log in again"
          : spStatus === "error"        ? "✗  Failed — Retry"
          : spStatus === "sending"      ? "Sending…"
          :                               "Send to Controller"}
        </button>
      ) : user ? (
        <p className="w-full py-3 rounded-xl text-xs font-mono-num font-bold tracking-[0.15em] uppercase text-center text-amber-500 bg-amber-500/10 border border-amber-500/30">
          Awaiting owner approval
        </p>
      ) : (
        <Link
          href="/login?redirect=/control"
          className="w-full py-3 rounded-xl text-xs font-mono-num font-bold tracking-[0.15em] uppercase transition-all border flex items-center justify-center gap-2 text-slate-400 border-surface-border hover:border-brand-green/40 hover:text-slate-200"
        >
          <LogIn size={14} /> Log in to send commands
        </Link>
      )}

      {lastSent && (
        <p className="text-[11px] font-mono-num text-center text-slate-400">{lastSent}</p>
      )}
    </div>
  );
}
