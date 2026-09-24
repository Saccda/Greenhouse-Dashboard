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
 * Which is why the headline figure here is in LITRES even though the meter
 * counts cubic metres. The estimate is in litres, and two numbers a thousand
 * times apart cannot be compared at a glance — the comparison is the whole
 * reason the card sits where it does. The meter's own reading is shown
 * unconverted beside it, because that is the number on the physical dial and
 * the one to check the installation against.
 *
 * Renders nothing at all when the farm has no meter. Only PP Campus has one —
 * it is a development-stage installation on our own test system, not something
 * deployed to the working farms. A card reading "no data" on Kampot forever
 * would be worse than no card, because it implies a fault where there is only
 * an absence.
 */
export default function WaterMeterCard({ farm }: { farm: string }) {
  const { data } = useSWR<WaterResponse>(
    `/api/sensors/water?farm=${farm}`, swrFetcher, { refreshInterval: 300_000 },
  );

  // has_meter is checked as well as the readings, so "no meter here" and "the
  // meter has not reported" stay distinguishable. They render the same today,
  // but the second is a fault someone should chase and deserves a message once
  // there is somewhere sensible to put one.
  if (!data || !data.has_meter || data.readings.length === 0) return null;
  const unitLabel = data.unit_label ?? "";
  const perUnit = data.liters_per_unit ?? 1000;

  const days = data.readings;
  const latest = days[0];
  const usable = days.filter((d) => d.consumption_liters != null);
  const totalLiters = usable.reduce((sum, d) => sum + (d.consumption_liters ?? 0), 0);
  const resets = days.filter((d) => d.meter_reset).length;

  // Litres below a thousand, cubic metres above — the same choice anyone makes
  // saying "eight hundred litres" but "twelve cubic metres".
  const volume = (liters: number) =>
    liters >= 1000
      ? `${Number((liters / perUnit).toFixed(2))} ${unitLabel}`
      : `${Number(liters.toFixed(0))} L`;

  return (
    <section className="bg-surface-card border border-surface-border rounded-xl p-4">
      <h2 className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
        <Droplets size={13} className="text-slate-400" />
        Water Meter — measured
        {!data.unit_confirmed && (
          <span
            title={`Readings are stored exactly as the meter reports them, but the unit has not been confirmed against the hardware. Treat the label — not the numbers — as provisional.`}
            className="inline-flex items-center gap-1 normal-case tracking-normal font-medium text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-[color:var(--warn-ink)]"
          >
            <HelpCircle size={10} /> unit unconfirmed
          </span>
        )}
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Latest day" value={
          latest.consumption_liters != null ? volume(latest.consumption_liters) : "—"
        } />
        <Tile label={`Total, ${usable.length} day${usable.length === 1 ? "" : "s"}`}
              value={volume(totalLiters)} />
        {/* Unconverted: this is what the dial on the meter reads, so it is the
            number to check the installation against. */}
        <Tile label="Meter reading" value={
          latest.last_totalizer != null
            ? `${latest.last_totalizer} ${unitLabel}`
            : "—"
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
