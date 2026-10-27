"use client";
/**
 * Soil in full, split by the decision each reading serves.
 *
 * TWO GROUPS, NOT FIVE CHARTS
 *   This page used to stack one identical chart per probe, in whatever order
 *   the config listed them. But moisture and soil temperature answer "do I
 *   water?", while N, P and K answer "do I feed?" — different questions, often
 *   different people, and they arrive on separate MQTT topics. The backend has
 *   tagged every probe `group: "conditions" | "nutrients"` since the probes
 *   were added and the frontend simply ignored it. It does not now.
 *
 * NPK SHARE ONE CHART
 *   Same unit, and it is the RATIO between the three that an agronomist
 *   reads, not three separate traces. Split across three panels, the one
 *   question the numbers exist to answer is the one you cannot ask.
 *
 * NO IDEAL RANGES
 *   The mockup showed "ideal range 25–60 ppm" bars. Those numbers are an
 *   agronomic claim about a particular crop in particular soil, and inventing
 *   them would be the most confident-looking lie on the page. The bars here
 *   are scaled to the PROBE's measuring range, which is a fact about the
 *   instrument, and the panel says that is what they are. Once the team
 *   supplies targets for the crop, they drop straight in.
 */
import { Sprout, Thermometer, Leaf, FlaskConical, Atom, type LucideIcon } from "lucide-react";

import KPICard from "@/components/ui/KPICard";
import type { SoilProbe } from "@/types";
import { isStuck } from "@/lib/series";

import OverlayChart, { ChartLegendHints } from "./OverlayChart";
import { Empty, Panel, Warning } from "./Panel";
import type { DetailProps } from "./types";

const ICONS: Record<string, LucideIcon> = {
  soil_moisture: Sprout,
  soil_temperature: Thermometer,
  soil_nitrogen: Leaf,
  soil_phosphorus: FlaskConical,
  soil_potassium: Atom,
};
const NPK_COLOURS: Record<string, string> = {
  soil_nitrogen: "#22c55e",
  soil_phosphorus: "#f59e0b",
  soil_potassium: "#a855f7",
};

