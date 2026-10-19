"use client";
/**
 * Soil readings — current value and recent trend, one row per fitted probe.
 *
 * Knows no probe names. The farm registry says what is installed, with each
 * probe's field, label, unit and instrument range, and this draws whatever
 * comes back. So the day the team wires moisture and adds pH six months later,
 * the second one appears here by itself: a backend config edit, not a release.
 *
 * Renders nothing at all when no probes are fitted. A permanent "soil coming
 * soon" card is a promise taking up the space of a measurement, and this page
 * is the one people glance at to see whether the farm is all right.
 *
 * The two empty states that DO appear are kept apart on purpose:
 *
 *   fitted, nothing stored yet  → probably still being commissioned
 *   fitted, readings present    → show them
 *
 * because "configured but silent" is a job for somebody, while "not fitted"
 * is not. Collapsing them is how a dead probe hides behind a farm that never
 * had one — the same mistake the water meter reporting avoids.
 */
import { Sprout } from "lucide-react";

import Sparkline from "@/components/hmi2/Sparkline";
import type { LatestResponse, HistoryResponse, SoilProbe } from "@/types";

export default function SoilPanel({
  probes, latest, history, isOffline,
}: {
  probes: SoilProbe[];
  latest?: LatestResponse;
  history?: HistoryResponse;
  isOffline: boolean;
}) {
  if (!probes.length) return null;

  const depth = probes.find((p) => p.depth_cm != null)?.depth_cm;

  return (
    <section className="bg-surface-card border border-surface-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          <Sprout size={13} className="shrink-0" />
          Soil
        </h2>
        {depth != null && (
          <span className="text-[11px] text-slate-500">{depth} cm depth</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {probes.map((p) => {
          const reading = latest?.readings?.[p.field];
          const series = (history?.series?.[p.field] ?? []).map((pt) => pt.value ?? null);
          const seen = series.filter((v): v is number => v != null);
          // Chart against the instrument's range, not the readings' own range.
          // Scaling to what has been seen makes a steady probe look wildly
          // variable, which is the opposite of what a trend is for.
          const lo = p.min ?? (seen.length ? Math.min(...seen) : 0);
          const hi = p.max ?? (seen.length ? Math.max(...seen) : 1);

          const value = !isOffline ? reading?.value : undefined;
          const neverReported = reading == null && seen.length === 0;

          return (
            <div key={p.field} className="px-3.5 py-3 rounded-lg bg-surface-hover">
              <div className="text-[11px] text-slate-400 mb-1.5">{p.label}</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-mono-num tabular-nums font-semibold text-slate-100 leading-none">
                  {value != null ? value.toFixed(1) : "—"}
                </span>
                {value != null && <span className="text-[12px] text-slate-400">{p.unit}</span>}
              </div>

              {neverReported ? (
                <p className="text-[11px] text-[color:var(--warn-ink)] mt-2 leading-snug">
                  Probe is configured but has never reported. Check it is wired and that the
                  firmware sends its key.
                </p>
              ) : seen.length ? (
                <div className="mt-2.5">
                  <Sparkline points={series} min={lo} max={hi} />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono-num">
                    <span>{Math.min(...seen).toFixed(1)}</span>
                    <span>{seen.length} readings</span>
                    <span>{Math.max(...seen).toFixed(1)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 mt-2">
                  {isOffline ? "Feed is stale." : "No stored history for this range yet."}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
