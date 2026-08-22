"use client";
import type { RelayStatus } from "@/types";
import {
  FlowDots, SprayDroplets, PilotLamp, EquipmentFlowDefs, ReadoutCard, isRelayOn,
  SPRAY_PUMP_PATH, TANK_PUMP_PATH, TANK_CONTROL_PATH,
} from "./EquipmentFlowParts";

interface Props {
  relays:   RelayStatus[];
  temp?:    number;
  hum?:     number;
}

export default function EquipmentMimic({ relays, temp, hum }: Props) {
  const r1On = isRelayOn(relays, "relay1");
  const r3On = isRelayOn(relays, "relay3");

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
