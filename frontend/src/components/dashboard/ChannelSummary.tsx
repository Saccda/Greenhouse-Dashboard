"use client";
/**
 * Read-only channel states for the Dashboard.
 *
 * Deliberately NOT RelayPanel, which is what sat here before. RelayPanel
 * carries switches, and the Control page already carries those; a pump you
 * can start from two different screens is a pump someone starts twice. This
 * answers "what is running" and nothing else, and sends you to Control to
 * change it.
 *
 * Unknown is drawn as its own state rather than as off. When the feed is
 * stale the backend reports UNKNOWN precisely so that a dead sensor does not
 * read as a quiet farm, and collapsing that back into "off" here would undo
 * the one guarantee that makes the rest of the dashboard trustworthy.
 */
import { clsx } from "clsx";

import type { RelayStatus } from "@/types";

export default function ChannelSummary({
  relays, isLoading, isOffline,
}: {
  relays: RelayStatus[];
  isLoading: boolean;
  isOffline: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-px">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 bg-surface-hover rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (!relays.length) {
    return <p className="text-[13px] text-slate-400 py-3">No channels reported for this farm.</p>;
  }

  const running = relays.filter((r) => r.state === "ON");

  return (
    <div>
      <p className="text-[13px] text-slate-300 mb-3">
        {isOffline
          ? "Feed is stale, so nothing here is known to be current."
          : running.length === 0
            ? "Everything is idle."
            : `${running.length} running: ${running.map((r) => r.label).join(", ")}.`}
      </p>
      <ul className="space-y-px">
        {relays.map((r) => (
          <li
            key={r.key}
            className="flex items-center justify-between gap-3 px-3 py-2 rounded bg-surface-hover"
          >
            <span className="text-[13px] text-slate-300 min-w-0 truncate" title={r.description}>
              {r.label}
            </span>
            <span
              className={clsx(
                "shrink-0 text-[11px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded",
                r.state === "ON" && "bg-brand-green/15 text-brand-green",
                r.state === "OFF" && "text-slate-500",
                r.state === "UNKNOWN" && "text-[color:var(--warn-ink)] bg-amber-500/10",
              )}
            >
              {r.state === "UNKNOWN" ? "unknown" : r.state.toLowerCase()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
