"use client";
/**
 * The PP Campus Dashboard body: one card per sensor domain.
 *
 * WHY CAMPUS ONLY, FOR NOW
 *   Campus is the farm whose readings are growing — it gained a tank
 *   temperature probe this week and soil probes are next. Kampot and Kep still
 *   report temperature, humidity and three relays, which the existing flat row
 *   handles perfectly well. Changing all three farms to prove a layout on one
 *   of them would be the kind of change that is hard to undo if the idea turns
 *   out not to work in front of an operator.
 *
 *   So the farm picker switches the layout as well as the data. Nothing here
 *   is campus-specific in its logic, so promoting it to the other farms later
 *   is a condition change, not a rewrite.
 *
 * WHAT GOES ON A CARD
 *   The one or two figures worth seeing without asking, and nothing else.
 *   Every card links to its own page for the detail. A card is rendered only
 *   when the farm actually has that sensor, read from the farm registry, so
 *   the grid composes itself rather than being a fixed list someone has to
 *   remember to edit.
 */
import type { Farm, HistoryResponse, LatestResponse, RelayStatus, SprayStatsResponse, WaterResponse } from "@/types";
import AmbientSection from "./sections/AmbientSection";
import WaterSection from "./sections/WaterSection";
import SoilSection from "./sections/SoilSection";
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
  const soilProbes = farm?.soil_probes ?? [];

  // Four cards, two columns, two clean rows. Each card is one thing a person
  // asks about, and the merges follow the operator's own framing: spraying IS
  // water consumption, and nutrients ARE soil, so each belongs with what it
  // describes rather than beside it.
  //
  //   Ambient | Water    the air, and the water drawn to cool it
  //   Energy  | Soil     what it costs, and what the crop sits in
  //
  // Cards return null when the farm has no such sensor, so this is two cards
  // on a farm with neither probe and four on campus.
  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <AmbientSection
        latest={latest}
        history={history}
        isOffline={isOffline}
        tempWarn={tempWarn}
        humWarn={humWarn}
      />
      <WaterSection
        farm={farm}
        water={water}
        history={history}
        latest={latest}
        sprayStats={sprayStats}
        relays={relays}
        rangeLabel={rangeLabel}
        isOffline={isOffline}
      />
      <EnergySection
        farm={farm}
        latest={latest}
        history={history}
        isOffline={isOffline}
      />
      <SoilSection
        probes={soilProbes}
        latest={latest}
        history={history}
        isOffline={isOffline}
      />
    </section>
  );
}
