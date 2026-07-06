"use client";
import type { RelayStatus } from "@/types";

interface Props {
  relays:   RelayStatus[];
  temp?:    number;
  hum?:     number;
  isOnline: boolean;
  farm:     string;
}

function SemiGauge({
  cx, cy, r, pct, color, label, display,
}: {
  cx: number; cy: number; r: number;
  pct: number; color: string; label: string; display: string;
}) {
  const arc = Math.PI * r;
  return (
    <g>
      <path d={`M${cx - r},${cy} A${r},${r} 0 0,1 ${cx + r},${cy}`}
        fill="none" stroke="var(--hmi-pipe)" strokeWidth="9" strokeLinecap="round" />
      <path d={`M${cx - r},${cy} A${r},${r} 0 0,1 ${cx + r},${cy}`}
        fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={`${Math.min(1, Math.max(0, pct)) * arc} ${arc}`} />
      <rect x={cx - 32} y={cy - 27} width="64" height="24" rx="3" fill="var(--hmi-bg)" />
      <text x={cx} y={cy - 10} textAnchor="middle" fill={color}
        fontSize="15" fontWeight="bold" fontFamily="'JetBrains Mono',monospace">
        {display}
      </text>
      <text x={cx} y={cy + 15} textAnchor="middle" fill="var(--hmi-txt)"
        fontSize="10" letterSpacing="1.6" fontFamily="'JetBrains Mono',monospace">
        {label}
      </text>
    </g>
  );
}

function TowerLight({ cx, cy, red, yellow, green }: {
  cx: number; cy: number; red: boolean; yellow: boolean; green: boolean;
}) {
  const lights = [
    { y: cy - 22, active: red,    on: "#ef4444", glow: "drop-shadow(0 0 6px #ef4444)" },
    { y: cy - 5,  active: yellow, on: "#eab308", glow: "drop-shadow(0 0 6px #eab308)" },
    { y: cy + 12, active: green,  on: "#22c55e", glow: "drop-shadow(0 0 6px #22c55e)" },
  ];
  return (
    <g>
      <text x={cx} y={cy - 38} textAnchor="middle" fill="var(--hmi-txt)"
        fontSize="9" letterSpacing="1.5" fontFamily="'JetBrains Mono',monospace">STATUS</text>
      <rect x={cx - 8} y={cy - 33} width="16" height="52" rx="3"
        fill="var(--hmi-inner)" stroke="var(--hmi-bd)" strokeWidth="1" />
      <rect x={cx - 10} y={cy + 19} width="20" height="5" rx="2" fill="var(--hmi-bd)" />
      {lights.map((l, i) => (
        <circle key={i} cx={cx} cy={l.y} r="6"
          fill={l.active ? l.on : "var(--hmi-off)"}
          stroke={l.active ? l.on : "var(--hmi-bd)"} strokeWidth="1"
          style={l.active ? { filter: l.glow } : {}} />
      ))}
    </g>
  );
}

/** Beads travelling along `path` — the "flow in/out" cue for a pipe run. Renders nothing when inactive. */
function FlowDots({
  path, active, count = 4, duration = 1.6, radius = 3.5,
}: {
  path: string; active: boolean; count?: number; duration?: number; radius?: number;
}) {
  if (!active) return null;
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <circle key={i} r={radius} fill="url(#pm-dot)" stroke="#1650c9" strokeWidth="0.5">
          <animateMotion dur={`${duration}s`} begin={`${(i * duration) / count}s`}
            repeatCount="indefinite" path={path} />
        </circle>
      ))}
    </>
  );
}

