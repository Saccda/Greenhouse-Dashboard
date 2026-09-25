"use client";
/**
 * HMI › equipment detail — ISA-101's Level 3.
 *
 * The hierarchy the standard describes is Level 1 plant overview, Level 2 unit,
 * Level 3 equipment detail, Level 4 diagnostic. The other views are 1 and 2;
 * this is 3, reached the way a real faceplate is reached — by clicking the
 * thing itself on the process diagram, not by hunting a menu.
 *
 * It answers the questions the overview deliberately does not have room for:
 * how long has it been in this state, how often has it cycled today, how much
 * has it run, and what has it complained about.
 *
 * Every figure here is derived from stored channel history. Where a number
 * cannot be computed it says so rather than showing a zero — on a maintenance
 * screen, "0 starts" and "we have no data" lead to opposite decisions, and a
 * confident zero is the more dangerous of the two.
 */
import { useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { swrFetcher } from "@/lib/api";
import { HMI } from "@/components/hmi2/tokens";
import type { HistoryResponse, LatestResponse, WaterResponse } from "@/types";

interface Spec {
  name: string;
  kind: string;
  channel?: string;
  /** What it is, in a sentence, for whoever inherits this. */
  note: string;
  detail: [string, string][];
}

const EQUIPMENT: Record<string, Spec> = {
  "FM-01": {
    name: "Water meter",
    kind: "Instrument",
    note: "On the mains inlet, so it measures what the whole system draws from supply. Publishes a daily total rather than a live rate.",
    detail: [
      ["Service", "Mains inlet"],
      ["Reports", "Start / end totalizer and daily consumption"],
      ["Unit", "Cubic metres"],
      ["Cadence", "About once a day"],
    ],
  },
  "T-01": {
    name: "Storage tank",
    kind: "Vessel",
    note: "Bulk water storage, upstream of the chilled tank. No level instrument is fitted, so level is not shown anywhere — a level we do not measure would be invented.",
    detail: [["Service", "Raw water storage"], ["Level sensor", "Not fitted"]],
  },
  "T-02": {
    name: "Chilled water tank",
    kind: "Vessel",
    note: "Insulated tank with a copper coil inside. The coil is the heat exchanger the chiller drives; CH4 running is what cools the water the nozzles then spray.",
    detail: [["Service", "Chilled water"], ["Internal", "Copper coil heat exchanger"], ["Level sensor", "Not fitted"]],
  },
  "F-01": {
    name: "Inline filter",
    kind: "Inline",
    note: "Between the chilled tank and the pump. Not instrumented, so a blocking filter shows up indirectly — as spray runtime rising for the same water used.",
    detail: [["Service", "Particulate"], ["Differential pressure", "Not instrumented"]],
  },
  "P-01": {
    name: "Circulation pump",
    kind: "Rotating",
    channel: "CH2",
    note: "Drives water from the chilled tank through the filter to the misting header. Its channel is the same one that makes the nozzles spray, so pump runtime and spray time are the same figure.",
    detail: [["Driven by", "CH2"], ["Service", "Misting supply"]],
  },
  "CH-01": {
    name: "Chiller",
    kind: "Rotating",
    channel: "CH4",
    note: "Cools the water in T-02 through the coil. Independent of spraying — the tank can be chilled while the nozzles are idle, which is the normal way to have cold water ready.",
    detail: [["Driven by", "CH4"], ["Service", "Chilled water"]],
  },
  "CP-01": {
    name: "Control panel",
    kind: "Electrical",
    channel: "CH1",
    note: "System enable. With CH1 off, the other channels should not act, so a channel reporting ON while CH1 is OFF is worth investigating.",
    detail: [["Driven by", "CH1"], ["Service", "System enable"]],
  },
};

export default function EquipmentDetail({ params }: { params: { tag: string } }) {
  const tag = decodeURIComponent(params.tag);
  const spec = EQUIPMENT[tag];

  const { data: latest, error } = useSWR<LatestResponse>(
    "/api/sensors/latest?farm=campus", swrFetcher, { refreshInterval: 10_000 },
  );
  // 24 h of channel history is what the runtime and cycle figures come from.
  const { data: history } = useSWR<HistoryResponse>(
    spec?.channel ? "/api/sensors/history?farm=campus&range=-24h" : null,
    swrFetcher, { refreshInterval: 120_000 },
  );
  // The meter's daily ledger lives here rather than on the Dashboard: a row
  // per day is detail, and detail is what Level 3 is for.
  const { data: water } = useSWR<WaterResponse>(
    tag === "FM-01" ? "/api/sensors/water?farm=campus" : null,
    swrFetcher, { refreshInterval: 300_000 },
  );

  const stale = !!error || (latest ? !latest.is_online : true);
  const relay = latest?.relays?.find((r) => r.key === spec?.channel);
  const state = stale ? "UNKNOWN" : relay?.state ?? "—";

  const stats = useMemo(() => {
    if (!spec?.channel) return null;
    const points = history?.series?.[spec.channel] ?? [];
    if (points.length < 2) return null;

    // Starts are OFF->ON transitions; runtime is the time spent at ON, summed
    // over the samples. Both are approximations bounded by the sample interval,
    // which is stated rather than hidden — a runtime quoted to the minute from
    // five-minute samples would be a false precision.
    let starts = 0;
    let onMs = 0;
    let prev: { t: number; v: number } | null = null;
    for (const p of points) {
      const v = p.value ?? 0;
      const t = new Date(p.time).getTime();
      if (prev) {
        if (prev.v < 0.5 && v >= 0.5) starts++;
        if (prev.v >= 0.5) onMs += t - prev.t;
      }
      prev = { t, v };
    }
    const spanMs = new Date(points[points.length - 1].time).getTime() - new Date(points[0].time).getTime();
    const gaps = points.length > 1 ? spanMs / (points.length - 1) : 0;
    return {
      starts,
      onMinutes: onMs / 60000,
      dutyPct: spanMs > 0 ? (onMs / spanMs) * 100 : 0,
      samples: points.length,
      intervalMin: gaps / 60000,
    };
  }, [spec, history]);

  if (!spec) {
    return (
      <Centered>
        <span>Unknown tag “{tag}”.</span>
        <Link href="/hmi/process" className="block mt-3 text-[12px] underline" style={{ color: HMI.inkMuted }}>
          Back to the overview
        </Link>
      </Centered>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-auto">
      <div
        className="flex items-center gap-4 px-4 py-2.5 shrink-0"
        style={{ backgroundColor: HMI.panel, borderBottom: "1px solid " + HMI.line }}
      >
        <Link
          href="/hmi/process"
          className="flex items-center gap-1.5 text-[11px] tracking-widest opacity-70 hover:opacity-100 transition-opacity"
          style={{ color: HMI.inkMuted }}
        >
          <ArrowLeft size={13} /> DIAGRAM
        </Link>
        <div className="flex items-baseline gap-3">
          <span className="text-[15px] font-bold font-mono-num tracking-wider" style={{ color: HMI.ink }}>
            {tag}
          </span>
          <span className="text-[12px]" style={{ color: HMI.inkMuted }}>{spec.name}</span>
          <span className="text-[10px] tracking-widest uppercase" style={{ color: HMI.inkFaint }}>
            {spec.kind}
          </span>
        </div>
        {spec.channel && (
          <span
            className="ml-auto px-3 py-1 text-[11px] font-bold tracking-widest"
            style={{
              backgroundColor: state === "ON" ? HMI.on : "transparent",
              color: state === "ON" ? HMI.bg : stale ? HMI.warn : HMI.inkFaint,
              border: "1px solid " + (stale ? HMI.warn : HMI.line),
            }}
          >
            {spec.channel} {state}
          </span>
        )}
      </div>

      <div className="p-3 space-y-3">
        <p className="text-[12px] leading-relaxed max-w-3xl px-3 py-2" style={{ color: HMI.inkMuted, backgroundColor: HMI.panel }}>
          {spec.note}
        </p>

        {spec.channel && (
          <>
            <Label>Last 24 hours</Label>
            {stats ? (
              <>
                <div className="grid grid-cols-4 gap-px">
                  <Tile label="Starts" value={String(stats.starts)} />
                  <Tile label="Run time" value={fmtMinutes(stats.onMinutes)} />
                  <Tile label="Duty" value={stats.dutyPct.toFixed(1) + " %"} />
                  <Tile label="Samples" value={String(stats.samples)} />
                </div>
                <p className="text-[11px] px-3" style={{ color: HMI.inkFaint }}>
                  Derived from stored channel history at about one sample every{" "}
                  {stats.intervalMin < 1
                    ? Math.round(stats.intervalMin * 60) + " s"
                    : stats.intervalMin.toFixed(1) + " min"}
                  . Run time and duty are accurate to roughly that interval, not to the minute.
                </p>
              </>
            ) : (
              <p className="text-[12px] px-3 py-2" style={{ color: HMI.warn, backgroundColor: HMI.panel }}>
                Not enough stored history to compute starts or run time. This is a statement about the
                record, not about the equipment — it has not necessarily been idle.
              </p>
            )}
          </>
        )}

        {tag === "FM-01" && water?.has_meter && water.readings.length > 0 && (
          <>
            <Label>Daily record</Label>
            <table className="w-full text-[12px] border-separate border-spacing-0">
              <thead>
                <tr>
                  {["Date", "Start", "End", `Used (${water.unit_label})`, "Used (L)", ""].map((h, i) => (
                    <th key={i}
                        className="text-left font-semibold text-[10px] uppercase tracking-widest px-3 py-2"
                        style={{ backgroundColor: HMI.panelAlt, color: HMI.inkMuted,
                                 borderBottom: "1px solid " + HMI.line }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {water.readings.map((r) => (
                  <tr key={r.timestamp}>
                    <Td mono>{new Date(r.timestamp).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</Td>
                    <Td mono muted>{r.start_totalizer ?? "—"}</Td>
                    <Td mono muted>{r.last_totalizer ?? "—"}</Td>
                    <Td mono>{r.consumption ?? "—"}</Td>
                    <Td mono muted>{r.consumption_liters != null ? Math.round(r.consumption_liters) : "—"}</Td>
                    <Td>
                      {r.meter_reset && (
                        <span style={{ color: HMI.warn }} className="text-[10px] font-bold tracking-wide">
                          METER RESET
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <Label>Specification</Label>
        <div>
          {spec.detail.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between px-3 py-2 mb-px" style={{ backgroundColor: HMI.panel }}>
              <span className="text-[11px]" style={{ color: HMI.inkMuted }}>{k}</span>
              <span className="text-[12px]" style={{ color: HMI.ink }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function fmtMinutes(m: number) {
  if (m < 1) return Math.round(m * 60) + " s";
  if (m < 60) return m.toFixed(1) + " min";
  return (m / 60).toFixed(1) + " h";
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold tracking-[0.2em] uppercase px-3" style={{ color: HMI.inkFaint }}>
      {children}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3" style={{ backgroundColor: HMI.panel }}>
      <div className="text-[9px] tracking-widest uppercase mb-1" style={{ color: HMI.inkFaint }}>{label}</div>
      <div className="text-xl font-mono-num font-semibold tabular-nums" style={{ color: HMI.ink }}>{value}</div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full grid place-items-center text-center px-6">
      <p className="text-[13px] tracking-wide" style={{ color: HMI.inkFaint }}>{children}</p>
    </div>
  );
}

function Td({ children, mono, muted }: { children: React.ReactNode; mono?: boolean; muted?: boolean }) {
  return (
    <td
      className={mono ? "px-3 py-2 font-mono-num tabular-nums" : "px-3 py-2"}
      style={{ color: muted ? HMI.inkFaint : HMI.ink, borderBottom: "1px solid " + HMI.line }}
    >
      {children}
    </td>
  );
}
