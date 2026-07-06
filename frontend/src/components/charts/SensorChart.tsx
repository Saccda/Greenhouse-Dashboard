"use client";
/**
 * SensorChart — dual-axis line chart for temperature and humidity.
 * Relay state (relay3 / spray) is overlaid as a shaded background region.
 */
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { format, parseISO } from "date-fns";
import { clsx } from "clsx";
import type { TimePoint } from "@/types";

interface SensorChartProps {
  temperature?: TimePoint[];
  humidity?:    TimePoint[];
  relay3?:      TimePoint[];
  tempWarn?:    number;
  humWarn?:     number;
  isLoading?:   boolean;
  className?:   string;
}

type ChartPoint = {
  time:        number;   // epoch ms
  temperature?: number;
  humidity?:    number;
  relay3?:      number;
  sprayArea?:   number;  // 1 when relay3==1, else 0 (used for Area fill)
};

function mergeSeriesIntoPoints(
  temperature?: TimePoint[],
  humidity?:    TimePoint[],
  relay3?:      TimePoint[],
): ChartPoint[] {
  const map = new Map<number, ChartPoint>();

  const add = (series: TimePoint[] | undefined, key: keyof ChartPoint) => {
    series?.forEach(({ time, value }) => {
      const t = parseISO(time).getTime();
      const existing = map.get(t) ?? { time: t };
      (existing as any)[key] = value;
      map.set(t, existing);
    });
  };

  add(temperature, "temperature");
  add(humidity,    "humidity");
  add(relay3,      "relay3");

  const sorted = [...map.values()].sort((a, b) => a.time - b.time);

  // Fill sprayArea based on relay3 value
  sorted.forEach((p) => {
    p.sprayArea = (p.relay3 ?? 0) >= 0.5 ? 1 : 0;
  });

  return sorted;
}

// Custom tooltip
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const time = label ? format(new Date(label), "MMM d, HH:mm") : "";

  return (
    <div className="bg-surface-card border border-surface-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1.5">{time}</p>
      {payload.map((p: any) => {
        if (p.dataKey === "sprayArea") return null;
        return (
          <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: p.color }}
            />
            <span className="text-slate-300 capitalize">{p.dataKey}:</span>
            <span className="font-mono-num font-semibold" style={{ color: p.color }}>
              {typeof p.value === "number" ? p.value.toFixed(1) : p.value}
              {p.dataKey === "temperature" ? "°C" : p.dataKey === "humidity" ? "%" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function SensorChart({
  temperature,
  humidity,
  relay3,
  tempWarn,
  humWarn,
  isLoading = false,
  className,
}: SensorChartProps) {
  if (isLoading) {
    return (
      <div className={clsx("flex items-center justify-center h-64 rounded-xl bg-surface-card border border-surface-border animate-pulse", className)}>
        <span className="text-slate-600 text-sm">Loading chart…</span>
      </div>
    );
  }

  const data = mergeSeriesIntoPoints(temperature, humidity, relay3);

  if (data.length === 0) {
    return (
      <div className={clsx("flex items-center justify-center h-64 rounded-xl bg-surface-card border border-surface-border", className)}>
        <span className="text-slate-600 text-sm">No data available</span>
      </div>
    );
  }

  const xTickFormatter = (v: number) => format(new Date(v), "HH:mm");

  return (
    <div className={clsx("w-full h-72", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(80,140,255,0.15)"
            vertical={false}
          />

          {/* Spray active region */}
          <Area
            yAxisId="relay"
            dataKey="sprayArea"
            fill="#06b6d4"
            fillOpacity={0.07}
            stroke="none"
            isAnimationActive={false}
          />

          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={xTickFormatter}
            tick={{ fill: "#6b7280", fontSize: 11, fontFamily: "JetBrains Mono" }}
            axisLine={{ stroke: "rgba(80,140,255,0.15)" }}
            tickLine={false}
            minTickGap={60}
          />

          {/* Left Y axis: temperature */}
          <YAxis
            yAxisId="temp"
            domain={["auto", "auto"]}
            tick={{ fill: "#fb923c", fontSize: 11, fontFamily: "JetBrains Mono" }}
            axisLine={false}
            tickLine={false}
            width={36}
            tickFormatter={(v) => `${v}°`}
          />

          {/* Right Y axis: humidity */}
          <YAxis
            yAxisId="hum"
            orientation="right"
            domain={[0, 100]}
            tick={{ fill: "#60a5fa", fontSize: 11, fontFamily: "JetBrains Mono" }}
            axisLine={false}
            tickLine={false}
            width={36}
            tickFormatter={(v) => `${v}%`}
          />

          {/* Hidden relay axis for area fill */}
          <YAxis yAxisId="relay" domain={[0, 1]} hide />

          <Tooltip content={<CustomTooltip />} />

          <Legend
            wrapperStyle={{ fontSize: 11, color: "#8b9eb3" }}
            formatter={(value) =>
              value === "temperature" ? "Temperature (°C)"
              : value === "humidity"    ? "Humidity (%)"
              : null
            }
          />

          {/* Warning reference lines */}
          {tempWarn != null && (
            <ReferenceLine
              yAxisId="temp"
              y={tempWarn}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
            />
          )}
          {humWarn != null && (
            <ReferenceLine
              yAxisId="hum"
              y={humWarn}
              stroke="#60a5fa"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
            />
          )}

          <Line
            yAxisId="temp"
            type="monotone"
            dataKey="temperature"
            stroke="#fb923c"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4, fill: "#fb923c" }}
            isAnimationActive={false}
          />

          <Line
            yAxisId="hum"
            type="monotone"
            dataKey="humidity"
            stroke="#60a5fa"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4, fill: "#60a5fa" }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
