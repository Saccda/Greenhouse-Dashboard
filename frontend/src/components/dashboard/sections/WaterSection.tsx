"use client";
/**
 * Water: what was drawn, how cold the tank is, and when the pump ran.
 *
 * Spraying belongs here rather than on a card of its own — it IS the water
 * consumption, and separating them made you read cause and effect in two
 * places. Together the chart answers a question neither could alone: the tank
 * temperature line with spray periods shaded beneath it shows whether
 * spraying is drawing the tank down, and whether the water it drew was cold
 * enough to be worth spraying.
 *
 * That matters here specifically. The campus tank has been sitting at ambient
 * temperature, and a full tank of 31 °C water sprayed into a 31 °C greenhouse
 * removes no heat at all — which looks identical to an empty tank in every
 * figure except this one.
 *
 * Consumption stays a chip rather than a line: the meter reports only once
 * another cubic metre has passed, which can be days apart and makes a poor
 * trend. Campus measures it; Kampot and Kep estimate it from runtime, and the
 * card never blurs the two.
 */
import { Droplet } from "lucide-react";

import SectionCard from "./SectionCard";
import SectionChart, { toRows, type ChartSeries } from "./SectionChart";
import type {
  Farm, HistoryResponse, LatestResponse, RelayStatus, SprayStatsResponse, WaterResponse,
} from "@/types";

export default function WaterSection({
  farm, water, history, latest, sprayStats, relays, rangeLabel, isOffline,
}: {
  farm?: Farm;
  water?: WaterResponse;
  history?: HistoryResponse;
  latest?: LatestResponse;
  sprayStats?: SprayStatsResponse;
  relays: RelayStatus[];
  rangeLabel: string;
  isOffline: boolean;
}) {
  const metered = farm?.water_source === "measured";
  const probe = farm?.water_temp ?? null;
  const sprayField = farm?.spray_field ?? "relay3";

  const tankPoints = probe ? history?.series?.[probe.field] ?? [] : [];
  const sprayPoints = history?.series?.[sprayField] ?? [];
  const tankSeen = tankPoints.map((p) => p.value).filter((v): v is number => v != null);

  const rows = toRows([
    { key: "tank", points: tankPoints },
    { key: "spray", points: sprayPoints },
  ]);

  const series: ChartSeries[] = [];
  if (probe) {
    series.push({
      key: "tank", label: probe.label, unit: probe.unit, axis: "left",
      color: "#0ea5e9",
      // Scaled to what was seen: a tank moving two degrees across a day is a
      // flat line on the probe's 0–60 range, hiding the only thing worth
      // seeing.
      domain: tankSeen.length
        ? [Math.floor(Math.min(...tankSeen) - 1), Math.ceil(Math.max(...tankSeen) + 1)]
        : ["auto", "auto"],
    });
  }
  // Steps, because a channel is on or off — a curve between those two states
  // would describe something that never happened.
  series.push({
    key: "spray", label: "Spraying", unit: "", axis: probe ? "right" : "left",
    color: "#8b5cf6", domain: [0, 1], step: true,
  });

  const stats = sprayStats?.stats;
  const interrupted = (stats?.spray_events ?? []).filter(
    (e) => (e as { gap_interrupted?: boolean }).gap_interrupted,
  ).length;

  const reading = water?.readings?.[0];
  const unit = water?.unit_label ?? "";
  const used = metered
    ? reading?.consumption != null ? `${reading.consumption} ${unit}` : "—"
    : stats?.estimated_water_liters != null
      ? `${Math.round(stats.estimated_water_liters).toLocaleString()} L`
      : "—";

  const tankNow = probe && !isOffline ? latest?.readings?.[probe.field]?.value : undefined;
  const spraying = relays.some((r) => r.state === "ON" && /spray/i.test(r.label));

  const chips: { label: string; value: string; tone?: "normal" | "good" | "warn" }[] = [
    { label: metered ? "Used (metered)" : "Used (estimated)", value: used },
  ];
  if (probe) {
    chips.push({
      label: "Tank water",
      value: tankNow != null ? `${tankNow.toFixed(1)} °C` : "—",
    });
  }
  chips.push({
    label: "Pump ran",
    value: stats?.total_spray_display ?? "—",
    // A run bounded by a blackout is a lower bound, not a measurement, and the
    // two look identical in a figure.
    tone: interrupted > 0 ? "warn" : "normal",
  });
  chips.push({
    label: "Cycles",
    value: isOffline
      ? "unknown"
      : stats
        ? `${stats.total_sprays}${spraying ? " · running" : ""}`
        : "—",
    tone: isOffline ? "warn" : spraying ? "good" : "normal",
  });

  return (
    <SectionCard
      icon={Droplet}
      iconClass="bg-sky-500/15 text-sky-400"
      title="Water"
      subtitle={
        interrupted > 0
          ? `Consumption and spraying · ${interrupted} cycle${interrupted === 1 ? "" : "s"} cut short by a feed gap`
          : probe
            ? "Tank temperature, consumption and spraying"
            : `Consumption and spraying, last ${rangeLabel}`
      }
      href="/dashboard/water"
      footer={chips}
    >
      <SectionChart
        data={rows}
        series={series}
        empty={`No tank or spray readings stored for the last ${rangeLabel}.`}
      />
    </SectionCard>
  );
}
