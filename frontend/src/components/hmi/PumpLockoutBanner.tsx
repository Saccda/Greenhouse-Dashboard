"use client";
/**
 * Shown when the system has stopped a pump to save it from running dry, and
 * afterwards while the farm is on its last chance.
 *
 * This is the only place a person can undo an automatic actuation, so it says
 * plainly what was done, why, and what has to be true before undoing it.
 * Releasing does not refill a tank — release it with the tank still empty and
 * the dry run starts again — so the button is deliberately not the first thing
 * the eye lands on.
 *
 * Three states, because the guard has three:
 *   locked, first strike  → may restore itself once if the greenhouse cools
 *   locked, second strike → will not, and says so
 *   not locked, strike spent → a thin reminder that the next dry run is final
 *
 * A farm that is spraying normally with no strikes carries no trace of this.
 */
import { useState } from "react";
import useSWR from "swr";
import { AlertTriangle, Lock, Unlock, Info } from "lucide-react";

import { API_BASE, swrFetcher } from "@/lib/api";
import { canWrite } from "@/lib/roles";
import { useAuth } from "@/hooks/useAuth";

interface Lockout {
  locked_at: string;
  relay: number;
  reason: string;
  ran_minutes: number;
  temp_at_lock: number | null;
  lockout_low: number;
  lockout_high: number;
  previous: { low: number; high: number } | null;
  verified: boolean | null;
  strike: number;
  may_auto_release: boolean;
}

interface Response {
  farm: string;
  locked: boolean;
  lockout: Lockout | null;
  strikes: number;
}

export default function PumpLockoutBanner({ farm }: { farm: string }) {
  const { user } = useAuth();
  const { data, mutate } = useSWR<Response>(
    `/api/pump-lockout?farm=${farm}`, swrFetcher, { refreshInterval: 30_000 },
  );
  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mayRelease = canWrite(user?.role);

  const release = async () => {
    setError(null);
    setReleasing(true);
    try {
      const res = await fetch(`${API_BASE}/api/pump-lockout/release?farm=${farm}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        // Show the server's reason rather than a generic failure: "Node-RED
        // unreachable" and "no previous setpoint recorded" need different
        // actions from whoever is standing there.
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not release the lockout");
    } finally {
      setReleasing(false);
    }
  };

  if (!data) return null;

  // Released itself already, nothing locked now. The farm is one dry run away
  // from a lockout nobody can clear automatically, which is worth knowing
  // before you walk away from it.
  if (!data.locked) {
    if (!data.strikes) return null;
    return (
      <section className="rounded-xl border border-surface-border bg-surface-card p-3.5">
        <p className="flex items-start gap-2 text-[13px] text-slate-300 leading-relaxed">
          <Info size={15} className="shrink-0 mt-0.5 text-[color:var(--info-ink)]" />
          <span>
            The pump ran dry recently and the setpoint restored itself once, on the chance
            the tank had been refilled. <strong>If it runs dry again it will lock out with
            no delay and stay locked</strong> until somebody releases it here. Checking the
            tank now, and releasing nothing, is the cheapest outcome.
          </span>
        </p>
      </section>
    );
  }

  const l = data.lockout;
  if (!l) return null;

  return (
    <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <Lock size={18} className="shrink-0 mt-0.5 text-[color:var(--warn-ink)]" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[color:var(--warn-ink)]">
            Pump stopped automatically — tank was empty
            {l.strike > 1 && " (second time)"}
          </h2>
          <p className="text-[13px] text-slate-200 mt-1.5 leading-relaxed max-w-2xl">
            The pump ran <strong>{l.ran_minutes} minutes</strong> without the temperature
            falling, which means it was moving no water. Running dry damages a pump, so the
            spray setpoint was raised to{" "}
            <strong>{l.lockout_low}–{l.lockout_high} °C</strong> to keep it off.
            {l.previous && (
              <> It was {l.previous.low}–{l.previous.high} °C before.</>
            )}
          </p>

          {/* What happens next differs by strike, and getting this wrong in
              either direction matters: promising an automatic release that is
              not coming leaves the farm un-sprayed, and implying one that is
              coming leaves somebody unaware the pump may restart. */}
          {l.may_auto_release && l.previous ? (
            <p className="text-[13px] text-slate-300 mt-2 leading-relaxed max-w-2xl">
              <strong>Refill the tank.</strong> If the greenhouse cools below{" "}
              {l.previous.low} °C and stays there, the old setpoint will restore itself
              once — in case the tank was topped up without anyone opening this page.
              That is a guess, not a measurement: nothing here can see the water level.
              If the pump runs dry again afterwards it locks out immediately and only a
              person can clear it.
            </p>
          ) : (
            <p className="text-[13px] text-slate-300 mt-2 leading-relaxed max-w-2xl">
              <strong>This will not release itself.</strong>
              {l.strike > 1
                ? " It already restored itself once and the pump ran dry again, so the"
                  + " only way out is somebody confirming the tank."
                : " Refill the tank first — releasing this restores the old setpoint,"
                  + " and if the tank is still empty the pump will start running dry again."}
            </p>
          )}

          {/* The controller did not honour the lockout. This outranks everything
              else on the card, because the pump is still being damaged. */}
          {l.verified === false && (
            <p className="flex items-start gap-1.5 text-[13px] font-semibold text-[color:var(--danger-ink)] mt-2.5">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              The pump did not stop after the setpoint was changed. Stop it by hand.
            </p>
          )}

          <p className="text-[11px] text-slate-400 mt-2.5 font-mono-num">
            Locked at {new Date(l.locked_at).toLocaleString()}
            {l.temp_at_lock != null && ` · ${l.temp_at_lock.toFixed(1)} °C at the time`}
          </p>

          {error && (
            <p className="text-[13px] text-[color:var(--danger-ink)] mt-2">
              {error} — the lockout is still in force.
            </p>
          )}

          <div className="mt-3">
            {mayRelease ? (
              <button
                onClick={release}
                disabled={releasing}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-semibold
                           bg-surface-card ring-1 ring-surface-border text-slate-100
                           hover:ring-slate-500 disabled:opacity-60 transition-colors"
              >
                <Unlock size={14} />
                {releasing ? "Releasing…" : "Tank refilled — release the lockout"}
              </button>
            ) : (
              <p className="text-[12px] text-slate-400">
                Releasing this needs an owner or developer account.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
