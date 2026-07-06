"use client";
import type { RelayStatus } from "@/types";

interface Props {
  relays:   RelayStatus[];
  temp?:    number;
  hum?:     number;
}

/** Beads travelling along `path` — the "flow in/out" cue for a pipe run. Renders nothing when inactive. */
function FlowDots({
  path, active, count = 4, duration = 1.8, radius = 6,
}: {
  path: string; active: boolean; count?: number; duration?: number; radius?: number;
}) {
  if (!active) return null;
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <circle key={i} r={radius} fill="url(#eq-dot)" stroke="#123e91" strokeWidth="1">
          <animateMotion dur={`${duration}s`} begin={`${(i * duration) / count}s`}
            repeatCount="indefinite" path={path} />
        </circle>
      ))}
    </>
  );
}

/** Falling water droplets over the spraying system photo — replaces the source artwork's old
 *  static droplet decoration (removed upstream) with a live one gated on the spray pump relay. */
function SprayDroplets({ active }: { active: boolean }) {
  if (!active) return null;
  const xs = [175, 205, 235, 265];
  return (
    <>
      {xs.map((x, i) => (
        <g key={x} transform={`translate(${x},250)`}>
          <path
            d="M0,-9 C4,-3 7,2 7,5.5 A7,7 0 1,1 -7,5.5 C-7,2 -4,-3 0,-9 Z"
            fill="url(#eq-dot)" stroke="#1650c9" strokeWidth="0.5"
            style={{ animation: `eq-drip 1.6s ease-in ${i * 0.4}s infinite` }}
          />
        </g>
      ))}
    </>
  );
}

/** Glossy pilot-lamp indicator, styled after a physical HMI panel light — red = off, green = on. */
function PilotLamp({ cx, cy, r = 20, on, label }: { cx: number; cy: number; r?: number; on: boolean; label?: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 9} fill={on ? "#22c55e" : "#ef4444"} opacity="0.22" className="eq-pulse" />
      <circle cx={cx} cy={cy} r={r} fill={`url(#lamp-${on ? "green" : "red"})`}
        stroke={on ? "#0f5c2e" : "#7a1512"} strokeWidth="1.5" />
      <ellipse cx={cx - r * 0.32} cy={cy - r * 0.38} rx={r * 0.4} ry={r * 0.25} fill="white" opacity="0.55" />
      {label && (
        <text x={cx} y={cy + r + 23} textAnchor="middle" fontSize="16" fontWeight="700"
          fontFamily="'Segoe UI',system-ui,sans-serif" fill="#3a4553"
          stroke="white" strokeWidth="4" paintOrder="stroke" letterSpacing="0.4">
          {label}
        </text>
      )}
    </g>
  );
}

function ReadoutCard({ temp, hum }: { temp?: number; hum?: number }) {
  const tempHigh = (temp ?? 0) > 35;
  const tempWarn = (temp ?? 0) > 30 && !tempHigh;
  const tempColor = tempHigh ? "#ef4444" : tempWarn ? "#eab308" : "#f97316";
  const humColor = (hum ?? 0) > 85 ? "#ef4444" : "#38bdf8";
  return (
    <g>
      <rect x="250" y="392" width="240" height="98" rx="10" fill="white" stroke="#d7e0ea" strokeWidth="2" />
      <line x1="266" y1="441" x2="474" y2="441" stroke="#eef1f5" strokeWidth="1.5" />

      <circle cx="272" cy="418" r="5" fill={tempColor} />
      <text x="286" y="423" fontSize="14" fontWeight="600" letterSpacing="0.5" fontFamily="'Segoe UI',system-ui,sans-serif" fill="#5b6b7c">TEMPERATURE</text>
      <text x="478" y="425" fontSize="23" fontWeight="700" textAnchor="end" fontFamily="'Segoe UI',system-ui,sans-serif" fill={tempColor}>
        {temp != null ? `${temp.toFixed(1)}°` : "--"}
      </text>

      <circle cx="272" cy="466" r="5" fill={humColor} />
      <text x="286" y="471" fontSize="14" fontWeight="600" letterSpacing="0.5" fontFamily="'Segoe UI',system-ui,sans-serif" fill="#5b6b7c">HUMIDITY</text>
      <text x="478" y="473" fontSize="23" fontWeight="700" textAnchor="end" fontFamily="'Segoe UI',system-ui,sans-serif" fill={humColor}>
        {hum != null ? `${Math.round(hum)}%` : "--"}
      </text>
    </g>
  );
}

