"use client";
/**
 * Energy in full: what the rig drew, and what it got for it.
 *
 * EVERY WATT HERE IS VOLTS × AMPS
 *   The meter's power_w field reads exactly 0 against a live supply, and the
 *   team has confirmed the meter derives its own power the same way we do —
 *   by multiplying voltage and current. That product is APPARENT power, so
 *   every figure on this page is a ceiling: real consumption is lower by the
 *   power factor, and a pump is an inductive motor at roughly 0.6–0.9.
 *
 *   It is labelled W and Wh because those are the units people read, with the
 *   caveat kept next to the numbers rather than hidden in a unit nobody
 *   recognises. If the meter chip turns out to report power factor, this
 *   becomes exact.
 *
 * ENERGY PER SPRAY CYCLE
 *   The only figure on the page that connects electricity to what the farm is
 *   actually for. Total energy alone goes up on a hot week and nobody can say
 *   whether that is waste or work; divided by the cycles it bought, it starts
 *   being comparable week to week.
 *
 * NO DEVICE BREAKDOWN
 *   The mockup split consumption across pumps, fans, lighting and controls.
 *   There is one meter on this system and no way to attribute a watt to a
 *   device. That panel would have been invented from end to end.
 */
import { Zap, Activity, TrendingUp, Waves } from "lucide-react";

import KPICard from "@/components/ui/KPICard";
import ConsumptionChart, { type Bucket } from "@/components/dashboard/sections/ConsumptionChart";
import type { HistoryResponse } from "@/types";
import { at, extreme } from "@/lib/series";

import OverlayChart, { ChartLegendHints } from "./OverlayChart";
import { Empty, Panel, Stat } from "./Panel";
import type { DetailProps } from "./types";

const HOUR = 3600_000;

