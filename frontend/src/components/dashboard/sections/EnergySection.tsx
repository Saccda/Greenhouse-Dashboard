"use client";
/**
 * Energy consumption — how much the rig drew, hour by hour.
 *
 * CONSUMPTION, NOT DRAW
 *   The tile beside this shows what the rig is pulling right now. This shows
 *   what it USED, which is a different quantity: watts are a rate, and the bar
 *   is that rate integrated across the hour. Two cards showing the same number
 *   twice would be the duplication this layout exists to remove.
 *
 * THE WATTS HERE ARE VOLTS × AMPS, AND THAT IS AN UPPER BOUND
 *   The meter's power_w field has read exactly 0 since the feed appeared,
 *   against a live 222 V and 0.07 A, so this figure is computed from voltage
 *   times current instead. The team has since confirmed the meter derives its
 *   own power the same way — so there is no real-power measurement anywhere
 *   in this system, and nothing to wait for. An earlier version of this file
 *   said fixing power_w would make this exact; it would not.
 *
 *   Volts times amps is APPARENT power. Real power is lower by the power
 *   factor, and a pump is an inductive motor — typically 0.6 to 0.9. So the
 *   bars are a ceiling: real consumption sits somewhere between 60% and 100%
 *   of what they show, and never above.
 *
 *   It is labelled Wh regardless, because VAh is a unit most people reading
 *   this page will not recognise, and a correct number nobody can read is not
 *   more honest than a familiar one carrying its caveat. The caveat rides in
 *   the subtitle, where anyone costing electricity from this page meets it
 *   before they meet the number.
 *
 *   If the meter chip reports power factor as its own field — a PZEM-004T
 *   does — publishing it turns this into real watts with no assumption left
 *   in it. That question is open with the team.
 */
import { Zap } from "lucide-react";

import SectionCard from "./SectionCard";
import ConsumptionChart, { type Bucket } from "./ConsumptionChart";
import type { Farm, HistoryResponse } from "@/types";

const HOUR = 3600_000;

export default function EnergySection({
  farm, history,
}: {
  farm?: Farm;
  history?: HistoryResponse;
}) {
  if (!(farm?.energy ?? []).length) return null;

  const volts = new Map<number, number>();
  for (const p of history?.series?.voltage ?? []) {
    if (p.value != null) volts.set(new Date(p.time).getTime(), p.value);
  }

  // Apparent power per sample, then integrated into hourly buckets by the
  // trapezoid between consecutive samples — so an uneven sampling interval
  // does not weight some readings more than others.
  const samples: { ts: number; va: number }[] = [];
  for (const p of history?.series?.current ?? []) {
    const ts = new Date(p.time).getTime();
    const v = volts.get(ts);
    if (v != null && p.value != null) samples.push({ ts, va: v * p.value });
  }
  samples.sort((a, b) => a.ts - b.ts);

  const byHour = new Map<number, number>();
  for (let i = 1; i < samples.length; i++) {
    const dtHours = (samples[i].ts - samples[i - 1].ts) / HOUR;
    // A gap longer than an hour is a blackout, not an hour of steady draw.
    // Counting it would invent consumption nobody used.
    if (dtHours <= 0 || dtHours > 1) continue;
    const vah = ((samples[i].va + samples[i - 1].va) / 2) * dtHours;
    const bucket = Math.floor(samples[i].ts / HOUR) * HOUR;
    byHour.set(bucket, (byHour.get(bucket) ?? 0) + vah);
  }

  const currentHour = Math.floor(Date.now() / HOUR) * HOUR;
  const buckets: Bucket[] = [...byHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, vah]) => ({ ts, value: vah, partial: ts === currentHour }));

  const total = buckets.reduce((s, b) => s + (b.value ?? 0), 0);

  return (
    <SectionCard
      icon={Zap}
      iconClass="bg-amber-500/15 text-amber-400"
      title="Energy consumption"
      subtitle={
        buckets.length
          ? `${total >= 1000 ? `${(total / 1000).toFixed(2)} kWh` : `${total.toFixed(0)} Wh`} over ${buckets.length} hour${buckets.length === 1 ? "" : "s"} · volts × amps, no power factor`
          : "Waiting for voltage and current readings"
      }
      href="/dashboard/energy"
    >
      <ConsumptionChart
        buckets={buckets}
        unit="Wh"
        color="#eab308"
        xLabel="Hour"
        yLabel="Energy used (Wh)"
        labelFormat={(ts) =>
          new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        }
        empty="No voltage and current readings stored for this range."
      />
    </SectionCard>
  );
}

