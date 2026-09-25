/**
 * HMI palette — deliberately almost colourless.
 *
 * A high-performance HMI (ISA-101) inverts the usual dashboard instinct:
 * everything normal is GREY, and colour is spent only on what is abnormal.
 * The reason is arithmetic rather than taste. Attention is finite; if green
 * means running and blue means cooling and animation means flowing, then by
 * the time something is genuinely wrong there is no unused signal left to
 * raise. A screen where everything is coloured is a screen where nothing is.
 *
 * So: three greys for the process, and three colours that mean exactly one
 * thing each and are otherwise never used.
 */
export const HMI = {
  // Mid-grey ground. Not white (glare on a panel that is lit all day) and not
  // black (every value then glows, which is its own kind of shouting). A middle
  // value also leaves headroom in BOTH directions, so a mark can be darker or
  // lighter than the field and be read either way.
  bg:       "#3f4449",
  panel:    "#494e54",
  panelAlt: "#54595f",
  line:     "#6a7076",

  // Text, by how much it needs to be read.
  //
  // Solved against panelAlt, which is the LIGHTEST surface and therefore the
  // worst case for light text — the state strip and the alarm header both sit
  // on it, so the header was the least readable part of the screen rather than
  // the most. inkFaint measured 2.71:1 there, well under the 4.5:1 body text
  // needs; the labels naming every process value were the thing failing.
  //
  // The ladder keeps real gaps — 6.4 / 5.3 / 4.6 on that surface — because a
  // hierarchy whose steps are within a tenth of each other is not a hierarchy.
  ink:      "#f2f4f6",   // values          6.41:1 on panelAlt
  inkMuted: "#dce0e3",   // labels          5.32:1
  inkFaint: "#ced1d4",   // units, secondary 4.61:1

  // The only three colours on the screen.
  alarm:    "#ff5b4d",   // action required now
  warn:     "#ffb23f",   // outside target, not yet critical
  // "Commanded on" is a STATE, not an alarm, so it gets the quietest possible
  // mark: a pale fill rather than a colour, so a running system does not look
  // like a fault.
  on:       "#e8eaec",
} as const;

/** Where a value sits relative to its target. The whole point of the bars. */
export type Deviation = "normal" | "warn" | "alarm" | "unknown";

export function deviation(
  value: number | null | undefined,
  target: number | null | undefined,
  warnBand: number,
  alarmBand: number,
): Deviation {
  if (value == null || target == null) return "unknown";
  const d = Math.abs(value - target);
  if (d >= alarmBand) return "alarm";
  if (d >= warnBand) return "warn";
  return "normal";
}

export const deviationColor = (d: Deviation) =>
  d === "alarm" ? HMI.alarm : d === "warn" ? HMI.warn : HMI.inkMuted;
