"use client";
/**
 * Air temperature and humidity — the two readings every farm has.
 *
 * Both on one chart, on two axes, because that is the comparison worth making:
 * 36 °C at 40% and 36 °C at 90% are different problems, and separate charts
 * turn that into a memory exercise. This is the same pairing the full-size
 * chart carried, sized to a card rather than replaced by a sparkline — the
 * axes are what let you say how hot it got and when.
 *
 * Chips below are current values and the day's extremes. The chart is history;
 * the chips are now.
 */
import { Thermometer } from "lucide-react";

import SectionCard from "./SectionCard";
import SectionChart, { toRows, type ChartSeries } from "./SectionChart";
import type { HistoryResponse, LatestResponse } from "@/types";

const SERIES: ChartSeries[] = [
  {
    key: "temperature", label: "Air temperature", unit: "°C", axis: "left",
    color: "#f97316", domain: [15, 45],
  },
  {
    key: "humidity", label: "Humidity", unit: "%", axis: "right",
    color: "#38bdf8", domain: [0, 100],
  },
];

export default function AmbientSection({
  latest, history, isOffline, tempWarn, humWarn,
}: {
  latest?: LatestResponse;
  history?: HistoryResponse;
  isOffline: boolean;
  tempWarn: number;
  humWarn: number;
}) {
  const temp = !isOffline ? latest?.readings?.temperature?.value : undefined;
  const hum = !isOffline ? latest?.readings?.humidity?.value : undefined;

  const rows = toRows([
    { key: "temperature", points: history?.series?.temperature ?? [] },
    { key: "humidity", points: history?.series?.humidity ?? [] },
  ]);

  const seen = (history?.series?.temperature ?? [])
    .map((p) => p.value)
    .filter((v): v is number => v != null);

  return (
    <SectionCard
      icon={Thermometer}
      iconClass="bg-orange-500/15 text-orange-400"
      title="Ambient"
      subtitle="Air temperature and humidity"
      href="/dashboard/ambient"
      footer={[
        {
          label: "Air temp",
          value: temp != null ? `${temp.toFixed(1)} °C` : "—",
          tone: temp != null && temp >= tempWarn ? "warn" : "normal",
        },
        {
          label: "Humidity",
          value: hum != null ? `${hum.toFixed(1)} %` : "—",
          tone: hum != null && hum >= humWarn ? "warn" : "normal",
        },
        { label: "24 h low", value: seen.length ? `${Math.min(...seen).toFixed(1)} °C` : "—" },
        {
          label: "24 h high",
          value: seen.length ? `${Math.max(...seen).toFixed(1)} °C` : "—",
          // The peak is what decides whether the period was a problem, so it
          // is the one figure here allowed to raise its voice.
          tone: seen.length && Math.max(...seen) >= tempWarn ? "warn" : "normal",
        },
      ]}
    >
      <SectionChart
        data={rows}
        series={SERIES}
        empty={
          isOffline
            ? "Feed is stale. The chips below are the last readings received, not current values."
            : undefined
        }
      />
    </SectionCard>
  );
}
