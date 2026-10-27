"use client";
/**
 * Water consumption — how much was used, day by day.
 *
 * The meter reports once another cubic metre has passed, so this is genuinely
 * a per-day figure rather than a sampled level, and it is drawn as bars for
 * that reason: a line between two daily totals implies the value passed
 * through everything in between, which is meaningless for a number that only
 * exists once the day is over.
 *
 * Campus measures it. Kampot and Kep have no meter and the figure is estimated
 * from spray runtime and nozzle flow instead — a different claim, and the card
 * says which one it is showing rather than letting the two look alike.
 *
 * Tank temperature and the spray cycle list used to share this card. They
 * belong to the same subject but not to the same question, and they now live
 * on /dashboard/water where there is room to show them properly.
 */
import { Droplet } from "lucide-react";

import SectionCard from "./SectionCard";
import ConsumptionChart, { type Bucket } from "./ConsumptionChart";
import type { Farm, SprayStatsResponse, WaterResponse } from "@/types";

export default function WaterSection({
  farm, water, sprayStats, rangeLabel,
}: {
  farm?: Farm;
  water?: WaterResponse;
  sprayStats?: SprayStatsResponse;
  rangeLabel: string;
}) {
  const metered = farm?.water_source === "measured";
  const unitLabel = water?.unit_label ?? "m³";

  // Oldest first, so time runs left to right like every other chart here.
  const buckets: Bucket[] = metered
    ? [...(water?.readings ?? [])].reverse().map((r) => ({
        ts: new Date(r.timestamp).getTime(),
        // A day whose totalizer reset is not a day of enormous usage; the API
        // nulls those rather than reporting the reset as consumption.
        value: r.consumption ?? null,
      }))
    : [];

  const used = buckets.reduce((s, b) => s + (b.value ?? 0), 0);
  const days = buckets.filter((b) => b.value != null).length;
  const estimated = sprayStats?.stats?.estimated_water_liters;

  return (
    <SectionCard
      icon={Droplet}
      iconClass="bg-sky-500/15 text-sky-400"
      title="Water consumption"
      subtitle={
        metered
          ? days > 0
            ? `${used} ${unitLabel} over ${days} metered day${days === 1 ? "" : "s"}`
            : "Metered, nothing reported yet"
          : estimated != null
            ? `About ${Math.round(estimated).toLocaleString()} L, estimated from runtime · last ${rangeLabel}`
            : "No meter, and no nozzle spec to estimate from"
      }
      href="/dashboard/water"
    >
      <ConsumptionChart
        buckets={buckets}
        unit={unitLabel}
        color="#0ea5e9"
        xLabel="Day"
        yLabel={`Water used (${unitLabel})`}
        labelFormat={(ts) =>
          new Date(ts).toLocaleDateString([], { day: "numeric", month: "short" })
        }
        empty={
          metered
            ? "The meter has not reported yet. It sends only once another cubic metre has passed, so quiet is normal on a system that runs briefly."
            : "This farm has no water meter. The figure above is estimated from spray runtime."
        }
      />
    </SectionCard>
  );
}
