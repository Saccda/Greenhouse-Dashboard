"use client";
/**
 * The PP Campus Dashboard.
 *
 *     ┌─────────────────────────┬─────────────────────┐
 *     │                         │ Water consumption   │
 *     │                         │ bars, per day       │
 *     │       photograph        ├─────────────────────┤
 *     │       (three fifths,    │ Energy consumption  │
 *     │        as tall as both  │ bars, per hour      │
 *     │        charts stacked)  │                     │
 *     └─────────────────────────┴─────────────────────┘
 *     ┌──────┬──────┬──────┬──────┐
 *     │ tile │ tile │ tile │ tile │   every current reading
 *     ├──────┼──────┼──────┼──────┤
 *     │ tile │ tile │ tile │ tile │
 *     └──────┴──────┴──────┴──────┘
 *
 * EIGHT TILES, FOUR WIDE
 *   Two full rows at every breakpoint — four across on a desktop, two on a
 *   phone — because a last row holding one or three tiles stretched to fill
 *   the width reads as a layout that has gone wrong. That is why the count is
 *   even by intent rather than by accident, and why adding a ninth reading
 *   later means finding a pair, not appending one.
 *
 * EACH PIECE OF INFORMATION HAS ONE HOME
 *   This layout has drifted back into duplication twice, so the rule is worth
 *   stating. The photograph says WHICH farm and what is physically running in
 *   it — nothing else, which is why air temperature and humidity are no longer
 *   printed on it. The tiles carry every current reading. The two charts carry
 *   quantities USED over time, which no tile holds.
 *
 *   The energy chart and a "drawing now" tile were the last overlap: a rate
 *   and its integral are different quantities, but they read as the same fact
 *   twice. The tile went, because the chart answers the longer question.
 *
 * WHAT IS NOT HERE
 *   Tank water temperature. It was the ninth tile and the one worth losing:
 *   it belongs to spraying rather than to growing conditions, and the comparison
 *   that makes it useful — tank against air, since a tank no cooler than the air
 *   removes no heat when it sprays — needs two numbers side by side, which a
 *   tile cannot really give. It is on /dashboard/water with the spray history,
 *   where that comparison has room.
 *
 * WHY THESE TWO CHARTS AND NO OTHERS
 *   A tile tells you the soil is at 28.4 °C and you know what to do. "2 m³"
 *   means nothing without knowing whether that is a normal day — consumption
 *   is cumulative, and the bars supply a comparison nothing else here can.
 *   Ambient and soil trends live on their own pages, where they get a 360px
 *   chart with threshold shading instead of a thumbnail.
 */
import {
  Thermometer, Droplets, Waves, Sprout, FlaskConical, Leaf, Atom,
} from "lucide-react";

import type {
  Farm, HistoryResponse, LatestResponse, RelayStatus, SprayStatsResponse, WaterResponse,
} from "@/types";
import FarmHero from "./FarmHero";
import KPICard from "@/components/ui/KPICard";
import WaterSection from "./sections/WaterSection";
import EnergySection from "./sections/EnergySection";

