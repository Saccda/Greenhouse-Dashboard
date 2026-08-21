"use client";
import type { RelayStatus } from "@/types";
import {
  FlowDots, SprayDroplets, PilotLamp, EquipmentFlowDefs,
  SPRAY_PUMP_PATH, TANK_PUMP_PATH, TANK_CONTROL_PATH,
} from "./EquipmentFlowParts";

interface Props {
  relays:   RelayStatus[];
  temp?:    number;
  hum?:     number;
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

  return (
    <div className="relative w-full rounded-xl overflow-hidden border p-3"
      style={{ backgroundColor: "#ffffff", borderColor: "var(--hmi-bd)" }}>
      <div className="relative w-full" style={{ aspectRatio: "1920 / 1080" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hmi-equipment.png" alt="Greenhouse equipment — spraying system, cooling tank, spray pump, control system"
          className="absolute inset-0 w-full h-full" style={{ objectFit: "contain" }} />
        <svg viewBox="0 0 1920 1080" className="absolute inset-0 w-full h-full">
          <EquipmentFlowDefs />

          <SprayDroplets active={r3On} />

          <FlowDots path={SPRAY_PUMP_PATH} active={r3On} count={4} duration={2.0} radius={13} />
          <FlowDots path={TANK_PUMP_PATH} active={r3On} count={3} duration={1.5} radius={13} />
          <FlowDots path={TANK_CONTROL_PATH} active={r1On} count={6} duration={2.6} radius={13} />

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
