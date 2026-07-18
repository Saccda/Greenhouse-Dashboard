/**
 * Deterministic simulated data for the Roadmap preview page.
 * Seeded so charts render identically on every load — this is a mockup of
 * planned dashboards, not live telemetry, and should read as a stable
 * example rather than random noise on every refresh.
 */

export function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface HourPoint { time: Date; hourOfDay: number; label: string }
export interface DayPoint  { time: Date; dayIndex: number; label: string }

/** The last `hours` hourly slots, ending now. */
export function hourlyTimeline(hours: number): HourPoint[] {
  const now = new Date();
  return Array.from({ length: hours }, (_, idx) => {
    const i = hours - 1 - idx;
    const t = new Date(now.getTime() - i * 3600_000);
    return {
      time: t,
      hourOfDay: t.getHours() + t.getMinutes() / 60,
      label: t.toLocaleTimeString("en-US", { hour: "numeric", hour12: true }),
    };
  });
}

/** The last `days` daily slots, ending today. */
export function dailyTimeline(days: number): DayPoint[] {
  const now = new Date();
  return Array.from({ length: days }, (_, idx) => {
    const i = days - 1 - idx;
    const t = new Date(now.getTime() - i * 86_400_000);
    return {
      time: t,
      dayIndex: days - 1 - i,
      label: t.toLocaleDateString("en-US", { weekday: "short" }),
    };
  });
}

const round = (v: number, decimals = 1) => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};

/** Smooth bell-shaped daylight curve, 0 outside roughly 6am-6pm. */
export function daylightCurve(hourOfDay: number, peak: number): number {
  const shifted = hourOfDay - 12;
  const width = 4.2;
  const v = peak * Math.exp(-(shifted * shifted) / (2 * width * width));
  return v < peak * 0.02 ? 0 : v;
}

export { round };
