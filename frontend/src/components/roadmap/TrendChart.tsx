"use client";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export interface TrendSeries {
  key:      string;
  name:     string;
  color:    string;
  unit?:    string;
  axis?:    "left" | "right";
  variant?: "line" | "area";
}

interface TrendChartProps {
  data:   Record<string, number | string>[];
  series: TrendSeries[];
  xKey?:  string;
  height?: number;
}

function ChartTooltip({ active, payload, label, series }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-card border border-surface-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1.5">{label}</p>
      {payload.map((p: any) => {
        const s = series.find((s: TrendSeries) => s.key === p.dataKey);
        return (
          <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-slate-300">{s?.name ?? p.dataKey}:</span>
            <span className="font-mono-num font-semibold" style={{ color: p.color }}>
              {typeof p.value === "number" ? p.value.toFixed(1) : p.value}{s?.unit ?? ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function TrendChart({ data, series, xKey = "label", height = 220 }: TrendChartProps) {
  const hasRight = series.some((s) => s.axis === "right");
  const leftColor  = series.find((s) => s.axis !== "right")?.color ?? "#8b9eb3";
  const rightColor = series.find((s) => s.axis === "right")?.color ?? "#8b9eb3";

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: hasRight ? 8 : 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(80,140,255,0.15)" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "JetBrains Mono" }}
            axisLine={{ stroke: "rgba(80,140,255,0.15)" }}
            tickLine={false}
            minTickGap={30}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: leftColor, fontSize: 10, fontFamily: "JetBrains Mono" }}
            axisLine={false}
            tickLine={false}
            width={34}
          />
          {hasRight && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: rightColor, fontSize: 10, fontFamily: "JetBrains Mono" }}
              axisLine={false}
              tickLine={false}
              width={34}
            />
          )}
          <Tooltip content={<ChartTooltip series={series} />} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#8b9eb3" }} />
          {series.map((s) =>
            s.variant === "area" ? (
              <Area
                key={s.key}
                yAxisId={s.axis === "right" ? "right" : "left"}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.18}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            ) : (
              <Line
                key={s.key}
                yAxisId={s.axis === "right" ? "right" : "left"}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            )
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
