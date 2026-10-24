"use client";
/**
 * The root zone: moisture, temperature and nutrients on one card.
 *
 * They arrive on two MQTT topics but they describe one thing, and splitting
 * them made you look in two places to answer "how is the soil". Together here;
 * the detail page charts all of them properly.
 *
 * WHAT IS CHARTED AND WHAT IS NOT
 *   The chart carries moisture and temperature, which move hour to hour and
 *   have a shape worth reading. N-P-K sit in the chips instead. That is not
 *   because they matter less — it is that three more units on these two axes
 *   would make all five lines unreadable, and nutrient levels change over
 *   weeks, so a 24-hour line of them says nothing a number does not.
 *
 *   Nothing is hidden by this: every probe has a chip with its current value,
 *   and /dashboard/soil charts all of them with room to do it.
 *
 * Which probes appear is read from the farm registry. Add a pH probe to the
 * config and it gets a chip here and a line on the detail page, with no edit.
 */
import { Sprout } from "lucide-react";

import SectionCard from "./SectionCard";
import SectionChart, { toRows, type ChartSeries } from "./SectionChart";
import type { HistoryResponse, LatestResponse, SoilProbe } from "@/types";

// Charted when present, in this order. Everything else becomes a chip only.
const CHARTED = ["soil_moisture", "soil_temperature"];
const COLORS = ["#10b981", "#f59e0b"];

export default function SoilSection({
  probes, latest, history, isOffline,
}: {
  probes: SoilProbe[];
  latest?: LatestResponse;
  history?: HistoryResponse;
  isOffline: boolean;
}) {
  if (!probes.length) return null;

  const charted = CHARTED
    .map((f) => probes.find((p) => p.field === f))
    .filter((p): p is SoilProbe => !!p);

  const rows = toRows(charted.map((p) => ({
    key: p.field,
    points: history?.series?.[p.field] ?? [],
  })));

  // A percentage and a temperature cannot share a scale and stay readable.
  const series: ChartSeries[] = charted.map((p, i) => ({
    key: p.field,
    label: p.label,
    unit: p.unit,
    axis: i === 0 ? "left" : "right",
    color: COLORS[i % COLORS.length],
    domain: [p.min ?? "auto", p.max ?? "auto"],
  }));

  const neverReported = probes.every(
    (p) => latest?.readings?.[p.field] == null && (history?.series?.[p.field] ?? []).length === 0,
  );
  const depth = probes.find((p) => p.depth_cm != null)?.depth_cm;

  return (
    <SectionCard
      icon={Sprout}
      iconClass="bg-emerald-500/15 text-emerald-400"
      title="Soil"
      subtitle={
        depth != null
          ? `Root zone at ${depth} cm · moisture, temperature and nutrients`
          : "Moisture, temperature and nutrients"
      }
      href="/dashboard/soil"
      footer={probes.map((p) => {
        const v = !isOffline ? latest?.readings?.[p.field]?.value : undefined;
        return { label: p.label, value: v != null ? `${v.toFixed(1)} ${p.unit}` : "—" };
      })}
    >
      <SectionChart
        data={rows}
        series={series}
        empty={
          neverReported
            ? "Configured but never reported. Check the probes are wired, and that the MQTT bridge has been restarted since they were added."
            : "No readings stored for this range."
        }
      />
    </SectionCard>
  );
}
