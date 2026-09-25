"use client";
import { HMI, deviation, deviationColor } from "./tokens";
import Sparkline from "./Sparkline";

/**
 * A value against its target, read without reading the number.
 *
 * This is the single most useful HMI idea and the one the old screen lacked.
 * A digit tells you 31.4; it does not tell you whether that is fine. An
 * operator scanning a wall panel should be able to see "everything is sitting
 * on target" from across the room, and this is what makes that possible: the
 * centre tick is the setpoint, the marker is the reading, and a row of
 * markers all sitting centred is a system behaving itself.
 *
 * Deliberately no gradient, no rounded glossy fill, no animation. Motion is
 * the strongest attention cue there is and it is reserved for alarms.
 */
export default function DeviationBar({
  label, value, unit, target, warnBand, alarmBand, min, max, history, band,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
  target: number | null;
  warnBand: number;
  alarmBand: number;
  min: number;
  max: number;
  /** Recent readings, oldest first. Drawn as a sparkline under the bar. */
  history?: (number | null)[];
  band?: { low: number; high: number } | null;
}) {
  const d = deviation(value, target, warnBand, alarmBand);
  const color = deviationColor(d);
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const known = value != null && Number.isFinite(value);

  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11px] tracking-widest uppercase" style={{ color: HMI.inkMuted }}>
          {label}
        </span>
        <span className="font-mono-num tabular-nums" style={{ color: known ? HMI.ink : HMI.inkFaint }}>
          <span className="text-2xl font-semibold">{known ? value!.toFixed(1) : "––.–"}</span>
          <span className="text-xs ml-1" style={{ color: HMI.inkFaint }}>{unit}</span>
        </span>
      </div>

      <div className="relative h-6 rounded-sm" style={{ backgroundColor: HMI.panelAlt }}>
        {/* Target band — where the value is SUPPOSED to be. Drawn as a quiet
            lighter region rather than a green zone, so "in band" is the
            absence of a signal rather than a signal of its own. */}
        {target != null && (
          <div
            className="absolute inset-y-0"
            style={{
              left: `${pct(target - warnBand)}%`,
              width: `${pct(target + warnBand) - pct(target - warnBand)}%`,
              backgroundColor: HMI.panel,
            }}
          />
        )}
        {/* Setpoint */}
        {target != null && (
          <div className="absolute inset-y-0 w-px" style={{ left: `${pct(target)}%`, backgroundColor: HMI.line }} />
        )}
        {/* The reading */}
        {known && (
          <div
            className="absolute top-0 bottom-0 w-[3px]"
            style={{ left: `calc(${pct(value!)}% - 1.5px)`, backgroundColor: color }}
          />
        )}
        {!known && (
          <div className="absolute inset-0 grid place-items-center text-[10px] tracking-widest"
               style={{ color: HMI.inkFaint }}>
            NO DATA
          </div>
        )}
      </div>

      <div className="flex justify-between text-[10px] mt-1 font-mono-num" style={{ color: HMI.inkFaint }}>
        <span>{min}</span>
        <span>{target != null ? `SP ${target}` : "NO SETPOINT"}</span>
        <span>{max}</span>
      </div>

      {/* Where it has just been. A value beside its recent past is a
          situation; the same value alone is only a measurement. */}
      {history && history.length > 0 && (
        <div className="mt-1.5">
          <Sparkline points={history} min={min} max={max} band={band} />
        </div>
      )}
    </div>
  );
}
