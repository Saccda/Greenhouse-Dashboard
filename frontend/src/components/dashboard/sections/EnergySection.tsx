"use client";
/**
 * Mains supply feeding the rig — renders only when the farm has a meter.
 *
 * WHY THE CHART SHOWS VA AND NOT W
 *   The meter's power_w field has read exactly 0 since the feed appeared,
 *   against a live 222 V and 0.07 A, so charting it draws a flat line along
 *   the axis. Apparent power — voltage times current — is computed here
 *   instead and labelled VA, which is what it is.
 *
 *   VA is NOT watts. They are equal only for a resistive load; a pump is
 *   inductive, so real power is VA times the power factor, typically 0.6-0.9
 *   for a motor. Printing 15.5 VA as "15.5 W" would overstate real
 *   consumption, and anyone costing electricity from it would overstate the
 *   bill. The two are shown side by side instead, which also makes the
 *   disagreement between them visible rather than hidden.
 *
 * WHY IT IS DERIVED RATHER THAN STORED
 *   It is a pure function of two fields already being recorded, and InfluxDB
 *   on this plan cannot delete what it has written. Storing a computed field
 *   means living with it if the formula turns out wrong; deriving it means the
 *   day power_w starts working, this becomes a one-line change with no dead
 *   series left behind.
 */
import { Zap } from "lucide-react";

import SectionCard from "./SectionCard";
import SectionChart, { type ChartSeries, type ChartRow } from "./SectionChart";
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
  const hasVA = !!byField["voltage"] && !!byField["current"];

  // Apparent power, merged onto one time axis. A timestamp carrying only one
  // of the two yields null rather than a half-computed figure.
  const volts = new Map<number, number>();
  for (const p of history?.series?.voltage ?? []) {
    if (p.value != null) volts.set(new Date(p.time).getTime(), p.value);
  }
  const rows: ChartRow[] = [];
  for (const p of history?.series?.current ?? []) {
    const ts = new Date(p.time).getTime();
    const v = volts.get(ts);
    rows.push({ ts, va: v != null && p.value != null ? v * p.value : null });
  }
  for (const p of history?.series?.power_w ?? []) {
    const ts = new Date(p.time).getTime();
    const row = rows.find((r) => r.ts === ts);
    if (row) row.power_w = p.value;
    else rows.push({ ts, power_w: p.value });
  }
  rows.sort((a, b) => a.ts - b.ts);

  const vaSeen = rows.map((r) => r.va).filter((v): v is number => v != null);
  const series: ChartSeries[] = [];
  if (hasVA) {
    series.push({
      key: "va", label: "Apparent power", unit: "VA", axis: "left",
      color: "#eab308",
      // Scaled to what has been drawn: a rig pulling tens of VA would be an
      // invisible line against the meter's full range.
      domain: vaSeen.length && Math.max(...vaSeen) > 0
        ? [0, Math.ceil(Math.max(...vaSeen) * 1.2)]
        : [0, 10],
    });
  }

  const now = (f: string) => (!isOffline ? latest?.readings?.[f]?.value : undefined);
  const vNow = now("voltage");
  const aNow = now("current");
  const wNow = now("power_w");
  const vaNow = vNow != null && aNow != null ? vNow * aNow : undefined;

  const powerSeen = (history?.series?.power_w ?? [])
    .map((p) => p.value)
    .filter((v): v is number => v != null);
  const wAlwaysZero = powerSeen.length > 0 && powerSeen.every((v) => v === 0);

  const chips: { label: string; value: string; tone?: "normal" | "good" | "warn" }[] = [
    { label: "Voltage", value: vNow != null ? `${vNow.toFixed(1)} V` : "—" },
    { label: "Current", value: aNow != null ? `${aNow.toFixed(2)} A` : "—" },
  ];
  if (hasVA) {
    chips.push({
      label: "Apparent power",
      value: vaNow != null ? `${vaNow.toFixed(1)} VA` : "—",
    });
  }
  chips.push({
    label: "Reported power",
    value: wNow != null ? `${wNow.toFixed(1)} W` : "—",
    // Flagged for being flat zero against a live voltage and current, not for
    // being small. A genuinely idle rig would still show something.
    tone: wAlwaysZero ? "warn" : "normal",
  });

  return (
    <SectionCard
      icon={Zap}
      iconClass="bg-amber-500/15 text-amber-400"
      title="Energy"
      subtitle={
        wAlwaysZero
          ? "Mains supply · meter reports 0 W, so the chart shows volts × amps"
          : "Mains supply to the rig"
      }
      href="/dashboard/energy"
      footer={chips}
    >
      <SectionChart
        data={rows}
        series={series}
        empty={
          hasVA
            ? "No voltage and current readings stored for this range."
            : "This meter reports no voltage or current channel."
        }
      />
    </SectionCard>
  );
}
