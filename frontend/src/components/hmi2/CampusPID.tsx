"use client";
/**
 * CampusPID — a hand-drawn process diagram of the PP Campus system.
 *
 * Hand-drawn is the point. The old P&ID Diagram_SCADA.svg was an exported
 * picture: it did not depict this system, and nothing in it could be bound to
 * anything, because an exported drawing has no named parts to bind to. Every
 * element here is an addressable React node, so a pump fills when its channel
 * is on and a line brightens when it is carrying water.
 *
 * The process, left to right, is the order water actually travels:
 *
 *   mains  →  FM-01 meter  →  T-01 storage  →  T-02 chilled tank (coil, CH4)
 *        →  F-01 filter  →  P-01 circulation pump (CH2)  →  misting header
 *        →  nozzles over the growing bed
 *
 * FM-01 sits on the MAINS INLET. The meter reports a daily consumption total,
 * which is what the whole system drew from supply — a figure only the inlet
 * can give. After the pump it would have counted recirculation on every pass
 * and missed anything drawn elsewhere.
 *
 * ISA-101 throughout: state is shown by FORM (filled vs outline, bright vs dim
 * line), colour is reserved for abnormal, and nothing moves. A diagram where
 * every running pump is green has spent its loudest signal on its least urgent
 * message.
 *
 * Coordinates live in pidLayout.ts, not here, so scripts/check-pid.mjs can
 * verify nothing overlaps without parsing JSX.
 */
import Link from "next/link";

import { HMI } from "./tokens";
import * as L from "./pidLayout";
import type { RelayStatus } from "@/types";

export interface PIDProps {
  relays: RelayStatus[];
  temp?: number | null;
  hum?: number | null;
  /** Latest meter total, in the meter's own unit. */
  meterTotal?: number | null;
  meterUnit?: string;
  stale: boolean;
}

const isOn = (relays: RelayStatus[], key: string, stale: boolean) =>
  !stale && relays.some((r) => r.key === key && r.state === "ON");