/** Volts × amps per sample, paired by timestamp. */
function apparentSamples(history?: HistoryResponse): { ts: number; va: number }[] {
  const volts = new Map<number, number>();
  for (const p of history?.series?.voltage ?? []) {
    if (p.value != null) volts.set(new Date(p.time).getTime(), p.value);
  }
  const out: { ts: number; va: number }[] = [];
  for (const p of history?.series?.current ?? []) {
    const ts = new Date(p.time).getTime();
    const v = volts.get(ts);
    if (v != null && p.value != null) out.push({ ts, va: v * p.value });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/**
 * Trapezoid integration into hourly buckets.
 *
 * Trapezoid rather than sample × interval so an uneven publish rate does not
 * weight some readings more than others, and gaps over an hour are skipped —
 * a blackout is not an hour of steady draw, and counting it would invent
 * consumption nobody used.
 */
function integrate(samples: { ts: number; va: number }[]): { byHour: Map<number, number>; total: number } {
  const byHour = new Map<number, number>();
  let total = 0;
  for (let i = 1; i < samples.length; i++) {
    const dtHours = (samples[i].ts - samples[i - 1].ts) / HOUR;
    if (dtHours <= 0 || dtHours > 1) continue;
    const wh = ((samples[i].va + samples[i - 1].va) / 2) * dtHours;
    const bucket = Math.floor(samples[i].ts / HOUR) * HOUR;
    byHour.set(bucket, (byHour.get(bucket) ?? 0) + wh);
    total += wh;
  }
  return { byHour, total };
}

const fmtEnergy = (wh: number) =>
  wh >= 1000 ? `${(wh / 1000).toFixed(2)} kWh` : `${wh.toFixed(0)} Wh`;

export default function EnergyDetail({
  farm, latest, history, previous, sprayStats, isOffline, isLoading, rangeWord,
}: DetailProps) {
  if (!(farm?.energy ?? []).length) {
    return <Empty>This farm has no energy meter fitted.</Empty>;
  }

  const samples = apparentSamples(history);
  const { byHour, total } = integrate(samples);
  const prev = integrate(apparentSamples(previous)).total;

  const currentHour = Math.floor(Date.now() / HOUR) * HOUR;
  const buckets: Bucket[] = [...byHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, wh]) => ({ ts, value: wh, partial: ts === currentHour }));

  const vaValues = samples.map((s) => s.va);
  const peak = vaValues.length ? Math.max(...vaValues) : null;
  const peakAt = peak != null ? samples.find((s) => s.va === peak) : null;
  const standing = vaValues.length ? Math.min(...vaValues) : null;

  const volts = !isOffline ? latest?.readings?.voltage?.value : undefined;
  const amps = !isOffline ? latest?.readings?.current?.value : undefined;
  const drawingNow = volts != null && amps != null ? volts * amps : undefined;

  const cycles = sprayStats?.stats?.total_sprays ?? 0;
  const perCycle = cycles > 0 && total > 0 ? total / cycles : null;

  const changePct = prev > 0 ? ((total - prev) / prev) * 100 : null;

  const voltLo = extreme(history?.series?.voltage ?? [], "min");
  const voltHi = extreme(history?.series?.voltage ?? [], "max");

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          title="Energy used" icon={Zap}
          value={total > 0 ? fmtEnergy(total).split(" ")[0] : "—"}
          unit={total > 0 ? fmtEnergy(total).split(" ")[1] : undefined}
          isLoading={isLoading && !history}
          subtitle={
            changePct != null
              ? `${changePct >= 0 ? "↑" : "↓"} ${Math.abs(changePct).toFixed(1)}% vs the previous ${rangeWord}`
              : `This ${rangeWord} · volts × amps`
          }
        />
        <KPICard
          title="Drawing now" icon={Activity}
          value={drawingNow != null ? drawingNow.toFixed(1) : "—"}
          rawValue={drawingNow} decimals={1}
          unit={drawingNow != null ? "W" : undefined}
          isLoading={isLoading && !latest} isStale={isOffline}
          subtitle={
            isOffline ? "No signal from meter"
              : volts != null && amps != null ? `${volts.toFixed(0)} V × ${amps.toFixed(2)} A`
                : "Waiting for a reading"
          }
        />
        <KPICard
          title="Peak draw" icon={TrendingUp}
          value={peak != null ? peak.toFixed(1) : "—"}
          rawValue={peak ?? undefined} decimals={1}
          unit={peak != null ? "W" : undefined}
          isLoading={isLoading && !history}
          subtitle={
            peakAt ? `at ${at(new Date(peakAt.ts).toISOString())}${
              standing != null ? ` · ${(peak! - standing).toFixed(0)} W above standing` : ""
            }` : `This ${rangeWord}`
          }
        />
        <KPICard
          title="Per spray cycle" icon={Waves}
          value={perCycle != null ? perCycle.toFixed(1) : "—"}
          rawValue={perCycle ?? undefined} decimals={1}
          unit={perCycle != null ? "Wh" : undefined}
          isLoading={isLoading && !sprayStats}
          subtitle={
            cycles > 0 ? `Across ${cycles} cycle${cycles === 1 ? "" : "s"}`
              : "The pump did not run"
          }
        />
      </section>

      {/* Full width. This was two thirds of a row whose other third held two
          stacked panels, so the row stretched to THEIR combined height while
          the bar chart kept its fixed 260px — leaving a band of empty card
          under the bars that looked like a rendering fault. Nothing is
          side-by-side with it now, so nothing stretches it. */}
      <Panel
        title="Consumption by hour"
        aside={
          <span className="text-[11px] text-slate-500">
            {fmtEnergy(total)} total · volts × amps, no power factor
          </span>
        }
      >
        <ConsumptionChart
          buckets={buckets}
          unit="Wh"
          color="#eab308"
          height={280}
          xLabel="Hour"
          yLabel="Energy used (Wh)"
          labelFormat={(ts) =>
            new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          }
          empty="No voltage and current readings stored for this range."
        />
        <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
          An upper bound. Real consumption is lower by the power factor —
          somewhere between 60% and 100% of what these bars show for a
          motor-dominated load, and never above it.
        </p>
      </Panel>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Voltage and current on one pair of axes, for the same reason
            temperature and humidity share one: the product of these two IS
            every watt on this page, so reading them apart — and at two
            different sizes, which is how they were — hides the only thing
            they jointly say. A dip in volts with a rise in amps is a motor
            straining; both falling together is the supply going. Neither
            chart could show that alone. */}
        <Panel
          className="lg:col-span-2"
          title="Voltage and current"
          aside={<ChartLegendHints spray />}
        >
          <OverlayChart
            series={history?.series}
            sprayEvents={sprayStats?.stats?.spray_events ?? []}
            height={300}
            leftUnit="V"
            rightUnit="A"
            specs={[
              {
                field: "voltage", label: "Voltage", unit: "V",
                color: "#60a5fa", axis: "left",
              },
              {
                field: "current", label: "Current", unit: "A",
                color: "#f59e0b", axis: "right", dashed: true,
              },
            ]}
          />
          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            Blue bands are spray cycles. Current that does not rise inside a
            band means the relay closed but the pump did not draw — an open
            circuit or a seized motor, from here. On the voltage line it is the
            excursions that matter rather than the shape: a supply dipping
            under 200 V makes a motor draw harder to do the same work.
          </p>
        </Panel>

        {/* One grid for all three, so they share a gap. They were a two-column
            grid with a third stat appended after it, and a flex column with no
            gap set put that third one flush against the other two — three
            boxes touching, which reads as one broken box. */}
        <Panel title="Supply">
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Lowest volts"
              value={voltLo ? `${voltLo.value.toFixed(0)} V` : "—"}
              sub={voltLo ? `at ${at(voltLo.time)}` : undefined}
              // Nominal here is 230 V; below 200 V motors stall and draw
              // hard, which is a failure the pump feels before anyone sees.
              tone={voltLo && voltLo.value < 200 ? "warn" : undefined}
            />
            <Stat
              label="Highest volts"
              value={voltHi ? `${voltHi.value.toFixed(0)} V` : "—"}
              sub={voltHi ? `at ${at(voltHi.time)}` : undefined}
              tone={voltHi && voltHi.value > 250 ? "warn" : undefined}
            />
            <div className="col-span-2">
              <Stat
                label="Standing draw"
                value={standing != null ? `${standing.toFixed(1)} W` : "—"}
                sub="with nothing running"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            Standing draw is the lowest reading in the period, so it includes
            anything that never switched off — it is what the rig idles at, not
            what the controller alone costs.
          </p>
        </Panel>
      </section>
    </div>
  );
}
