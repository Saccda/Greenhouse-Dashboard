"use client";
/**
 * CampusSetpointPanel — the campus system's auto threshold-setpoint control.
 * Distinct from SetpointPanel (Kampot/Kep, one relay at a time, proxied
 * through Node-RED): campus's controller expects all three channels' low/high
 * values in one combined MQTT publish every time (see routes/campus.py), so
 * this panel shows all three at once instead of switching between them.
 *
 * Each value is typed and sent by its own Set button, one click like the relay
 * ON/OFF buttons. The publish still has to carry all six, so the five values
 * not being set are filled from what the controller is known to be running and
 * never from another box: a number typed but not Set must stay unsent.
 */
import { useState, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { clsx } from "clsx";
import { format } from "date-fns";

import { swrFetcher, API_BASE } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

type StoredZones = Record<string, { low: number; high: number; updated_at: string }>;

const ZONES = [
  { index: 1, label: "CH1 · System enable", param: "temp", lowKey: "temp_low1", highKey: "temp_high1", unit: "°C", min: 0, max: 50, step: 0.5 },
  { index: 2, label: "CH2 · Spraying", param: "temp", lowKey: "temp_low2", highKey: "temp_high2", unit: "°C", min: 0, max: 50, step: 0.5 },
  { index: 3, label: "CH3 · Humidity control", param: "hum",  lowKey: "hum_low3",  highKey: "hum_high3",  unit: "%",  min: 0, max: 100, step: 1 },
] as const;

const DEFAULTS: Record<string, number> = {
  temp_low1: 23.0, temp_high1: 24.5,
  temp_low2: 25.0, temp_high2: 26.0,
  hum_low3:  40.0, hum_high3:  60.0,
};

type Values = Record<string, number>;

/** What the controller reports about itself, via the MQTT bridge. */
interface ReportedState {
  relay_setpoints?: { values: Record<string, number>; reported_at: string };
  water_setpoint?:  { values: { Set_water_temp?: number }; reported_at: string };
}
type SpStatus = "sending" | "sent" | "error" | "unauthorized";

interface Props {
  canWrite:  boolean;
  className?: string;
}

/**
 * The six values the hardware should be running, zone by zone: whichever of
 * the controller's report and this dashboard's last send is newer. The report
 * alone would undo a Set made moments ago if a second one followed before the
 * controller had answered; the last send alone would overwrite a change made
 * at the controller itself.
 */
function knownValues(stored: StoredZones | undefined, reported: ReportedState | undefined) {
  const values: Values = { ...DEFAULTS };
  let anyUnknown = false;
  const device = reported?.relay_setpoints;

  for (const zone of ZONES) {
    const sent = stored?.[String(zone.index)];
    const low = device?.values[zone.lowKey];
    const high = device?.values[zone.highKey];
    const deviceIsNewer = device && low != null && high != null
      && (!sent || Date.parse(device.reported_at) > Date.parse(sent.updated_at));

    if (deviceIsNewer) {
      values[zone.lowKey] = low;
      values[zone.highKey] = high;
    } else if (sent) {
      values[zone.lowKey] = sent.low;
      values[zone.highKey] = sent.high;
    } else {
      anyUnknown = true;
    }
  }
  return { values, anyUnknown };
}

export default function CampusSetpointPanel({ canWrite, className }: Props) {
  const { user, logout } = useAuth();

  // Only what has been typed and not yet Set. Everything else displays the
  // known value, so a poll updates the untouched boxes and cannot move a number
  // out from under someone typing.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ key: string; state: SpStatus } | null>(null);
  const [lastSent, setLastSent] = useState<string | null>(null);
  // When the last Set went out, until the controller has answered or 30 s pass.
  const [awaitingSince, setAwaitingSince] = useState<number | null>(null);

  const { data: stored, mutate: mutateStored } = useSWR<StoredZones>(
    `/api/campus/setpoint`, swrFetcher, { refreshInterval: 15_000 },
  );

  // What the CONTROLLER says it is running, which is not the same claim as
  // what this dashboard last sent. The two silently disagreed for three weeks
  // while every send reported success, because the publishes were going to a
  // topic the device was not subscribed to. Showing both is what makes that
  // visible instead of invisible.
  const { data: reported, error: reportedError } = useSWR<ReportedState>(
    `/api/campus/reported`, swrFetcher, { refreshInterval: awaitingSince ? 2_000 : 15_000 },
  );
  const deviceValues = reported?.relay_setpoints?.values;
  const waterSetpoint = reported?.water_setpoint?.values?.Set_water_temp;
  // Compared against what is STORED as last-sent, not against the form, so a
  // half-typed edit does not read as a disagreement with the hardware.
  const disagrees = deviceValues
    ? ZONES.some((z) => {
        const sent = stored?.[String(z.index)];
        if (!sent) return false;
        return deviceValues[z.lowKey] !== sent.low || deviceValues[z.highKey] !== sent.high;
      })
    : false;

  // A controller that has not answered yet is not yet a disagreement. The
  // warning returns after 30 s, because by then it may well be a real one.
  const awaiting = awaitingSince !== null && disagrees;
  useEffect(() => {
    if (awaitingSince === null) return;
    if (!disagrees) { setAwaitingSince(null); return; }
    const timer = setTimeout(() => setAwaitingSince(null), 30_000);
    return () => clearTimeout(timer);
  }, [awaitingSince, disagrees]);

  const { values: known, anyUnknown } = knownValues(stored, reported);
  // Until both answers are in, the values filling the rest of a send are guesses.
  const ready = stored !== undefined && (reported !== undefined || reportedError !== undefined);

  const flashStatus = (key: string, state: SpStatus, ms: number) => {
    setStatus({ key, state });
    setTimeout(() => setStatus((s) => (s?.key === key && s.state === state ? null : s)), ms);
  };

  const handleSet = async (key: string, value: number, label: string, unit: string) => {
    const body: Values = { ...known, [key]: value };
    setStatus({ key, state: "sending" });
    try {
      const res = await fetch(`${API_BASE}/api/campus/setpoint`, {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify(body),
      });
      if (res.status === 401) {
        logout();
        flashStatus(key, "unauthorized", 4000);
        return;
      }
      if (!res.ok) throw new Error(await res.text());

      // Written into the cache rather than waiting on a poll, so a second Set
      // straight after this one builds on this value instead of reverting it.
      const updated_at = new Date().toISOString();
      await mutateStored(
        Object.fromEntries(ZONES.map((z) => [
          String(z.index), { low: body[z.lowKey], high: body[z.highKey], updated_at },
        ])),
      );
      setDrafts(({ [key]: _sent, ...rest }) => rest);
      setAwaitingSince(Date.now());
      setLastSent(`Sent ${label} ${value}${unit} at ${format(new Date(), "HH:mm:ss")}`);
      flashStatus(key, "sent", 3000);
    } catch {
      flashStatus(key, "error", 4000);
    }
  };

  const sending = status?.state === "sending";

  return (
    <div className={clsx("border border-surface-border bg-surface-card rounded-xl p-4 flex flex-col gap-4", className)}>
      <div className="flex items-center gap-2">
        <div className="w-1 h-4 bg-brand-green rounded-full" />
        <p className="text-xs font-semibold tracking-wider uppercase text-slate-300">
          Auto Setpoints
        </p>
      </div>

      {/* What the hardware says it is running. Shown whether or not it agrees,
          because "the controller confirms these values" is worth as much as
          the warning is — it is the only evidence on this screen that a send
          actually landed. */}
      {deviceValues ? (
        <div
          className={clsx(
            "rounded-lg px-3 py-2.5 text-[12px] leading-relaxed",
            disagrees && !awaiting
              ? "bg-amber-500/10 border border-amber-500/30 text-slate-200"
              : "bg-surface-hover text-slate-400",
          )}
        >
          {awaiting ? (
            <>Sent. Waiting for the controller to confirm…</>
          ) : disagrees ? (
            <>
              <strong className="text-[color:var(--warn-ink)]">
                The controller is running different values than this dashboard last sent.
              </strong>{" "}
              It reports{" "}
              <span className="font-mono-num text-slate-200">
                {ZONES.map((z) => `${deviceValues[z.lowKey]}–${deviceValues[z.highKey]}`).join(" · ")}
              </span>
              . A send that reports success still goes nowhere if the topic is wrong, so trust
              this line over the boxes below.
            </>
          ) : (
            <>
              Controller confirms{" "}
              <span className="font-mono-num text-slate-300">
                {ZONES.map((z) => `${deviceValues[z.lowKey]}–${deviceValues[z.highKey]}`).join(" · ")}
              </span>
              {waterSetpoint != null && (
                <> · CH4 water target <span className="font-mono-num text-slate-300">{waterSetpoint} °C</span></>
              )}
            </>
          )}
        </div>
      ) : (
        // Never seen a status message. Not the same as "no setpoints", and
        // saying so beats drawing a comparison that cannot be made.
        <p className="text-[12px] text-slate-500">
          The controller has not reported its own setpoints yet, so the values below are what
          this dashboard last sent rather than what the hardware confirms.
        </p>
      )}

      {ZONES.map((zone) => (
        <div key={zone.index} className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            {zone.label} — {zone.param === "temp" ? "Temperature" : "Humidity"}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              { key: zone.lowKey,  name: "Low",  other: zone.highKey },
              { key: zone.highKey, name: "High", other: zone.lowKey },
            ]).map(({ key, name, other }) => {
              const text = drafts[key] ?? String(known[key]);
              const value = Number(text);
              const isLow = name === "Low";
              // Checked against the other end's KNOWN value, not its box: that
              // is what would actually go out beside this one.
              const problem =
                text.trim() === "" || !Number.isFinite(value) ? "Enter a number"
                : value < zone.min || value > zone.max ? `Must be ${zone.min}–${zone.max}${zone.unit}`
                : isLow && value >= known[other] ? `Must be below High (${known[other]}${zone.unit})`
                : !isLow && value <= known[other] ? `Must be above Low (${known[other]}${zone.unit})`
                : null;
              const edited = drafts[key] !== undefined && value !== known[key];
              const fieldStatus = status?.key === key ? status.state : null;
              const label = `CH${zone.index} ${name}`;
              const canSet = canWrite && ready && !sending && !problem;
              const set = () => { if (canSet) handleSet(key, value, label, zone.unit); };

              return (
                <div key={key}>
                  <label
                    htmlFor={`setpoint-${key}`}
                    className="block mb-1 text-[10px] uppercase tracking-widest text-slate-500"
                  >
                    {name}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 min-w-0">
                      <input
                        id={`setpoint-${key}`}
                        type="number" inputMode="decimal"
                        min={zone.min} max={zone.max} step={zone.step}
                        value={text}
                        readOnly={!canWrite}
                        onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") set(); }}
                        className={clsx(
                          "w-full bg-surface-hover border rounded-lg pl-3 pr-8 py-2 text-sm font-mono-num text-slate-200 focus:outline-none transition-colors",
                          problem ? "border-amber-500/60"
                            : edited ? "border-brand-green/60"
                            : "border-surface-border focus:border-brand-green/40",
                        )}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
                        {zone.unit}
                      </span>
                    </div>
                    {canWrite && (
                      <button
                        onClick={set}
                        disabled={!canSet}
                        className={clsx(
                          "shrink-0 min-w-[4.25rem] px-3 py-2 rounded-lg text-xs font-semibold transition-all active:scale-[0.98] border",
                          fieldStatus === "sent"
                            ? "bg-green-500/15 text-[color:var(--ok-ink)] border-green-500/30"
                            : fieldStatus === "error" || fieldStatus === "unauthorized"
                            ? "bg-red-500/15 text-[color:var(--danger-ink)] border-red-500/30"
                            : !canSet
                            ? "bg-surface-hover border-surface-border text-slate-400 cursor-not-allowed"
                            : edited
                            ? "bg-brand-green text-black hover:bg-brand-green/90 border-transparent"
                            : "text-slate-400 border-surface-border hover:border-brand-green/40 hover:text-slate-200",
                        )}
                      >
                        {fieldStatus === "sent"    ? "✓ Sent"
                        : fieldStatus === "error"  ? "Retry"
                        : fieldStatus === "sending" ? "…"
                        :                            "Set"}
                      </button>
                    )}
                  </div>
                  {problem && (
                    <p className="mt-1 text-[11px] font-mono text-[color:var(--warn-ink)]">⚠ {problem}</p>
                  )}
                  {fieldStatus === "error" && (
                    <p className="mt-1 text-[11px] font-mono text-[color:var(--danger-ink)]">Send failed. Try again.</p>
                  )}
                  {fieldStatus === "unauthorized" && (
                    <p className="mt-1 text-[11px] font-mono text-[color:var(--danger-ink)]">Session expired. Log in again.</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {canWrite && ready && anyUnknown && (
        <p className="text-[12px] text-[color:var(--warn-ink)]">
          Some channels have never been sent or reported, so pressing Set also sends the default values shown for them.
        </p>
      )}

      {canWrite ? null : user ? (
        <p className="w-full py-3 rounded-xl text-xs font-mono-num font-bold tracking-[0.15em] uppercase text-center text-[color:var(--warn-ink)] bg-amber-500/10 border border-amber-500/30">
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
