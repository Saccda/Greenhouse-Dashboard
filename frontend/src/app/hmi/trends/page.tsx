"use client";
/**
 * HMI › Trends & History — also no mimic.
 *
 * A trend answers the question a live value cannot: is this climbing, and how
 * fast. Alarm limits are drawn as lines on the chart so "outside band" is a
 * position on screen rather than a number to compare in your head.
 *
 * Deliberately plain. No gradient fills, no area shading, no smoothing — a
 * smoothed process trend is a trend that has had its spikes removed, and the
 * spikes are the part worth seeing.
 */
import { useState } from "react";
import useSWR from "swr";
import {
  Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";

import { swrFetcher } from "@/lib/api";
import { HMI } from "@/components/hmi2/tokens";
import type { HistoryResponse } from "@/types";

type StoredZones = Record<string, { low: number; high: number; updated_at: string }>;

const RANGES = [
  { value: "-6h", label: "6 h" },
  { value: "-24h", label: "24 h" },
  { value: "-7d", label: "7 days" },
];

export default function HmiTrends() {
  const [range, setRange] = useState("-24h");

  const { data, isLoading } = useSWR<HistoryResponse>(
    `/api/sensors/history?farm=campus&range=${range}`, swrFetcher, { refreshInterval: 60_000 },
  );
  const { data: zones } = useSWR<StoredZones>("/api/campus/setpoint", swrFetcher);

  // Two series against one time axis. Merged by timestamp rather than plotted
  // from separate arrays so a gap in one does not shift the other.
  const merged = (() => {
    const byTime = new Map<string, { t: string; temperature?: number; humidity?: number }>();
    for (const [field, points] of Object.entries(data?.series ?? {})) {
      for (const p of points) {
        const row = byTime.get(p.time) ?? { t: p.time };
        if (field === "temperature") row.temperature = p.value ?? undefined;
        if (field === "humidity") row.humidity = p.value ?? undefined;
        byTime.set(p.time, row);
      }
    }
    return [...byTime.values()].sort((a, b) => a.t.localeCompare(b.t));
  })();

  const hasData = merged.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ borderBottom: "1px solid " + HMI.line }}>
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className="px-3 py-1 text-[11px] font-semibold tracking-wide"
            style={{
              backgroundColor: range === r.value ? HMI.panelAlt : "transparent",
              color: range === r.value ? HMI.ink : HMI.inkMuted,
              border: "1px solid " + (range === r.value ? HMI.line : "transparent"),
            }}
          >
            {r.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] font-mono-num" style={{ color: HMI.inkFaint }}>
          {isLoading ? "loading…" : `${merged.length} points · ${data?.aggregation ?? ""}`}
        </span>
      </div>

      {!hasData && !isLoading ? (
        <div className="flex-1 grid place-items-center">
          <p className="text-[13px]" style={{ color: HMI.inkFaint }}>
            No readings stored for this range. The campus feed has been intermittent.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col p-3 gap-3">
          <TrendPanel
            title="Temperature"
            unit="°C"
            data={merged}
            dataKey="temperature"
            band={zones?.["1"]}
            domain={[15, 45]}
          />
          <TrendPanel
            title="Humidity"
            unit="%"
            data={merged}
            dataKey="humidity"
            band={zones?.["3"]}
            domain={[0, 100]}
          />
        </div>
      )}
    </div>
  );
}

function TrendPanel({
  title, unit, data, dataKey, band, domain,
}: {
  title: string;
  unit: string;
  data: { t: string; temperature?: number; humidity?: number }[];
  dataKey: "temperature" | "humidity";
  band?: { low: number; high: number };
  domain: [number, number];
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ backgroundColor: HMI.panel }}>
      <div className="flex items-baseline justify-between px-3 py-2 shrink-0">
        <span className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: HMI.inkMuted }}>
          {title}
        </span>
        <span className="text-[10px] font-mono-num" style={{ color: HMI.inkFaint }}>
          {band ? `band ${band.low}–${band.high} ${unit}` : "no band set"}
        </span>
      </div>
      <div className="flex-1 min-h-0 px-1 pb-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={HMI.line} strokeDasharray="2 4" vertical={false} />
            {/* The target band as a quiet region. Being inside it is the absence
                of a signal, not a signal of its own. */}
            {band && (
              <ReferenceArea y1={band.low} y2={band.high} fill={HMI.panelAlt} fillOpacity={1} stroke="none" />
            )}
            <XAxis
              dataKey="t"
              tick={{ fill: HMI.inkFaint, fontSize: 10 }}
              tickFormatter={(t: string) =>
                new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              }
              stroke={HMI.line}
              minTickGap={40}
            />
            <YAxis
              domain={domain}
              tick={{ fill: HMI.inkFaint, fontSize: 10 }}
              stroke={HMI.line}
              width={34}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: HMI.panelAlt,
                border: "1px solid " + HMI.line,
                borderRadius: 0,
                fontSize: 12,
              }}
              labelStyle={{ color: HMI.inkMuted }}
              itemStyle={{ color: HMI.ink }}
              labelFormatter={(t: string) => new Date(t).toLocaleString()}
              formatter={(v: number) => [v?.toFixed(1) + " " + unit, title]}
            />
            <Line
              type="linear"
              dataKey={dataKey}
              stroke={HMI.ink}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
