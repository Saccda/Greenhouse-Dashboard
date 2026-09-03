"use client";
/**
 * CoverageNotice — states, up front, how much of the period the sensor actually
 * observed and which hours are represented.
 *
 * This is deliberately at the top of the page rather than in a footnote. The
 * Kampot rig powers down outside working hours, so every percentage below it is
 * conditional on daytime readings — the hottest part of the day. Reporting
 * "temperature exceeded 32 °C 57% of the time" without that qualifier would
 * overstate the true daily figure substantially.
 */
import { clsx } from "clsx";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { Coverage } from "@/types/analytics";

function hourList(hours: number[]): string {
  if (hours.length === 0) return "none";
  // Collapse consecutive hours into ranges: [8,9,10,14] -> "08:00-10:00, 14:00"
  const runs: Array<[number, number]> = [];
  let start = hours[0];
  let prev = hours[0];
  for (const h of hours.slice(1)) {
    if (h === prev + 1) { prev = h; continue; }
    runs.push([start, prev]);
    start = prev = h;
  }
  runs.push([start, prev]);
  const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return runs.map(([a, b]) => (a === b ? pad(a) : `${pad(a)}–${pad(b)}`)).join(", ");
}

export default function CoverageNotice({ coverage }: { coverage: Coverage }) {
  const ratio = coverage.coverage_ratio ?? 0;
  const pct = Math.round(ratio * 100);
  const hoursCount = coverage.hours_present.length;
  const partial = hoursCount < 24;

  // Anything under near-total coverage changes how the statistics below should
  // be read, so the notice escalates rather than staying decorative.
  const severity = ratio >= 0.95 && !partial ? "ok" : ratio >= 0.3 ? "partial" : "sparse";
  const Icon = severity === "ok" ? CheckCircle2 : AlertTriangle;

  return (
    <section
      className={clsx(
        "rounded-xl border p-4",
        severity === "ok"
          ? "border-surface-border bg-surface-card"
          : "border-amber-500/40 bg-amber-500/10",
      )}
    >
      <div className="flex items-start gap-3">
        <Icon
          size={16}
          className={clsx("shrink-0 mt-0.5", severity === "ok" ? "text-brand-green" : "text-amber-500")}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Data coverage — read this before the numbers below
          </p>

          <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
            The sensor recorded{" "}
            <strong className="text-slate-200 font-mono-num">{coverage.samples.toLocaleString()}</strong>{" "}
            readings, about{" "}
            <strong className="text-slate-200 font-mono-num">{pct}%</strong>{" "}
            of what a continuously-running sensor would have produced, covering{" "}
            <strong className="text-slate-200">{hourList(coverage.hours_present)}</strong>
            {partial && <> — <strong className="text-slate-200">{24 - hoursCount} hours of each day are never observed</strong></>}.
          </p>

          {partial && (
            <p className="text-sm text-amber-500/90 mt-2 leading-relaxed">
              Every percentage and probability on this page is therefore{" "}
              <strong>conditional on the monitored hours</strong>, not the full
              day. Because those hours are the warmest part of the day, a figure
              like &ldquo;57% of readings above 32&nbsp;°C&rdquo; is higher than
              the true all-day figure would be. The gaps are not random — they
              track time of day, which drives temperature — so this cannot be
              corrected by reweighting, only by recording for longer.
            </p>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5 text-[11px] text-slate-500 font-mono-num">
            <span className="flex items-center gap-1">
              <Clock size={11} />
              typical gap {coverage.median_gap_seconds != null ? `${coverage.median_gap_seconds.toFixed(0)}s` : "—"}
            </span>
            <span>
              longest gap{" "}
              {coverage.max_gap_seconds != null
                ? `${(coverage.max_gap_seconds / 3600).toFixed(1)}h`
                : "—"}
            </span>
            <span>{coverage.samples.toLocaleString()} of {coverage.expected_samples.toLocaleString()} expected</span>
          </div>
        </div>
      </div>
    </section>
  );
}
