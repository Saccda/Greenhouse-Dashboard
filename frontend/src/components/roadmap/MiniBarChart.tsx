"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface MiniBarChartProps {
  data:          { label: string; value: number }[];
  color?:        string;
  unit?:         string;
  height?:       number;
  highlightLast?: boolean;
}

export default function MiniBarChart({
  data, color = "#38bdf8", unit = "", height = 200, highlightLast = false,
}: MiniBarChartProps) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(80,140,255,0.15)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "JetBrains Mono" }}
            axisLine={{ stroke: "rgba(80,140,255,0.15)" }}
            tickLine={false}
          />
          <YAxis tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} width={30} />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="bg-surface-card border border-surface-border rounded-lg px-3 py-2 text-xs shadow-xl">
                  <p className="text-slate-400 mb-0.5">{label}</p>
                  <p className="font-mono-num font-semibold" style={{ color }}>{payload[0].value as number}{unit}</p>
                </div>
              ) : null
            }
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={d.label} fillOpacity={highlightLast && i === data.length - 1 ? 1 : 0.55} fill={color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