export default function CampusSections({
  farm, latest, history, water, sprayStats, isOffline, tempWarn, humWarn, rangeLabel,
}: {
  farm?: Farm;
  latest?: LatestResponse;
  history?: HistoryResponse;
  water?: WaterResponse;
  sprayStats?: SprayStatsResponse;
  isOffline: boolean;
  tempWarn: number;
  humWarn: number;
  rangeLabel: string;
}) {
  const relays: RelayStatus[] = latest?.relays ?? [];
  const has = (field: string) => (farm?.soil_probes ?? []).some((p) => p.field === field);

  const read = (field?: string | null) =>
    field && !isOffline ? latest?.readings?.[field]?.value : undefined;

  const airTemp = read("temperature");
  const humidity = read("humidity");
  const moisture = read("soil_moisture");
  const soilTemp = read("soil_temperature");
  const n = read("soil_nitrogen");
  const p = read("soil_phosphorus");
  const k = read("soil_potassium");

  const stats = sprayStats?.stats;
  const spraying = relays.some((r) => r.state === "ON" && /spray/i.test(r.label));

  return (
    // grow, not flex-1: flex-1 sets the basis to zero and would let a tall
    // screen squash the tiles instead of stretching the photograph. shrink-0
    // keeps a short screen scrolling rather than compressing anything.
    <div className="flex flex-col gap-4 grow shrink-0">
      {/* ── Photograph, and the two cumulative quantities ────────────────
          This band takes whatever height is left over, which is what closes
          the empty strip under the page in fullscreen: the screen gets taller,
          so the photograph and the two charts get taller with it instead of
          the background showing through below them. */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4 grow">
        <div className="lg:col-span-3 min-w-0">
          <FarmHero farm={farm} latest={latest} isOffline={isOffline} />
        </div>
        {/* Stacked, each taking half the height, so the photograph beside them
            is as tall as both together.

            Two of five rather than one of three: at a third of the window the
            plot area left after the axes was narrow enough that a week of bars
            ran together, and the bars are the whole point of the card. The
            photograph loses the width more cheaply than the charts do — it is
            a photograph, and it crops. */}
        <div className="lg:col-span-2 min-w-0 flex flex-col gap-4">
          <div className="flex-1 min-h-0">
            <WaterSection
              farm={farm}
              water={water}
              sprayStats={sprayStats}
              rangeLabel={rangeLabel}
            />
          </div>
          <div className="flex-1 min-h-0">
            <EnergySection farm={farm} history={history} />
          </div>
        </div>
      </section>

      {/* ── Every current reading ──────────────────────────────────────
          The same KPICard the Kampot and Kep dashboards use. These were a
          separate, flatter tile until now; two components meant to look alike
          but maintained apart do not stay alike, so there is one card. */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          title="Air temperature"
          value={airTemp != null ? airTemp.toFixed(1) : "—"}
          rawValue={airTemp}
          decimals={1}
          unit={airTemp != null ? "°C" : undefined}
          icon={Thermometer}
          href="/dashboard/ambient"
          isStale={isOffline}
          status={airTemp != null && airTemp >= tempWarn ? "warn" : "ok"}
          subtitle={
            isOffline ? "No signal from sensor"
              : airTemp != null && airTemp >= tempWarn ? `Above ${tempWarn} °C`
                : `Warns at ${tempWarn} °C`
          }
        />
        <KPICard
          title="Air humidity"
          value={humidity != null ? humidity.toFixed(1) : "—"}
          rawValue={humidity}
          decimals={1}
          unit={humidity != null ? "%" : undefined}
          icon={Droplets}
          href="/dashboard/ambient"
          isStale={isOffline}
          status={humidity != null && humidity >= humWarn ? "warn" : "ok"}
          subtitle={
            isOffline ? "No signal from sensor"
              : humidity != null && humidity >= humWarn ? `Above ${humWarn}%`
                : `Warns at ${humWarn}%`
          }
        />
        <KPICard
          title="Spray cycles"
          value={stats ? String(stats.total_sprays) : "—"}
          icon={Waves}
          href="/dashboard/water"
          status={spraying ? "ok" : undefined}
          subtitle={
            spraying ? "Running now"
              : stats ? `${stats.total_spray_display} · last ${rangeLabel}`
                : `Last ${rangeLabel}`
          }
        />
        {has("soil_temperature") && (
          <KPICard
            title="Soil temperature"
            value={soilTemp != null ? soilTemp.toFixed(1) : "—"}
            rawValue={soilTemp}
            decimals={1}
            unit={soilTemp != null ? "°C" : undefined}
            icon={Thermometer}
            href="/dashboard/soil"
            isStale={isOffline}
            subtitle={
              soilTemp != null && airTemp != null
                ? `${Math.abs(soilTemp - airTemp).toFixed(1)} °C ${soilTemp < airTemp ? "below" : "above"} air`
                : "Root zone"
            }
          />
        )}
        {has("soil_moisture") && (
          <KPICard
            title="Soil moisture"
            value={moisture != null ? moisture.toFixed(1) : "—"}
            rawValue={moisture}
            decimals={1}
            unit={moisture != null ? "%" : undefined}
            icon={Sprout}
            href="/dashboard/soil"
            isStale={isOffline}
            subtitle="Root zone"
          />
        )}
        {has("soil_nitrogen") && (
          <KPICard
            title="Nitrogen"
            value={n != null ? n.toFixed(0) : "—"}
            rawValue={n}
            decimals={0}
            unit={n != null ? "mg/kg" : undefined}
            icon={Leaf}
            href="/dashboard/soil"
            isStale={isOffline}
            subtitle="Available N"
          />
        )}
        {has("soil_phosphorus") && (
          <KPICard
            title="Phosphorus"
            value={p != null ? p.toFixed(0) : "—"}
            rawValue={p}
            decimals={0}
            unit={p != null ? "mg/kg" : undefined}
            icon={FlaskConical}
            href="/dashboard/soil"
            isStale={isOffline}
            subtitle="Available P"
          />
        )}
        {has("soil_potassium") && (
          <KPICard
            title="Potassium"
            value={k != null ? k.toFixed(0) : "—"}
            rawValue={k}
            decimals={0}
            unit={k != null ? "mg/kg" : undefined}
            icon={Atom}
            href="/dashboard/soil"
            isStale={isOffline}
            subtitle="Available K"
          />
        )}
      </section>
    </div>
  );
}
