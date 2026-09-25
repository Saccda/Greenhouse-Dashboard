"use client";
/**
 * HMI › Process Diagram — the view that carries the mimic.
 *
 * The mimic is a hand-drawn P&ID of this system, not the 3D model. A schematic
 * is what a plant overview wants: it shows what connects to what, which way
 * the water is going and what is running, with nothing in the frame that is
 * not load-bearing. The CAD model answers a different question — what it
 * physically looks like — and now has its own view rather than competing for
 * this one.
 *
 * Process graphic centre, instruments flanking. Identity, state and alarms all
 * live in the shell (layout.tsx) so they are identical on every view rather
 * than redrawn per page.
 *
 * Rules this view follows, which are not the dashboard's rules:
 *   - everything normal is grey; colour is spent only on abnormal
 *   - nothing moves unless it needs attention
 *   - a value is shown against its SETPOINT, because 31.4 on its own says
 *     nothing about whether 31.4 is fine
 *   - unknown is drawn as loudly as off
 */
import useSWR from "swr";

import { swrFetcher } from "@/lib/api";
import { HMI } from "@/components/hmi2/tokens";
import DeviationBar from "@/components/hmi2/DeviationBar";
import ChannelStack from "@/components/hmi2/ChannelStack";
import CampusPID from "@/components/hmi2/CampusPID";
import type { HistoryResponse, LatestResponse, WaterResponse } from "@/types";

type StoredZones = Record<string, { low: number; high: number; updated_at: string }>;

const CHANNEL_LABELS: Record<string, string> = {
  CH1: "System enable",
  CH2: "Spraying",
  CH3: "Not assigned",
  CH4: "Cooling",
  CH5: "Not assigned",
  CH6: "Not assigned",
  CH7: "Not assigned",
  CH8: "Not assigned",
};

export default function HmiProcess() {
  const { data: latest, error } = useSWR<LatestResponse>(
    "/api/sensors/latest?farm=campus", swrFetcher, { refreshInterval: 10_000 },
  );
  const { data: zones } = useSWR<StoredZones>(
    "/api/campus/setpoint", swrFetcher, { refreshInterval: 30_000 },
  );
  const { data: water } = useSWR<WaterResponse>(
    "/api/sensors/water?farm=campus", swrFetcher, { refreshInterval: 300_000 },
  );
  // Six hours is enough to see a trend without turning the sparkline into a
  // smear. The Trends view carries the longer ranges.
  const { data: history } = useSWR<HistoryResponse>(
    "/api/sensors/history?farm=campus&range=-6h", swrFetcher, { refreshInterval: 120_000 },
  );

  const tail = (field: string, n = 60) =>
    (history?.series?.[field] ?? []).slice(-n).map((p) => p.value ?? null);

  const stale = !!error || (latest ? !latest.is_online : true);
  const temp = latest?.readings?.temperature?.value;
  const hum = latest?.readings?.humidity?.value;

  // The midpoint of the controller's low/high band is the closest thing campus
  // has to a setpoint — it switches on a band, not on a target.
  const tempTarget = zones?.["1"] ? (zones["1"].low + zones["1"].high) / 2 : null;
  const humTarget = zones?.["3"] ? (zones["3"].low + zones["3"].high) / 2 : null;
  const tempBand = zones?.["1"] ? (zones["1"].high - zones["1"].low) / 2 : 1;
  const humBand = zones?.["3"] ? (zones["3"].high - zones["3"].low) / 2 : 10;

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-60 shrink-0 p-3 overflow-y-auto" style={{ borderRight: "1px solid " + HMI.line }}>
        <SectionLabel>Channels</SectionLabel>
        <ChannelStack relays={latest?.relays ?? []} labels={CHANNEL_LABELS} stale={stale} />
      </aside>

      <main className="flex-1 min-w-0 relative">
        <CampusPID
          relays={latest?.relays ?? []}
          temp={temp}
          hum={hum}
          meterTotal={water?.readings?.[0]?.last_totalizer ?? null}
          meterUnit={water?.unit_label ?? "m³"}
          stale={stale}
        />
      </main>

      <aside className="w-72 shrink-0 p-3 overflow-y-auto" style={{ borderLeft: "1px solid " + HMI.line }}>
        <SectionLabel>Process values</SectionLabel>
        <DeviationBar
          label="Temperature"
          value={temp}
          unit="°C"
          target={tempTarget}
          warnBand={tempBand}
          alarmBand={tempBand * 2}
          min={15}
          max={45}
          history={tail("temperature")}
          band={zones?.["1"] ?? null}
        />
        <DeviationBar
          label="Humidity"
          value={hum}
          unit="%"
          target={humTarget}
          warnBand={humBand}
          alarmBand={humBand * 2}
          min={0}
          max={100}
          history={tail("humidity")}
          band={zones?.["3"] ?? null}
        />
        <SectionLabel>Control band</SectionLabel>
        <BandRow label="Zone 1 temp" z={zones?.["1"]} unit="°C" />
        <BandRow label="Zone 2 temp" z={zones?.["2"]} unit="°C" />
        <BandRow label="Zone 3 hum" z={zones?.["3"]} unit="%" />
      </aside>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold tracking-[0.2em] uppercase mb-2 mt-1" style={{ color: HMI.inkFaint }}>
      {children}
    </div>
  );
}

function BandRow({ label, z, unit }: { label: string; z?: { low: number; high: number }; unit: string }) {
  return (
    <div className="flex items-baseline justify-between px-3 py-2 mb-px" style={{ backgroundColor: HMI.panel }}>
      <span className="text-[11px]" style={{ color: HMI.inkMuted }}>
        {label}
      </span>
      <span className="text-[12px] font-mono-num tabular-nums" style={{ color: z ? HMI.ink : HMI.inkFaint }}>
        {z ? z.low + " – " + z.high + " " + unit : "not set"}
      </span>
    </div>
  );
}