export default function ProcessMimic({ relays, temp, hum, isOnline, farm }: Props) {
  const r1On = relays.find(r => r.key === "relay1")?.state === "ON";
  const r2On = relays.find(r => r.key === "relay2")?.state === "ON";
  const r3On = relays.find(r => r.key === "relay3")?.state === "ON";

  const tempHigh = (temp ?? 0) > 35;
  const tempWarn = (temp ?? 0) > 30 && !tempHigh;

  const nozzleX = [215, 285, 355, 425, 495, 565, 635, 710];

  return (
    <div className="w-full rounded-xl overflow-hidden border"
      style={{ backgroundColor: "var(--hmi-bg)", borderColor: "var(--hmi-bd)" }}>
      <svg viewBox="0 0 960 310" style={{ display: "block", width: "100%" }}>
        <defs>
          <style>{`
            @keyframes pm-fan  { to { transform: rotate(360deg); } }
            @keyframes pm-pump { to { transform: rotate(360deg); } }
            @keyframes pm-drip {
              0%   { transform: translateY(0px);  opacity: 0;   }
              14%  {                              opacity: 1;   }
              84%  {                              opacity: 0.8; }
              100% { transform: translateY(34px); opacity: 0;   }
            }
            @keyframes pm-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
            .pm-fan  { animation: pm-fan  1.4s linear infinite; transform-origin: center; }
            .pm-pump { animation: pm-pump 0.9s linear infinite; transform-origin: center; }
            .pm-pulse { animation: pm-pulse 1.6s ease-in-out infinite; }
          `}</style>

          <linearGradient id="pm-tank" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="var(--hmi-inner)" />
            <stop offset="45%"  stopColor="#1d4ed8" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--hmi-inner)" />
          </linearGradient>
          <linearGradient id="pm-gh" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="var(--hmi-gh2)" />
            <stop offset="100%" stopColor="var(--hmi-gh)" />
          </linearGradient>
          <radialGradient id="pm-dot" cx="35%" cy="30%" r="70%">
            <stop offset="0%"   stopColor="#bfdbfe" />
            <stop offset="55%"  stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1650c9" />
          </radialGradient>
        </defs>

        {/* Background + grid */}
        <rect width="960" height="310" fill="var(--hmi-bg)" />
        {Array.from({ length: 20 }, (_, i) => (
          <line key={`gv${i}`} x1={i * 48} y1="0" x2={i * 48} y2="310"
            stroke="var(--hmi-grid)" strokeWidth="0.5" />
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <line key={`gh${i}`} x1="0" y1={i * 52} x2="960" y2={i * 52}
            stroke="var(--hmi-grid)" strokeWidth="0.5" />
        ))}

        {/* ══ COOLING UNIT (Relay 1) ══ */}

        {r1On && (
          <rect x="13" y="37" width="118" height="166" rx="8"
            fill="none" stroke="#2563eb" strokeWidth="1.5" opacity="0.4" />
        )}
        <rect x="16" y="40" width="112" height="160" rx="6"
          fill="var(--hmi-panel)" stroke={r1On ? "#1d4ed8" : "var(--hmi-bd)"} strokeWidth="1.5" />

        {[0,1,2,3,4,5,6,7].map(i => (
          <line key={i} x1="27" y1={54 + i * 12} x2="116" y2={54 + i * 12}
            stroke={r1On ? "#1d4ed8" : "var(--hmi-pipe)"} strokeWidth="4.5" strokeLinecap="round" />
        ))}

        <circle cx="72" cy="152" r="22" fill="var(--hmi-inner)"
          stroke={r1On ? "#1d4ed8" : "var(--hmi-bd)"} strokeWidth="1.5" />
        <g transform="translate(72,152)">
          <g className={r1On ? "pm-fan" : ""}>
            {[0, 90, 180, 270].map(a => (
              <ellipse key={a} cx="0" cy="-11" rx="5" ry="10"
                fill={r1On ? "#3b82f6" : "var(--hmi-pipe)"}
                transform={`rotate(${a})`} />
            ))}
            <circle cx="0" cy="0" r="4" fill={r1On ? "#93c5fd" : "var(--hmi-pipe)"} />
          </g>
        </g>

        <text x="72" y="193" textAnchor="middle" fill="var(--hmi-txt)"
          fontSize="9" letterSpacing="1.5" fontFamily="'JetBrains Mono',monospace">COOLING UNIT</text>
        <text x="72" y="206" textAnchor="middle" fill="#2563eb"
          fontSize="8" letterSpacing="1" fontFamily="'JetBrains Mono',monospace">RELAY 1</text>
        <circle cx="72" cy="218" r="5"
          fill={r1On ? "#22c55e" : "var(--hmi-inner)"} stroke={r1On ? "#4ade80" : "var(--hmi-bd)"} strokeWidth="1"
          style={r1On ? { filter: "drop-shadow(0 0 5px #22c55e)" } : {}} />
        <text x="72" y="233" textAnchor="middle"
          fill={r1On ? "#22c55e" : "var(--hmi-txt)"} fontSize="8" letterSpacing="1.5"
          fontFamily="'JetBrains Mono',monospace">
          {r1On ? "ACTIVE" : "STANDBY"}
        </text>

        {/* Air ducts → greenhouse */}
        <line x1="128" y1="88"  x2="162" y2="88"  stroke={r1On ? "#1d4ed8" : "var(--hmi-pipe)"} strokeWidth="7" strokeLinecap="round" />
        <line x1="128" y1="115" x2="162" y2="115" stroke={r1On ? "#1d4ed8" : "var(--hmi-pipe)"} strokeWidth="7" strokeLinecap="round" />
        <FlowDots path="M128,88 L162,88"   active={r1On} count={2} duration={0.5} radius={3} />
        <FlowDots path="M128,115 L162,115" active={r1On} count={2} duration={0.5} radius={3} />

        {/* ══ GREENHOUSE BAY ══ */}

        <rect x="162" y="18" width="650" height="272" rx="5"
          fill="url(#pm-gh)" stroke="var(--hmi-gh-bd)" strokeWidth="1.5" />
        <rect x="162" y="18" width="650" height="26" rx="5" fill="var(--hmi-gh-rf)" />
        <text x="487" y="35" textAnchor="middle"
          fill="#22c55e" fontSize="9.5" letterSpacing="2.5" fontWeight="700"
          fontFamily="'JetBrains Mono',monospace">
          GREENHOUSE BAY — {farm.toUpperCase()}
        </text>

        {/* Supply manifold */}
        <line x1="182" y1="56" x2="812" y2="56"
          stroke={r3On ? "#1d4ed8" : "var(--hmi-pipe)"} strokeWidth="6" strokeLinecap="round" />
        <FlowDots path="M812,56 L182,56" active={r3On} count={7} duration={3.2} radius={3.5} />

        {/* Nozzle drop pipes + water drops */}
        {nozzleX.map((nx, i) => (
          <g key={nx}>
            <line x1={nx} y1="56" x2={nx} y2="88"
              stroke={r3On ? "#1d4ed8" : "var(--hmi-pipe)"} strokeWidth="3" />
            <polygon points={`${nx-7},88 ${nx+7},88 ${nx},100`}
              fill={r3On ? "#2563eb" : "var(--hmi-pipe)"} />
            {r3On && [0, 0.3, 0.65].map((del, j) => (
              <circle key={j}
                cx={nx + (j - 1) * 5} cy={104} r="2.5" fill="#93c5fd"
                style={{ animation: `pm-drip 1.4s ease-in ${del + i * 0.09}s infinite` }} />
            ))}
          </g>
        ))}

        {/* Plants — shifted up to leave instrument zone at bottom */}
        {[210, 265, 318, 370, 423, 476, 530, 584, 638, 692, 745].map((px, i) => (
          <g key={px} transform={`translate(${px},${i % 2 === 0 ? 130 : 142})`}>
            <line x1="0" y1="52" x2="0" y2="22" stroke="#166534" strokeWidth="3" />
            <ellipse cx="-11" cy="38" rx="13" ry="8" fill="#15803d" transform="rotate(-28 -11 38)" />
            <ellipse cx="11"  cy="38" rx="13" ry="8" fill="#15803d" transform="rotate(28 11 38)"  />
            <ellipse cx="0"   cy="20" rx="9"  ry="14" fill="#16a34a" />
            <ellipse cx="0"   cy="12" rx="5"  ry="8"  fill="#4ade80" opacity="0.55" />
            <rect x="-10" y="52" width="20" height="12" rx="2" fill="#6b3b12" />
          </g>
        ))}

        {/* Ground line — separates plant zone from instrument zone */}
        <line x1="175" y1="212" x2="806" y2="212"
          stroke="var(--hmi-gh-bd)" strokeWidth="1" strokeDasharray="4 5" />

        {/* ── Instrument zone (y=216 – y=285) ── */}

        {/* Temperature gauge */}
        <SemiGauge cx={310} cy={254} r={36}
          pct={(temp ?? 0) / 50}
          color={tempHigh ? "#ef4444" : tempWarn ? "#eab308" : "#f97316"}
          label="°C  TEMP"
          display={temp != null ? `${temp.toFixed(1)}°` : "--"}
        />

        {/* Humidity gauge */}
        <SemiGauge cx={490} cy={254} r={36}
          pct={(hum ?? 0) / 100}
          color={(hum ?? 0) > 85 ? "#ef4444" : "#38bdf8"}
          label="%  HUMIDITY"
          display={hum != null ? `${Math.round(hum)}%` : "--"}
        />

        {/* Tower light — STATUS label is inside the component, above housing */}
        <TowerLight cx={640} cy={254}
          red={tempHigh || !isOnline}
          yellow={tempWarn && !tempHigh && isOnline}
          green={!tempHigh && !tempWarn && isOnline}
        />

        {/* Standby / Relay 2 */}
        <rect x="700" y="236" width="58" height="44" rx="4"
          fill="var(--hmi-inner)" stroke={r2On ? "#7c3aed" : "var(--hmi-bd)"} strokeWidth="1" />
        <text x="729" y="250" textAnchor="middle" fill="var(--hmi-txt)"
          fontSize="8" letterSpacing="1.2" fontFamily="'JetBrains Mono',monospace">STANDBY</text>
        <circle cx="729" cy="263" r="8"
          fill={r2On ? "#7c3aed" : "var(--hmi-off)"} stroke={r2On ? "#a855f7" : "var(--hmi-bd)"} strokeWidth="1.5"
          style={r2On ? { filter: "drop-shadow(0 0 6px #7c3aed)" } : {}} />
        <text x="729" y="276" textAnchor="middle" fill="#7c3aed" fontSize="8"
          fontFamily="'JetBrains Mono',monospace">RELAY 2</text>
        <text x="729" y="287" textAnchor="middle"
          fill={r2On ? "#a855f7" : "var(--hmi-txt)"} fontSize="9" fontWeight="600" letterSpacing="1"
          fontFamily="'JetBrains Mono',monospace">{r2On ? "ON" : "OFF"}</text>

        {/* ══ WATER SYSTEM (right) ══ */}

        {/* Riser pipes: pump → manifold */}
        <line x1="812" y1="56"  x2="820" y2="56"  stroke={r3On ? "#1d4ed8" : "var(--hmi-pipe)"} strokeWidth="6" strokeLinecap="round" />
        <line x1="820" y1="56"  x2="820" y2="228" stroke={r3On ? "#1d4ed8" : "var(--hmi-pipe)"} strokeWidth="6" strokeLinecap="round" />
        <line x1="820" y1="228" x2="864" y2="228" stroke={r3On ? "#1d4ed8" : "var(--hmi-pipe)"} strokeWidth="6" strokeLinecap="round" />
        <FlowDots path="M864,228 L820,228 L820,56 L812,56" active={r3On} count={4} duration={1.8} radius={3.5} />

        {/* Water tank */}
        <rect x="844" y="40" width="92" height="138" rx="4"
          fill="url(#pm-tank)" stroke="#1d4ed8" strokeWidth="1.5" />
        <ellipse cx="890" cy="40"  rx="46" ry="12" fill="var(--hmi-inner)" stroke="#1d4ed8" strokeWidth="1.5" />
        <ellipse cx="890" cy="178" rx="46" ry="12" fill="var(--hmi-inner)" stroke="#1d4ed8" strokeWidth="1.5" />
        <rect x="846" y="108" width="88" height="70" fill="#1d4ed8" opacity="0.2" />
        <line x1="856" y1="50" x2="856" y2="168" stroke="white" strokeWidth="2.5"
          strokeLinecap="round" opacity="0.05" />
        {[0,1,2,3].map(i => (
          <line key={i} x1="934" y1={52 + i * 30} x2="940" y2={52 + i * 30}
            stroke="var(--hmi-bd)" strokeWidth="1.5" />
        ))}
        {/* WATER TANK label inside tank body — avoids pipe overlap */}
        <text x="890" y="142" textAnchor="middle" fill="var(--hmi-txt)"
          fontSize="9" letterSpacing="1.5" fontFamily="'JetBrains Mono',monospace">WATER TANK</text>

        {/* Tank → pump pipe */}
        <line x1="890" y1="190" x2="890" y2="212" stroke={r3On ? "#1d4ed8" : "var(--hmi-pipe)"} strokeWidth="6" strokeLinecap="round" />
        <FlowDots path="M890,190 L890,212" active={r3On} count={2} duration={0.5} radius={3} />

        {/* Spray pump */}
        {r3On && (
          <circle cx="890" cy="238" r="32" fill="none" stroke="#22c55e"
            strokeWidth="1" opacity="0.3" className="pm-pulse" />
        )}
        <circle cx="890" cy="238" r="26"
          fill="var(--hmi-inner)" stroke={r3On ? "#16a34a" : "var(--hmi-pipe)"} strokeWidth={r3On ? "2" : "1.5"} />
        <g transform="translate(890,238)">
          <g className={r3On ? "pm-pump" : ""}>
            {[0, 90, 180, 270].map(a => (
              <ellipse key={a} cx="0" cy="-12" rx="5" ry="10"
                fill={r3On ? "#4ade80" : "var(--hmi-pipe)"}
                transform={`rotate(${a})`} />
            ))}
          </g>
          <circle cx="0" cy="0" r="5" fill={r3On ? "#22c55e" : "var(--hmi-inner)"} />
        </g>

        <text x="890" y="277" textAnchor="middle" fill="var(--hmi-txt)"
          fontSize="9" letterSpacing="1.5" fontFamily="'JetBrains Mono',monospace">SPRAY PUMP</text>
        <text x="890" y="290" textAnchor="middle" fill="#2563eb"
          fontSize="8" letterSpacing="1" fontFamily="'JetBrains Mono',monospace">RELAY 3</text>
        <circle cx="890" cy="302" r="5"
          fill={r3On ? "#22c55e" : "var(--hmi-inner)"} stroke={r3On ? "#4ade80" : "var(--hmi-bd)"} strokeWidth="1"
          style={r3On ? { filter: "drop-shadow(0 0 5px #22c55e)" } : {}} />

      </svg>
    </div>
  );
}
