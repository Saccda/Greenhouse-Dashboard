"use client";
import useSWR from "swr";
import { Droplets, AlertTriangle, HelpCircle } from "lucide-react";

import { swrFetcher } from "@/lib/api";
import type { WaterResponse } from "@/types";

/**
 * Measured water use, from the flow meter's own daily totals.
 *
 * Distinct from the "Est. Water Use" tile above it, which multiplies spray
 * runtime by a nozzle flow rate. Showing both is the point: the estimate
 * assumes every nozzle flows at its rated figure, so a persistent gap between
 * the two is how a blocked nozzle or a leak announces itself. One number would
 * hide that.
 *
 * Renders nothing at all when the farm has no meter. A farm without one is a
 * normal state, and an empty card that says "no data" for Kampot forever is
 * worse than no card.
 */
export default function WaterMeterCard({ farm }: { farm: string }) {
  const { data } = useSWR<WaterResponse>(
    `/api/sensors/water?farm=${farm}`, swrFetcher, { refreshInterval: 300_000 },
  );

  if (!data || data.readings.length === 0) return null;

  const days = data.readings;
  const latest = days[0];
  const usable = days.filter((d) => d.consumption != null);
  const total = usable.reduce((sum, d) => sum + (d.consumption ?? 0), 0);
  const resets = days.filter((d) => d.meter_reset).length;

  return (
    <section className="bg-surface-card border border-surface-border rounded-xl p-4">
      <h2 className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
        <Droplets size={13} className="text-slate-400" />
        Water Meter — measured
        {!data.unit_confirmed && (
          <span
            title={`Readings are stored exactly as the meter reports them. The unit is labelled ${data.unit} but has not been confirmed against the hardware, so treat the label — not the numbers — as provisional.`}
            className="inline-flex items-center gap-1 normal-case tracking-normal font-medium text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-[color:var(--warn-ink)]"
          >
            <HelpCircle size={10} /> unit unconfirmed
          </span>
        )}
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Latest day" value={
          latest.consumption != null ? `${latest.consumption} ${data.unit}` : "—"
        } />
        <Tile label={`Total, ${usable.length} day${usable.length === 1 ? "" : "s"}`}
              value={`${Number(total.toFixed(1))} ${data.unit}`} />
        <Tile label="Meter reading" value={
          latest.last_totalizer != null ? String(latest.last_totalizer) : "—"
        } />
        <Tile label="Last report" value={
          new Date(latest.timestamp).toLocaleDateString(undefined,
            { day: "numeric", month: "short" })
        } />
      </div>

      {resets > 0 && (
        <p className="flex items-start gap-1.5 text-[11px] text-[color:var(--warn-ink)] mt-3 leading-relaxed">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          {resets} day{resets === 1 ? "" : "s"} excluded: the totalizer read lower than it
          started, which means it reset or was replaced. Those days measure the reset rather
          than water used.
        </p>
      )}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-hover rounded-lg px-4 py-3 text-center border border-surface-border">
      <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-lg font-bold font-mono-num text-slate-100">{value}</p>
    </div>
  );
}
