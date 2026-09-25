/**
 * Every box on the process diagram, in one table.
 *
 * Separated from the drawing code so the layout can be CHECKED rather than
 * eyeballed. Hand-placed SVG coordinates drift into each other the moment
 * anything moves — a tag gets one character longer, an element shifts by
 * thirty units, and a label quietly sits on top of a tank. scripts/check-pid.mjs
 * reads this table and fails if any two boxes intersect, so an overlap is a
 * failing command rather than something noticed in a screenshot later.
 *
 * Text boxes are sized generously (roughly 5.6px per character at 10-12px,
 * which is wider than the font actually renders) so the check errs toward
 * complaining early.
 */
export interface Box { id: string; x: number; y: number; w: number; h: number }

export const VIEW = { w: 1000, h: 500 };

/** Approximate width of a centred text label, used for collision checking. */
export const textW = (s: string, px = 5.6) => s.length * px;

// ── Row A: misting header and nozzles, above the bed ──────────────────────
export const HEADER_Y = 70;
export const HEADER_X1 = 330;
export const HEADER_X2 = 880;
export const NOZZLE_XS = [370, 440, 510, 580, 650, 720, 790, 855];

// ── Row B: the growing bed ────────────────────────────────────────────────
export const BED = { x: 330, y: 132, w: 550, h: 30 };

// ── Row C: the process line ───────────────────────────────────────────────
export const LINE_Y = 250;
// FM-01 sits BETWEEN the storage tank and the chilled tank — confirmed with
// the farm team. It therefore measures what is drawn out of storage and into
// the cooling and misting circuit, which is the figure Day_consumption
// reports. It is not on the mains inlet and not after the pump.
export const T01 = { x: 70, y: 195, w: 85, h: 110 };
export const FM = { cx: 205, cy: LINE_Y, r: 22 };
export const T02 = { x: 275, y: 195, w: 105, h: 110 };
export const F01 = { x: 430, y: 225, w: 80, h: 50 };
export const P01 = { cx: 580, cy: LINE_Y, r: 28 };
export const RISER_X = 880;

// ── Row D: equipment tags (two lines) ─────────────────────────────────────
export const TAG_Y = 330;

// ── Row E: channel tags ───────────────────────────────────────────────────
export const CH_TAG = { w: 54, h: 16 };
export const CH2_TAG = { cx: P01.cx, y: 362 };
export const CH4_TAG = { cx: 327, y: 390 };

// ── Row F: chiller loop, panel, instruments ───────────────────────────────
export const COIL_LOOP_Y = 378;
export const CHILLER = { cx: 327, cy: 432, w: 92, h: 36 };
export const PANEL = { x: 560, y: 404, w: 132, h: 74 };
export const FM_READOUT = { x: 145, y: 150, w: 132, h: 36 };
export const TH_READOUT = { x: 730, y: 186, w: 132, h: 52 };

/** Every occupied rectangle, tags included. Order is irrelevant. */
export function boxes(): Box[] {
  const tag = (id: string, cx: number, y: number, label: string, name: string): Box[] => [
    { id: `${id}.tag`, x: cx - textW(label) / 2, y: y - 10, w: textW(label), h: 13 },
    { id: `${id}.name`, x: cx - textW(name) / 2, y: y + 3, w: textW(name), h: 13 },
  ];
  return [
    { id: "bed", ...BED },
    { id: "FM-01", x: FM.cx - FM.r, y: FM.cy - FM.r, w: FM.r * 2, h: FM.r * 2 },
    { id: "T-01", ...T01 },
    { id: "T-02", ...T02 },
    { id: "F-01", ...F01 },
    { id: "P-01", x: P01.cx - P01.r, y: P01.cy - P01.r, w: P01.r * 2, h: P01.r * 2 },
    { id: "CH-01", x: CHILLER.cx - CHILLER.w / 2, y: CHILLER.cy - CHILLER.h / 2, w: CHILLER.w, h: CHILLER.h },
    { id: "CP-01", ...PANEL },
    { id: "FM.readout", ...FM_READOUT },
    { id: "TH.readout", ...TH_READOUT },
    { id: "CH2.chip", x: CH2_TAG.cx - CH_TAG.w / 2, y: CH2_TAG.y, w: CH_TAG.w, h: CH_TAG.h },
    { id: "CH4.chip", x: CH4_TAG.cx - CH_TAG.w / 2, y: CH4_TAG.y, w: CH_TAG.w, h: CH_TAG.h },
    ...tag("FM-01", FM.cx, TAG_Y, "FM-01", "Water meter"),
    ...tag("T-01", T01.x + T01.w / 2, TAG_Y, "T-01", "Storage tank"),
    ...tag("T-02", T02.x + T02.w / 2, TAG_Y, "T-02", "Chilled tank"),
    ...tag("F-01", F01.x + F01.w / 2, TAG_Y, "F-01", "Inline filter"),
    ...tag("P-01", P01.cx, TAG_Y, "P-01", "Circulation pump"),
    ...tag("CH-01", CHILLER.cx, CHILLER.cy + CHILLER.h / 2 + 22, "CH-01", "Chiller"),
  ];
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Every intersecting pair. Empty means the diagram is clean. */
export function collisions(): [string, string][] {
  const bs = boxes();
  const out: [string, string][] = [];
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      // A tag pair belonging to the same item sits deliberately adjacent.
      const sameItem = bs[i].id.split(".")[0] === bs[j].id.split(".")[0];
      if (!sameItem && overlaps(bs[i], bs[j])) out.push([bs[i].id, bs[j].id]);
    }
  }
  return out;
}
