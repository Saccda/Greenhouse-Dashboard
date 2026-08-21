"use client";
import {
  FlowDots, SprayDroplets, PilotLamp, EquipmentFlowDefs,
  SPRAY_PUMP_PATH, TANK_PUMP_PATH, TANK_CONTROL_PATH,
} from "./EquipmentFlowParts";

/** Static "system is on" demo of the same equipment photo used by the live Control page's
 *  Controller HMI, just always animated rather than gated on real relay state — this is the
 *  Overview page's explainer of the physical setup, not a live readout. */
export default function SystemFlowDiagram() {
  return (
    <div className="relative w-full rounded-lg overflow-hidden bg-white">
      <div className="relative w-full" style={{ aspectRatio: "1920 / 1080" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hmi-equipment.png" alt="Spraying system, cooling tank, and control system — the three real installed components"
          className="absolute inset-0 w-full h-full" style={{ objectFit: "contain" }} />
        <svg viewBox="0 0 1920 1080" className="absolute inset-0 w-full h-full">
          <EquipmentFlowDefs />

          <SprayDroplets active />

          <FlowDots path={SPRAY_PUMP_PATH} active count={4} duration={2.0} radius={13} />
          <FlowDots path={TANK_PUMP_PATH} active count={3} duration={1.5} radius={13} />
          <FlowDots path={TANK_CONTROL_PATH} active count={6} duration={2.6} radius={13} />

          <rect x="550" y="668" width="395" height="250" rx="16" fill="none" stroke="#22c55e" strokeWidth="3" opacity="0.5" className="eq-pulse" />

          <PilotLamp cx={1100} cy={245} r={25} on label="COOLING" />
          <PilotLamp cx={497} cy={794} r={25} on label="PUMP" />
          <PilotLamp cx={1715} cy={660} r={28} on label="CONTROLLER" />
        </svg>
      </div>
    </div>
  );
}
