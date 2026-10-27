"use client";
/**
 * The per-section comparisons, as one quiet line above the page.
 *
 * WHY THIS IS NOT CARDS
 *   It was a grid of boxed figures, and it was wrong twice over. It competed
 *   with the KPI cards directly under it for the same attention while carrying
 *   the lesser information, and because each section produced a different
 *   NUMBER of them, a three-wide grid left one section's row stretched across
 *   the window and another's ending two thirds of the way along. A row that
 *   fills the width on one page and not the next reads as a bug.
 *
 *   Inline text has neither problem: nothing stretches to fill a track, so two
 *   facts and three facts both look deliberate, and prose at 12px cannot
 *   out-shout a card.
 *
 *   A chip-and-sparkline version was tried after that and withdrawn — it put
 *   the detail behind a hover and still read as furniture. The design of this
 *   strip is an open question; the plain line is what it falls back to.
 *
 * WHAT EARNS A PLACE HERE
 *   Only what the page below does NOT already say. The stats under this line
 *   report the current state; this line reports whether that state is unusual.
 *   Several entries were removed outright for failing that test — the energy
 *   figures repeated the energy cards exactly, soil-versus-air repeated the
 *   soil temperature card's own subtitle, and average cycle length repeated
 *   the runtime card's.
 *
 * WARNINGS DO NOT GET COMPRESSED
 *   A tone of "warn" means the sentence behind the figure is the point — a
 *   tank too warm to cool anything, say. Those keep their full sentence on its
 *   own line. Everything else puts its sentence in the title attribute, where
 *   it is available and not in the way.
 *
 * NOTHING HERE IS INVENTED. Every figure is derived from readings already
 * stored. Where a judgement would need a target this system does not have —
 * what soil moisture SHOULD be, what a unit of electricity costs — the figure
 * is reported without a verdict rather than given a made-up one.
 */
import type { HistoryResponse, SprayStatsResponse, TimePoint, WaterResponse } from "@/types";

export interface Insight {
  label: string;
  value: string;
  /** The sentence that makes the number mean something. */
  note?: string;
  tone?: "normal" | "good" | "warn";
}

export default function SectionInsights({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;
  const warnings = insights.filter((i) => i.tone === "warn" && i.note);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5 text-[12px]">
        {insights.map((i) => (
          <span key={i.label} className="inline-flex items-baseline gap-1.5" title={i.note}>
            <span className="text-slate-500">{i.label}</span>
            <span
              className={`font-mono-num tabular-nums font-semibold ${
                i.tone === "warn" ? "text-[color:var(--warn-ink)]"
                  : i.tone === "good" ? "text-brand-green" : "text-slate-200"
              }`}
            >
              {i.value}
            </span>
          </span>
        ))}
      </div>
      {warnings.map((w) => (
        <p key={w.label} className="text-[12px] text-[color:var(--warn-ink)] leading-snug">
          {w.note}
        </p>
      ))}
    </div>
  );
}

/* ── Per-section computation ─────────────────────────────────────────────── */

const vals = (p: TimePoint[]) => p.map((x) => x.value).filter((v): v is number => v != null);
const mean = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);

/** Mean of a field across a history response, or null when there is nothing. */
function avg(h: HistoryResponse | undefined, field: string): number | null {
  return mean(vals(h?.series?.[field] ?? []));
}

/**
 * The hour of day this field peaks on, averaged across whatever days are in
 * the window. Returns null under two days, because "the hottest hour" of a
 * single day is just that day's peak wearing a more confident label.
 */
function peakHour(points: TimePoint[]): number | null {
  if (!points.length) return null;
  const first = new Date(points[0].time).getTime();
  const last = new Date(points[points.length - 1].time).getTime();
  if (last - first < 36 * 3600_000) return null;

  const byHour = new Map<number, { sum: number; n: number }>();
  for (const p of points) {
    if (p.value == null) continue;
    const h = new Date(p.time).getHours();
    const e = byHour.get(h) ?? { sum: 0, n: 0 };
    byHour.set(h, { sum: e.sum + p.value, n: e.n + 1 });
  }
  let best: { hour: number; avg: number } | null = null;
  for (const [hour, e] of byHour) {
    const a = e.sum / e.n;
    if (!best || a > best.avg) best = { hour, avg: a };
  }
  return best?.hour ?? null;
}

