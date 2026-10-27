"use client";
/**
 * Ambient in full: air temperature and humidity, and what they did together.
 *
 * THE ONE CHART, AND WHY BOTH LINES ARE ON IT
 *   Temperature and humidity were two stacked charts. They are one chart with
 *   two axes now, because the pair is what matters: 30 °C at 60% RH and 30 °C
 *   at 85% RH are the same temperature and completely different growing
 *   conditions. Stacked, the reader has to hold one line in their head while
 *   looking at the other.
 *
 * THE SPRAY BANDS ARE THE POINT OF THE PAGE
 *   Everything else here reports what a sensor saw. The blue bands say what
 *   the farm DID. With them on the same axes, the chart answers a question no
 *   reading answers alone: did running the pump actually bring the
 *   temperature down? If the trace does not bend at a band, the spraying is
 *   not doing what it is there to do — and that is worth knowing before the
 *   next hot week rather than after it.
 *
 * WHAT IS NOT HERE
 *   No "comfort zone" band and no recommendations. Both need a crop model
 *   this system does not have, and advice printed beside live readings looks
 *   like it was derived from them. The VPD card is as close as the data
 *   honestly goes, and it says "air VPD" because we have no leaf sensor.
 */
import { Thermometer, Droplets, Gauge, TrendingUp } from "lucide-react";

import KPICard from "@/components/ui/KPICard";
import ConsumptionChart from "@/components/dashboard/sections/ConsumptionChart";
import { dewPoint, vpd, vpdBand } from "@/lib/psychro";
import { at, dailyMinutesOver, duration, extreme, minutesOver } from "@/lib/series";

import OverlayChart, { ChartLegendHints } from "./OverlayChart";
import { Panel, Stat, ThresholdRow } from "./Panel";
import type { DetailProps } from "./types";

