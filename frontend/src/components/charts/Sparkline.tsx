"use client";
/** Small inline trend sparkline — circular-buffer style live readout, not a full chart. */
export default function Sparkline({ data, label, unit, hiColor }: {
  data: number[]; label: string; unit: string; hiColor: string;
}) {
  const id = `sg-${label.replace(/\W/g, "").toLowerCase()}`;
  if (data.length < 2) {
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            {label}
          </span>
        </div>
        <div className="h-12 flex items-center justify-center text-xs font-mono-num text-slate-400">
          Awaiting data…
        </div>
      </div>
    );
  }
  const W = 200, H = 48;
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const range = (hi - lo) || 1;
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const arrow = last > prev + 0.1 ? "↑" : last < prev - 0.1 ? "↓" : "→";
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * W},${H - ((v - lo) / range) * H}`
  ).join(" ");
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          {label}
        </span>
        <span className="text-sm font-mono-num font-bold" style={{ color: hiColor }}>
          {last.toFixed(1)}{unit} {arrow}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12" preserveAspectRatio="none">
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={hiColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={hiColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`M0,${H} ${pts} ${W},${H} Z`} fill={`url(#${id})`} />
        <polyline points={pts} fill="none" stroke={hiColor} strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx={W} cy={H - ((last - lo) / range) * H} r="2.5" fill={hiColor} />
      </svg>
    </div>
  );
}
