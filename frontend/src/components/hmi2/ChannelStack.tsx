"use client";
import { HMI } from "./tokens";
import type { RelayStatus } from "@/types";

/**
 * Channel states, as a column of identical rows.
 *
 * Identical is the point. A scanning eye finds a broken pattern far faster
 * than it reads eight labels, so every row is the same shape and only the
 * fill changes. ON is a pale block, OFF is an empty outline, UNKNOWN is
 * hatched — three states that differ in FORM, not only in colour, so the
 * screen still works for a colour-blind operator and in direct sunlight.
 *
 * UNKNOWN is drawn as loudly as OFF rather than quietly, because "the feed
 * died" and "the pump is off" must never look alike on a control screen.
 */
export default function ChannelStack({
  relays, labels, stale,
}: {
  relays: RelayStatus[];
  labels: Record<string, string>;
  stale: boolean;
}) {
  return (
    <div className="space-y-px">
      {relays.map((r) => {
        const state = stale ? "UNKNOWN" : r.state;
        const on = state === "ON";
        const unknown = state !== "ON" && state !== "OFF";
        return (
          <div key={r.key} className="flex items-center gap-3 px-3 py-2"
               style={{ backgroundColor: HMI.panel }}>
            <span
              className="w-7 h-7 shrink-0 border"
              style={{
                borderColor: unknown ? HMI.warn : HMI.line,
                backgroundColor: on ? HMI.on : "transparent",
                backgroundImage: unknown
                  ? `repeating-linear-gradient(45deg, ${HMI.warn}, ${HMI.warn} 2px, transparent 2px, transparent 6px)`
                  : undefined,
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-mono-num tracking-wider" style={{ color: HMI.inkMuted }}>
                {r.key}
              </div>
              <div className="text-[12px] truncate" style={{ color: HMI.ink }}>
                {labels[r.key] ?? r.key}
              </div>
            </div>
            <span className="text-[11px] font-bold tracking-wider shrink-0"
                  style={{ color: unknown ? HMI.warn : on ? HMI.ink : HMI.inkFaint }}>
              {state}
            </span>
          </div>
        );
      })}
    </div>
  );
}