export default function CampusPID({
  relays, temp, hum, meterTotal, meterUnit = "m³", stale,
}: PIDProps) {
  const enable = isOn(relays, "CH1", stale);
  const spray = isOn(relays, "CH2", stale);
  const cool = isOn(relays, "CH4", stale);

  // A line is live when something is pushing water through it; the supply side
  // moves only when the circulation pump runs.
  const supply = spray;

  return (
    <div className="w-full h-full grid place-items-center p-2">
      <svg viewBox={`0 0 ${L.VIEW.w} ${L.VIEW.h}`} className="w-full h-full">
        <defs>
          <pattern id="pid-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={HMI.line} strokeWidth="2" />
          </pattern>
          <marker id="pid-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill={HMI.inkFaint} />
          </marker>
        </defs>

        {/* ── PIPEWORK — drawn first so symbols sit on their connections ── */}
        <Pipe d={`M 8 ${L.LINE_Y} L ${L.FM.cx - L.FM.r} ${L.LINE_Y}`} live={supply} />
        <Pipe d={`M ${L.FM.cx + L.FM.r} ${L.LINE_Y} L ${L.T01.x} ${L.LINE_Y}`} live={supply} />
        <Pipe d={`M ${L.T01.x + L.T01.w} ${L.LINE_Y} L ${L.T02.x} ${L.LINE_Y}`} live={supply} />
        <Pipe d={`M ${L.T02.x + L.T02.w} ${L.LINE_Y} L ${L.F01.x} ${L.LINE_Y}`} live={supply} />
        <Pipe d={`M ${L.F01.x + L.F01.w} ${L.LINE_Y} L ${L.P01.cx - L.P01.r} ${L.LINE_Y}`} live={supply} />
        {/* riser from the pump up to the header */}
        <Pipe d={`M ${L.P01.cx + L.P01.r} ${L.LINE_Y} L ${L.RISER_X} ${L.LINE_Y} L ${L.RISER_X} ${L.HEADER_Y}`} live={supply} />
        {/* the misting header */}
        <Pipe d={`M ${L.RISER_X} ${L.HEADER_Y} L ${L.HEADER_X1} ${L.HEADER_Y}`} live={spray} />
        {/* chiller loop into the coil — dashed, because it is a closed
            refrigerant circuit rather than process water */}
        <Pipe
          d={`M ${L.T02.x + 20} ${L.T02.y + L.T02.h} L ${L.T02.x + 20} ${L.COIL_LOOP_Y} L ${L.T02.x + L.T02.w - 20} ${L.COIL_LOOP_Y} L ${L.T02.x + L.T02.w - 20} ${L.T02.y + L.T02.h}`}
          live={cool}
          dashed
          noArrow
        />
        <Pipe d={`M ${L.CHILLER.cx} ${L.CHILLER.cy - L.CHILLER.h / 2} L ${L.CHILLER.cx} ${L.COIL_LOOP_Y}`} live={cool} thin />
        {/* sensor dropper, so TH-01 is visibly in the bed */}
        <Pipe d={`M ${L.TH_READOUT.x + 60} ${L.BED.y + L.BED.h} L ${L.TH_READOUT.x + 60} ${L.TH_READOUT.y}`} live={false} thin />

        {/* ── GROWING BED ───────────────────────────────────────────────── */}
        <rect x={L.BED.x} y={L.BED.y} width={L.BED.w} height={L.BED.h} fill={HMI.panelAlt} stroke={HMI.line} />
        <text x={L.BED.x + L.BED.w / 2} y={L.BED.y + 20} textAnchor="middle" fontSize="11"
              fill={HMI.inkFaint} letterSpacing="2">GROWING BED</text>

        {/* ── NOZZLES. Seven stand for the 34 real heads; drawing them all
              would be noise rather than information. ───────────────────── */}
        {L.NOZZLE_XS.map((x) => <Nozzle key={x} x={x} y={L.HEADER_Y} spraying={spray} />)}

        {/* ── EQUIPMENT. Each links to its Level 3 detail page, which is how
              a real faceplate is reached. ──────────────────────────────── */}
        <Detail tag="FM-01">
          <circle cx={L.FM.cx} cy={L.FM.cy} r={L.FM.r} fill={HMI.panel} stroke={HMI.line} strokeWidth={2} />
          <text x={L.FM.cx} y={L.FM.cy + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill={HMI.inkMuted}>FM</text>
          <Tag cx={L.FM.cx} tag="FM-01" name="Water meter" />
        </Detail>

        <Detail tag="T-01">
          <rect x={L.T01.x} y={L.T01.y} width={L.T01.w} height={L.T01.h} rx={4}
                fill={HMI.panel} stroke={HMI.line} strokeWidth={2} />
          <Tag cx={L.T01.x + L.T01.w / 2} tag="T-01" name="Storage tank" />
        </Detail>

        <Detail tag="T-02">
          <rect x={L.T02.x} y={L.T02.y} width={L.T02.w} height={L.T02.h} rx={4}
                fill={HMI.panel} stroke={HMI.line} strokeWidth={2} />
          {/* The copper coil inside. Thickens when CH4 is cooling. */}
          <path
            d={[0, 1, 2].map((i) => {
              const y = L.T02.y + 28 + i * 28;
              return `M ${L.T02.x + 16} ${y} q 18 -13 36 0 q 18 13 36 0`;
            }).join(" ")}
            fill="none" stroke={cool ? HMI.ink : HMI.line} strokeWidth={cool ? 2.5 : 1.5}
          />
          <Tag cx={L.T02.x + L.T02.w / 2} tag="T-02" name="Chilled tank" />
        </Detail>

        <Detail tag="F-01">
          <rect x={L.F01.x} y={L.F01.y} width={L.F01.w} height={L.F01.h}
                fill="url(#pid-hatch)" stroke={HMI.line} strokeWidth={2} />
          <Tag cx={L.F01.x + L.F01.w / 2} tag="F-01" name="Inline filter" />
        </Detail>

        <Detail tag="P-01">
          {/* Filled when running, hollow when not — readable without colour,
              which matters on a sunlit panel and for a colour-blind reader. */}
          <circle cx={L.P01.cx} cy={L.P01.cy} r={L.P01.r}
                  fill={spray ? HMI.on : "transparent"} stroke={HMI.line} strokeWidth={2} />
          <path d={`M ${L.P01.cx - 10} ${L.P01.cy - 12} L ${L.P01.cx + 14} ${L.P01.cy} L ${L.P01.cx - 10} ${L.P01.cy + 12} Z`}
                fill={spray ? HMI.bg : HMI.line} />
          <Tag cx={L.P01.cx} tag="P-01" name="Circulation pump" />
        </Detail>

        <Detail tag="CH-01">
          <rect x={L.CHILLER.cx - L.CHILLER.w / 2} y={L.CHILLER.cy - L.CHILLER.h / 2}
                width={L.CHILLER.w} height={L.CHILLER.h}
                fill={cool ? HMI.on : HMI.panel} stroke={HMI.line} strokeWidth={2} />
          <text x={L.CHILLER.cx} y={L.CHILLER.cy + 5} textAnchor="middle" fontSize="11" fontWeight="700"
                fill={cool ? HMI.bg : HMI.inkMuted}>CHILLER</text>
          <Tag cx={L.CHILLER.cx} y={L.CHILLER.cy + L.CHILLER.h / 2 + 22} tag="CH-01" name="Chiller" />
        </Detail>

        {/* ── CHANNEL CHIPS on the equipment they drive ──────────────────── */}
        <ChannelChip cx={L.CH2_TAG.cx} y={L.CH2_TAG.y} ch="CH2" on={spray} stale={stale} />
        <ChannelChip cx={L.CH4_TAG.cx} y={L.CH4_TAG.y} ch="CH4" on={cool} stale={stale} />

        {/* ── READOUTS, docked at what they measure ──────────────────────── */}
        <Readout box={L.TH_READOUT} tag="TH-01" lines={[
          { label: "TEMP", value: temp != null ? temp.toFixed(1) + " °C" : "––.–", bad: stale },
          { label: "HUM", value: hum != null ? hum.toFixed(0) + " %" : "–– %", bad: stale },
        ]} />
        <Readout box={L.FM_READOUT} tag="FM-01" lines={[
          { label: "TOTAL", value: meterTotal != null ? meterTotal + " " + meterUnit : "no data",
            bad: meterTotal == null },
        ]} />

        {/* ── CONTROL PANEL ─────────────────────────────────────────────── */}
        <Detail tag="CP-01">
          <rect x={L.PANEL.x} y={L.PANEL.y} width={L.PANEL.w} height={L.PANEL.h}
                fill={HMI.panel} stroke={HMI.line} strokeWidth={2} />
          <text x={L.PANEL.x + 8} y={L.PANEL.y + 16} fontSize="10" fontWeight="700" fill={HMI.inkFaint}>CP-01</text>
          <text x={L.PANEL.x + 8} y={L.PANEL.y + 30} fontSize="10" fill={HMI.inkFaint}>Control panel</text>
          {/* Stale is drawn as loudly as off: "we do not know" and "it is off"
              must never look the same on a control screen. */}
          <circle cx={L.PANEL.x + 24} cy={L.PANEL.y + 54} r={9}
                  fill={!stale && enable ? HMI.on : "transparent"}
                  stroke={stale ? HMI.warn : HMI.line} strokeWidth={2} />
          {stale && (
            <path d={`M ${L.PANEL.x + 17} ${L.PANEL.y + 61} L ${L.PANEL.x + 31} ${L.PANEL.y + 47}`}
                  stroke={HMI.warn} strokeWidth={2} />
          )}
          <text x={L.PANEL.x + 42} y={L.PANEL.y + 58} fontSize="10" fontWeight="700"
                fill={stale ? HMI.warn : enable ? HMI.ink : HMI.inkFaint}>
            {stale ? "UNKNOWN" : enable ? "ENABLED" : "OFF"}
          </text>
        </Detail>
      </svg>
    </div>
  );
}

/* ── primitives ──────────────────────────────────────────────────────── */

/** Wraps an element so clicking it opens that tag's detail page. */
function Detail({ tag, children }: { tag: string; children: React.ReactNode }) {
  return (
    <Link href={`/hmi/equipment/${tag}`} className="cursor-pointer">
      <g className="transition-opacity hover:opacity-70">{children}</g>
    </Link>
  );
}

function Pipe({
  d, live, dashed, thin, noArrow,
}: { d: string; live: boolean; dashed?: boolean; thin?: boolean; noArrow?: boolean }) {
  return (
    <path
      d={d}
      fill="none"
      // A live line is brighter and thicker. No dashes marching along it:
      // motion is reserved for alarms, and a pipe that animates whenever it
      // works teaches the eye to ignore movement.
      stroke={live ? HMI.ink : HMI.line}
      strokeWidth={thin ? 1 : live ? 3 : 2}
      strokeDasharray={dashed ? "6 4" : undefined}
      markerEnd={thin || noArrow ? undefined : "url(#pid-arrow)"}
    />
  );
}

function Tag({ cx, y = L.TAG_Y, tag, name }: { cx: number; y?: number; tag: string; name: string }) {
  return (
    <>
      <text x={cx} y={y} textAnchor="middle" fontSize="12" fontWeight="700" fill={HMI.inkMuted}>{tag}</text>
      <text x={cx} y={y + 13} textAnchor="middle" fontSize="10" fill={HMI.inkFaint}>{name}</text>
    </>
  );
}

function Nozzle({ x, y, spraying }: { x: number; y: number; spraying: boolean }) {
  return (
    <g>
      <path d={`M ${x - 6} ${y} L ${x + 6} ${y} L ${x} ${y + 12} Z`} fill={spraying ? HMI.ink : HMI.line} />
      {/* Spray as three static strokes, not an animation. */}
      {spraying && (
        <path d={`M ${x - 9} ${y + 30} L ${x} ${y + 14} L ${x + 9} ${y + 30} M ${x} ${y + 14} L ${x} ${y + 32}`}
              stroke={HMI.ink} strokeWidth={1} fill="none" opacity={0.6} />
      )}
    </g>
  );
}

function Readout({
  box, tag, lines,
}: {
  box: { x: number; y: number; w: number; h: number };
  tag: string;
  lines: { label: string; value: string; bad?: boolean }[];
}) {
  return (
    <g>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={HMI.panel} stroke={HMI.line} strokeWidth={1.5} />
      <text x={box.x + 6} y={box.y + 13} fontSize="10" fontWeight="700" fill={HMI.inkFaint}>{tag}</text>
      {lines.map((l, i) => (
        <g key={l.label}>
          <text x={box.x + 6} y={box.y + 30 + i * 16} fontSize="10" fill={HMI.inkFaint}>{l.label}</text>
          <text x={box.x + box.w - 6} y={box.y + 30 + i * 16} textAnchor="end" fontSize="12" fontWeight="600"
                fill={l.bad ? HMI.warn : HMI.ink}>{l.value}</text>
        </g>
      ))}
    </g>
  );
}

function ChannelChip({
  cx, y, ch, on, stale,
}: { cx: number; y: number; ch: string; on: boolean; stale: boolean }) {
  return (
    <g>
      <rect x={cx - L.CH_TAG.w / 2} y={y} width={L.CH_TAG.w} height={L.CH_TAG.h}
            fill={on ? HMI.on : "transparent"}
            stroke={stale ? HMI.warn : HMI.line} strokeWidth={1.5} />
      <text x={cx} y={y + 12} textAnchor="middle" fontSize="10" fontWeight="700"
            fill={stale ? HMI.warn : on ? HMI.bg : HMI.inkFaint}>
        {stale ? ch + " ?" : ch}
      </text>
    </g>
  );
}
