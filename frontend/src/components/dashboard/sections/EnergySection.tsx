"use client";
/**
 * Mains supply feeding the rig — renders only when the farm has a meter.
 *
 * Power is the chart, voltage and current are chips. Power is the figure that
 * costs money and the one that changes when something switches on; voltage
 * sits near 220 V all day and would flatten any axis it shared.
 *
 * A note that belongs next to the code rather than in a commit message:
 * power_w has read exactly 0 since this feed appeared, while voltage and
 * current are plainly alive (222 V, 0.07 A — about 15 VA). Either the meter
 * reports real power and the standing load is almost purely reactive, or the
 * field is not being computed. The card shows what arrives either way; a
 * dashboard that quietly substituted V × A would be inventing a reading the
 * hardware never sent.
 */
import { Zap } from "lucide-react";

import SectionCard from "./SectionCard";
import SectionChart, { toRows, type ChartSeries } from "./SectionChart";
import type { Farm, HistoryResponse, LatestResponse } from "@/types";

export default function EnergySection({
  farm, latest, history, isOffline,
}: {
  farm?: Farm;
  latest?: LatestResponse;
  history?: HistoryResponse;
  isOffline: boolean;
}) {
  const channels = farm?.energy ?? [];
  if (!channels.length) return null;

  const byField = Object.fromEntries(channels.map((c) => [c.field, c]));
  const power = byField["power_w"];

  const rows = toRows(
    power ? [{ key: "power_w", points: history?.series?.power_w ?? [] }] : [],
  );
  const powerSeen = (history?.series?.power_w ?? [])
    .map((p) => p.value)
    .filter((v): v is number => v != null);

  const series: ChartSeries[] = power
    ? [{
        key: "power_w", label: power.label, unit: power.unit, axis: "left",
        color: "#eab308",
        // Scaled to what has been drawn, not to the meter's full range: a rig
        // pulling tens of watts would be an invisible line against 4 kW.
        domain: powerSeen.length && Math.max(...powerSeen) > 0
          ? [0, Math.ceil(Math.max(...powerSeen) * 1.2)]
          : [0, 10],
      }]
    : [];

  const now = (field: string) =>
    !isOffline ? latest?.readings?.[field]?.value : undefined;

  const alwaysZero = powerSeen.length > 0 && powerSeen.every((v) => v === 0);

  return (
    <SectionCard
      icon={Zap}
      iconClass="bg-amber-500/15 text-amber-400"
      title="Energy"
      subtitle={alwaysZero ? "Power has read zero throughout — worth checking" : "Mains supply to the rig"}
      href="/dashboard/energy"
      footer={channels.map((c) => {
        const v = now(c.field);
        return {
          label: c.label,
          value: v != null ? `${v.toFixed(c.unit === "A" ? 2 : 1)} ${c.unit}` : "—",
          // Only power earns a flag, and only for being implausibly flat
          // against a live voltage and current.
          tone: c.field === "power_w" && alwaysZero ? ("warn" as const) : ("normal" as const),
        };
      })}
    >
      <SectionChart
        data={rows}
        series={series}
        empty={
          power
            ? "No power readings stored for this range."
            : "This meter reports no power channel."
        }
      />
    </SectionCard>
  );
}