export default function EquipmentMimic({ relays, temp, hum }: Props) {
  const r1On = relays.find(r => r.key === "relay1")?.state === "ON";
  const r3On = relays.find(r => r.key === "relay3")?.state === "ON";

  // Centerlines traced from the source SVG's own pipe geometry (path rectangles resolved
  // through their transform stack, 1440x810 space scaled x4/3) so beads travel exactly along
  // the real drawn pipe. The pipe artwork itself is the untouched original — only its static
  // dots were removed (patched with the pipe's own fill color) to make room for these.
  // Direction matters for animateMotion: the pump is the pressure source, so its discharge
  // line runs pump -> spraying system, while the tank line is suction, tank -> pump.
  const sprayPumpPath = "M796,725 L796,651 L305,651 L305,476";
  const tankPumpPath   = "M925,465 L925,810 L814,810";
  const tankControlPath = "M1556,356 L1028,356";

  return (
    <div className="relative w-full rounded-xl overflow-hidden border p-3"
      style={{ backgroundColor: "#ffffff", borderColor: "var(--hmi-bd)" }}>
      <div className="relative w-full" style={{ aspectRatio: "1920 / 1080" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hmi-equipment.png" alt="Greenhouse equipment — spraying system, cooling tank, spray pump, control system"
          className="absolute inset-0 w-full h-full" style={{ objectFit: "contain" }} />
        <svg viewBox="0 0 1920 1080" className="absolute inset-0 w-full h-full">
          <defs>
            <style>{`
              @keyframes eq-pulse { 0%,100% { opacity: 0.22; } 50% { opacity: 0.02; } }
              @keyframes eq-drip {
                0%   { transform: translateY(0px);  opacity: 0;   }
                14%  {                              opacity: 1;   }
                84%  {                              opacity: 0.8; }
                100% { transform: translateY(38px); opacity: 0;   }
              }
              .eq-pulse { animation: eq-pulse 1.8s ease-in-out infinite; }
              @media (prefers-reduced-motion: reduce) {
                .eq-pulse { animation: none; }
              }
            `}</style>
            <radialGradient id="eq-dot" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#dbeeff" />
              <stop offset="55%" stopColor="#4f9fe8" />
              <stop offset="100%" stopColor="#1650c9" />
            </radialGradient>
            <radialGradient id="lamp-red" cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#ffb3b0" />
              <stop offset="45%" stopColor="#ef4444" />
              <stop offset="100%" stopColor="#7a1512" />
            </radialGradient>
            <radialGradient id="lamp-green" cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#baf7ce" />
              <stop offset="45%" stopColor="#22c55e" />
              <stop offset="100%" stopColor="#0f5c2e" />
            </radialGradient>
          </defs>

          <SprayDroplets active={r3On} />

          <FlowDots path={sprayPumpPath} active={r3On} count={4} duration={2.0} radius={13} />
          <FlowDots path={tankPumpPath} active={r3On} count={3} duration={1.5} radius={13} />
          <FlowDots path={tankControlPath} active={r1On} count={6} duration={2.6} radius={13} />

          {/* halo around the pump photo itself when running — the photo stays untouched */}
          {r3On && (
            <rect x="550" y="668" width="395" height="250" rx="16" fill="none" stroke="#22c55e" strokeWidth="3" opacity="0.5" className="eq-pulse" />
          )}

          {/* live temperature / humidity readout, replacing the static placeholder */}
          <ReadoutCard temp={temp} hum={hum} />

          <PilotLamp cx={1100} cy={245} r={25} on={r1On} label="COOLING" />
          <PilotLamp cx={497} cy={794} r={25} on={r3On} label="PUMP" />
          <PilotLamp cx={1715} cy={660} r={28} on={r1On || r3On} label="CONTROLLER" />
        </svg>
      </div>
    </div>
  );
}