export default function AmbientDetail({
  latest, history, sprayStats, isOffline, isLoading, tempWarn, humWarn, rangeWord,
}: DetailProps) {
  const read = (f: string) => (!isOffline ? latest?.readings?.[f]?.value : undefined);
  const temp = read("temperature");
  const hum = read("humidity");

  const tempPts = history?.series?.temperature ?? [];
  const humPts = history?.series?.humidity ?? [];

  const peak = extreme(tempPts, "max");
  const low = extreme(tempPts, "min");
  const hotMin = minutesOver(tempPts, tempWarn);
  const humidMin = minutesOver(humPts, humWarn);

  const kpa = temp != null && hum != null ? vpd(temp, hum) : null;
  const dp = temp != null && hum != null ? dewPoint(temp, hum) : null;
  const band = kpa != null ? vpdBand(kpa) : null;

  const perDay = dailyMinutesOver(tempPts, tempWarn);
  const events = sprayStats?.stats?.spray_events ?? [];

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          title="Air temperature" icon={Thermometer}
          value={temp != null ? temp.toFixed(1) : "—"} rawValue={temp} decimals={1}
          unit={temp != null ? "°C" : undefined}
          isLoading={isLoading && !latest} isStale={isOffline}
          status={temp != null && temp >= tempWarn ? "warn" : "ok"}
          subtitle={isOffline ? "No signal from sensor" : `Warns at ${tempWarn} °C`}
        />
        <KPICard
          title="Air humidity" icon={Droplets}
          value={hum != null ? hum.toFixed(1) : "—"} rawValue={hum} decimals={1}
          unit={hum != null ? "%" : undefined}
          isLoading={isLoading && !latest} isStale={isOffline}
          status={hum != null && hum >= humWarn ? "warn" : "ok"}
          subtitle={isOffline ? "No signal from sensor" : `Warns at ${humWarn}%`}
        />
        <KPICard
          title="Air VPD" icon={Gauge}
          value={kpa != null ? kpa.toFixed(2) : "—"} rawValue={kpa ?? undefined} decimals={2}
          unit={kpa != null ? "kPa" : undefined}
          isLoading={isLoading && !latest} isStale={isOffline}
          status={band?.tone}
          // Computed from the two readings beside it, not measured. Saying so
          // in the subtitle costs a line and stops it reading as a third
          // instrument the greenhouse does not have.
          subtitle={
            dp != null ? `${band?.label} · dew point ${dp.toFixed(1)} °C`
              : "From temperature and humidity"
          }
        />
        <KPICard
          title="Peak temperature" icon={TrendingUp}
          value={peak ? peak.value.toFixed(1) : "—"} rawValue={peak?.value} decimals={1}
          unit={peak ? "°C" : undefined}
          isLoading={isLoading && !history}
          // The TIME of the peak is the actionable half. "38.3 °C" tells you
          // this week was bad; "38.3 °C at 14:35" tells you when to be in the
          // greenhouse tomorrow.
          subtitle={
            peak ? `at ${at(peak.time)}${low ? ` · low ${low.value.toFixed(1)} °C` : ""}`
              : `This ${rangeWord}`
          }
        />
      </section>

      {/* Full width, and the tallest thing on the page.
          It was two thirds of a three-column row with two reference panels
          beside it, which is backwards: the panels are a lookup — you consult
          them once and know the answer for the rest of the day — while the
          chart is the thing you actually read, and the one that gets better
          the wider it is. A day of 15-minute samples is nearly a hundred
          points; at two thirds width they were stacking into a smear. */}
      <Panel
        title="Temperature and humidity"
        aside={<ChartLegendHints spray threshold={`above ${tempWarn} °C`} />}
      >
        <OverlayChart
          series={history?.series}
          sprayEvents={events}
          height={400}
          leftUnit="°C"
          rightUnit="%"
          rightDomain={[0, 100]}
          specs={[
            {
              field: "temperature", label: "Temperature", unit: "°C",
              color: "#10b981", axis: "left", threshold: tempWarn,
            },
            {
              field: "humidity", label: "Humidity", unit: "%",
              color: "#38bdf8", axis: "right", dashed: true,
            },
          ]}
        />
      </Panel>

      {/* The two reference panels, under the chart that answers with them. */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Time over limits">
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Too hot"
              value={hotMin > 0 ? duration(hotMin) : "None"}
              sub={`above ${tempWarn} °C`}
              tone={hotMin > 0 ? "warn" : "ok"}
            />
            <Stat
              label="Too humid"
              value={humidMin > 0 ? duration(humidMin) : "None"}
              sub={`above ${humWarn}%`}
              tone={humidMin > 0 ? "warn" : "ok"}
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            Counted from the readings themselves, so a gap in the feed is
            time this cannot account for rather than time within limits.
          </p>
        </Panel>

        <Panel title="Thresholds" className="lg:col-span-2">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left font-medium pb-2">Metric</th>
                  <th className="text-right font-medium pb-2">Low</th>
                  <th className="text-right font-medium pb-2">High</th>
                  <th className="text-right font-medium pb-2">Now</th>
                  <th className="text-left font-medium pb-2 pl-4">State</th>
                </tr>
              </thead>
              <tbody>
                <ThresholdRow metric="Temperature" high={tempWarn} current={temp} unit="°C" />
                <ThresholdRow metric="Humidity" high={humWarn} current={hum} unit="%" />
                <ThresholdRow
                  metric="Air VPD" low={0.4} high={1.6} current={kpa} unit="kPa"
                />
              </tbody>
            </table>
            <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
              Temperature and humidity limits come from Settings. The VPD band
              is the general 0.4–1.6 kPa working range, not a figure tuned to
              this crop.
            </p>
        </Panel>
      </section>

      {/* Only once there are enough days for a comparison to mean anything.
          Two bars is not a trend, and drawing it as one invites a conclusion
          the data does not support. */}
      {perDay.length >= 3 && (
        <Panel
          title="Time above the temperature limit, by day"
          aside={
            <span className="text-[11px] text-slate-500">
              is this getting worse, or was today unusual?
            </span>
          }
        >
          <ConsumptionChart
            buckets={perDay}
            unit="min"
            color="#ef4444"
            height={170}
            xLabel="Day"
            yLabel={`Minutes above ${tempWarn} °C`}
            labelFormat={(ts) =>
              new Date(ts).toLocaleDateString([], { day: "numeric", month: "short" })
            }
            empty="No readings stored for this range."
          />
        </Panel>
      )}
    </div>
  );
}