const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Signed difference against the previous equivalent window. */
function comparison(
  label: string, now: number | null, before: number | null,
  unit: string, rangeLabel: string,
): Insight | null {
  if (now == null || before == null) return null;
  const d = now - before;
  const same = Math.abs(d) < 0.05;
  return {
    label: `${label} vs last ${rangeLabel}`,
    value: same ? "about the same" : `${d > 0 ? "+" : ""}${d.toFixed(1)} ${unit}`,
    note: same
      ? `Averaging ${now.toFixed(1)} ${unit}, as it did last ${rangeLabel}.`
      : `Averaging ${now.toFixed(1)} ${unit} against ${before.toFixed(1)} ${unit} last ${rangeLabel}.`,
  };
}

export function ambientInsights(
  history: HistoryResponse | undefined,
  previous: HistoryResponse | undefined,
  rangeLabel: string,
): Insight[] {
  const out: Insight[] = [];
  const cmp = comparison(
    "Air temperature", avg(history, "temperature"), avg(previous, "temperature"), "°C", rangeLabel,
  );
  if (cmp) out.push(cmp);

  const hc = comparison(
    "Humidity", avg(history, "humidity"), avg(previous, "humidity"), "%", rangeLabel,
  );
  if (hc) out.push(hc);

  const hour = peakHour(history?.series?.temperature ?? []);
  if (hour != null) {
    out.push({
      label: "Hottest hour",
      value: `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`,
      note: "Averaged across the days in this range — the window to be present for, or to expect the system to run hardest.",
    });
  }
  return out;
}

export function waterInsights(
  history: HistoryResponse | undefined,
  water: WaterResponse | undefined,
  sprayStats: SprayStatsResponse | undefined,
  tankField: string | null,
): Insight[] {
  const out: Insight[] = [];

  // THE question for this rig. A tank sitting at air temperature carries no
  // cooling capacity, so spraying from it removes no heat — and that looks
  // identical to an empty tank in every other figure on the dashboard.
  if (tankField) {
    const tank = avg(history, tankField);
    const air = avg(history, "temperature");
    if (tank != null && air != null) {
      const gap = air - tank;
      out.push({
        label: "Tank below air",
        value: `${gap.toFixed(1)} °C`,
        note: gap < 1
          ? "The tank is at roughly air temperature, so spraying from it removes very little heat. Worth checking the cooling is running."
          : `Water is ${gap.toFixed(1)} °C cooler than the air, so each spray can carry heat away.`,
        tone: gap < 1 ? "warn" : "good",
      });
    }
  }

  const stats = sprayStats?.stats;
  const reading = water?.readings?.[0];
  if (stats && stats.total_sprays > 0 && reading?.consumption_liters != null) {
    out.push({
      label: "Water per cycle",
      value: `${Math.round(reading.consumption_liters / stats.total_sprays)} L`,
      note: `${Math.round(reading.consumption_liters)} L across ${stats.total_sprays} cycles on the last metered day.`,
    });
  }
  return out;
}

export function soilInsights(
  history: HistoryResponse | undefined,
  previous: HistoryResponse | undefined,
  rangeLabel: string,
): Insight[] {
  const out: Insight[] = [];
  const mc = comparison(
    "Soil moisture", avg(history, "soil_moisture"), avg(previous, "soil_moisture"), "%", rangeLabel,
  );
  if (mc) out.push(mc);

  const st = comparison(
    "Soil temperature", avg(history, "soil_temperature"), avg(previous, "soil_temperature"),
    "°C", rangeLabel,
  );
  if (st) out.push(st);
  return out;
}
