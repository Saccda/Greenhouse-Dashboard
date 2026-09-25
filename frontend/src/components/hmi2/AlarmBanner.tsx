"use client";
import { HMI } from "./tokens";

export interface Alarm {
  id:       string;
  priority: "alarm" | "warn";
  text:     string;
}

/**
 * Always present, even when there is nothing to say.
 *
 * A banner that appears only during an alarm trains people to read a blank
 * strip as "fine", when a blank strip is equally what a crashed page looks
 * like. Saying NO ACTIVE ALARMS out loud is the difference between the system
 * telling you it is fine and the system telling you nothing.
 *
 * This is also the only place on the screen allowed to move.
 */
export default function AlarmBanner({ alarms }: { alarms: Alarm[] }) {
  const worst = alarms.some((a) => a.priority === "alarm") ? "alarm"
              : alarms.length ? "warn" : "none";
  const bg = worst === "alarm" ? HMI.alarm : worst === "warn" ? HMI.warn : HMI.panel;
  const fg = worst === "none" ? HMI.inkFaint : "#1a1d20";

  return (
    <div
      className="flex items-center gap-4 px-4 h-10 shrink-0 overflow-hidden"
      style={{ backgroundColor: bg, color: fg }}
      role="status"
      aria-live="polite"
    >
      <span className="text-[11px] font-bold tracking-widest shrink-0">
        {worst === "none" ? "NO ACTIVE ALARMS" : `${alarms.length} ACTIVE`}
      </span>
      {alarms.length > 0 && (
        <div className="flex gap-6 text-[12px] font-medium truncate">
          {alarms.map((a) => (
            <span key={a.id} className="truncate">{a.text}</span>
          ))}
        </div>
      )}
      {/* The one moving element on the screen, and only when it means something. */}
      {worst === "alarm" && (
        <span className="ml-auto shrink-0 w-2.5 h-2.5 rounded-full animate-pulse"
              style={{ backgroundColor: "#1a1d20" }} />
      )}
    </div>
  );
}
