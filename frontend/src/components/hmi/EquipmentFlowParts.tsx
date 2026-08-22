import type { RelayStatus } from "@/types";

// Shared building blocks for the animated equipment-flow overlay used by both
// EquipmentMimic (Control page) and SystemFlowDiagram (Overview page) — both
// gate the animation on the same live relay1/relay3 state so "system is on"
// means the same thing in both places.
// Kept here so the two stay visually identical without duplicating SVG/animation logic.

export function isRelayOn(relays: RelayStatus[], key: string): boolean {
  return relays.find(r => r.key === key)?.state === "ON";
}

/** Centerlines traced from the source SVG's own pipe geometry (path rectangles resolved
 *  through their transform stack, 1440x810 space scaled x4/3) so beads travel exactly along
 *  the real drawn pipe. Shared by both the live and static diagrams since they use the same
 *  1920x1080 photo. Direction matters for animateMotion: the pump is the pressure source, so
 *  its discharge line runs pump -> spraying system, while the tank line is suction, tank -> pump. */
export const SPRAY_PUMP_PATH   = "M796,725 L796,651 L305,651 L305,476";
export const TANK_PUMP_PATH    = "M925,465 L925,810 L814,810";
export const TANK_CONTROL_PATH = "M1556,356 L1028,356";

/** Beads travelling along `path` — the "flow in/out" cue for a pipe run. Renders nothing when inactive. */
export function FlowDots({
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
export function SprayDroplets({ active }: { active: boolean }) {
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
export function PilotLamp({ cx, cy, r = 20, on, label }: { cx: number; cy: number; r?: number; on: boolean; label?: string }) {
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

/** Shared <defs> — gradients for the flow beads/droplets/lamps, plus the pulse/drip keyframes. */
export function EquipmentFlowDefs() {
  return (
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
  );
}