export default function SoilDetail({
  farm, latest, history, sprayStats, isOffline, isLoading,
}: DetailProps) {
  const probes = farm?.soil_probes ?? [];
  if (probes.length === 0) {
    return (
      <Empty>
        No probes are fitted to this farm. This page reads the farm registry, so
        it fills in by itself once they are wired and configured.
      </Empty>
    );
  }

  const read = (f: string) => (!isOffline ? latest?.readings?.[f]?.value : undefined);
  const conditions = probes.filter((p) => p.group !== "nutrients");
  const nutrients = probes.filter((p) => p.group === "nutrients");
  const events = sprayStats?.stats?.spray_events ?? [];
  const airTemp = read("temperature");

  // A probe that has not moved at all is almost never a steady reading. The
  // campus moisture probe has sat at exactly 0.2% for weeks, and saying so
  // here is the difference between "the soil is dry" and "the probe is out of
  // the ground".
  const frozen = probes.filter((p) => {
    const values = (history?.series?.[p.field] ?? [])
      .map((pt) => pt.value).filter((v): v is number => v != null);
    return isStuck(values);
  });

  const has = (f: string) => probes.some((p) => p.field === f);

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {probes.map((p) => {
          const v = read(p.field);
          const decimals = p.unit === "mg/kg" ? 0 : 1;
          return (
            <KPICard
              key={p.field}
              title={p.label}
              icon={ICONS[p.field] ?? Sprout}
              value={v != null ? v.toFixed(decimals) : "—"}
              rawValue={v}
              decimals={decimals}
              unit={v != null ? p.unit : undefined}
              isLoading={isLoading && !latest}
              isStale={isOffline}
              subtitle={subtitleFor(p, v, airTemp)}
            />
          );
        })}
      </section>

      {frozen.length > 0 && (
        <Warning>
          {frozen.map((p) => p.label).join(" and ")}{" "}
          {frozen.length === 1 ? "has" : "have"} not changed by a single step for
          the whole of this period. A reading that never moves usually means the
          probe is not in contact with the soil rather than that conditions are
          steady — worth checking before acting on anything below.
        </Warning>
      )}

      {/* Full width. This was two thirds of a row, with a panel beside it
          listing each probe's depth and measuring range — reference material
          that did not change from one visit to the next, taking a third of
          the page away from the only thing here that does. */}
      {conditions.length > 0 && (
        <Panel title="Root zone conditions" aside={<ChartLegendHints spray />}>
          <OverlayChart
            series={history?.series}
            sprayEvents={events}
            height={360}
            leftUnit={has("soil_moisture") ? "%" : "°C"}
            rightUnit={has("soil_moisture") && has("soil_temperature") ? "°C" : undefined}
            specs={[
              ...(has("soil_moisture") ? [{
                field: "soil_moisture", label: "Moisture", unit: "%",
                color: "#0ea5e9", axis: "left" as const,
              }] : []),
              ...(has("soil_temperature") ? [{
                field: "soil_temperature", label: "Soil temperature", unit: "°C",
                color: "#f97316",
                axis: (has("soil_moisture") ? "right" : "left") as "left" | "right",
              }] : []),
              // Air on the same axis as soil temperature, because the gap
              // between them is the reading: soil that tracks air exactly is
              // a probe lying on the surface.
              ...(has("soil_temperature") ? [{
                field: "temperature", label: "Air", unit: "°C",
                color: "#94a3b8", dashed: true,
                axis: (has("soil_moisture") ? "right" : "left") as "left" | "right",
              }] : []),
            ]}
          />
          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            The blue bands are spray cycles. Moisture that does not lift after
            one either means the water is not reaching this probe, or that the
            probe is not reading.
          </p>
        </Panel>
      )}

      {nutrients.length > 0 && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Panel
            className="lg:col-span-2"
            title="Nutrients"
            aside={
              <span className="text-[11px] text-slate-500">
                all three share an axis — the ratio is the reading
              </span>
            }
          >
            <OverlayChart
              series={history?.series}
              height={280}
              leftUnit={nutrients[0]?.unit ?? "mg/kg"}
              specs={nutrients.map((p) => ({
                field: p.field,
                label: p.label,
                unit: p.unit,
                color: NPK_COLOURS[p.field] ?? "#64748b",
                axis: "left" as const,
              }))}
            />
          </Panel>

          <Panel title="Against the probe's range">
            <div className="space-y-4">
              {nutrients.map((p) => {
                const v = read(p.field);
                const max = p.max ?? 200;
                const pct = v != null ? Math.max(0, Math.min(100, (v / max) * 100)) : 0;
                return (
                  <div key={p.field}>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-[13px] text-slate-300">{p.label}</span>
                      <span className="text-[13px] font-mono-num text-slate-100">
                        {v != null ? `${v.toFixed(0)} ${p.unit}` : "—"}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-hover overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: NPK_COLOURS[p.field] ?? "#64748b",
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 mt-0.5 font-mono-num">
                      <span>{p.min ?? 0}</span>
                      <span>{max}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 mt-4 leading-relaxed">
              These bars show each reading against what the PROBE can measure,
              not against what the crop wants. No target ranges are configured
              for this farm — once the team supplies them for the crop and soil,
              they replace the instrument range here.
            </p>
          </Panel>
        </section>
      )}
    </div>
  );
}

/** A line of context under each card, where the data supports one. */
function subtitleFor(p: SoilProbe, value?: number, airTemp?: number): string {
  if (value == null) return p.depth_cm != null ? `${p.depth_cm} cm down` : "Root zone";
  if (p.field === "soil_temperature" && airTemp != null) {
    const d = Math.abs(value - airTemp).toFixed(1);
    return `${d} °C ${value < airTemp ? "below" : "above"} air`;
  }
  if (p.group === "nutrients") return `Available ${p.label.charAt(0)}`;
  return p.depth_cm != null ? `${p.depth_cm} cm down` : "Root zone";
}
