"use client";
/**
 * SetpointPanel — relay target + low/high setpoint control, POSTs to
 * /api/setpoint. Kampot/Kep only — campus's controller takes direct on/off
 * commands instead (see routes/campus.py, RelayPanel's toggle support).
 */
import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { clsx } from "clsx";
import { format } from "date-fns";

import { swrFetcher, API_BASE } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

type StoredSetpoints = Record<string, { low: number; high: number; updated_at: string }>;

export const RELAY_CFG = {
  1: { label: "Cooling System", pLow: "P1", pHigh: "P2", unit: "°C", min: 20, max: 45, step: 0.5,  defaultLow: 25,    defaultHigh: 35 },
  2: { label: "Standby",        pLow: "P3", pHigh: "P4", unit: "",   min: 0,  max: 100, step: 1,    defaultLow: 40,    defaultHigh: 60 },
  3: { label: "Spray Pump",     pLow: "P5", pHigh: "P6", unit: "°C", min: 20, max: 45,  step: 0.01, defaultLow: 35.76, defaultHigh: 35.86 },
} as const;
export type RelayNum = keyof typeof RELAY_CFG;
type SpStatus = "idle" | "sending" | "sent" | "error" | "unauthorized";

interface SetpointPanelProps {
  farm:      string;
  canWrite:  boolean;
  className?: string;
}

export default function SetpointPanel({ farm, canWrite, className }: SetpointPanelProps) {
  const { user, logout } = useAuth();

  const [selectedRelay, setSelectedRelay] = useState<RelayNum>(1);
  const [lowSP,  setLowSP]  = useState<number>(RELAY_CFG[1].defaultLow);
  const [highSP, setHighSP] = useState<number>(RELAY_CFG[1].defaultHigh);
  const [spStatus, setSpStatus] = useState<SpStatus>("idle");
  const [lastSent, setLastSent] = useState<string | null>(null);
  const appliedKeyRef = useRef<string | null>(null);

  const cfg = RELAY_CFG[selectedRelay];

  // Last-sent setpoints from any browser — lets a second tab pick up a
  // change someone else made, on the same 15s cadence as the sensor poll.
  const { data: spData } = useSWR<StoredSetpoints>(
    `/api/setpoint?farm=${farm}`, swrFetcher, { refreshInterval: 15_000 },
  );

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

  const handleSendSetpoint = async () => {
    if (lowSP >= highSP) { alert("Low setpoint must be less than high setpoint."); return; }
    setSpStatus("sending");
    try {
      const res = await fetch(`${API_BASE}/api/setpoint`, {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({ farm, relay: selectedRelay, low: lowSP, high: highSP }),
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

  return (
    <div className={clsx("border border-surface-border bg-surface-card rounded-xl p-4 flex flex-col gap-3", className)}>
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
              onClick={() => setSelectedRelay(n)}
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
  );
}
