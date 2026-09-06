"use client";
/**
 * SprayEffectPanel — did spraying actually cool the greenhouse, and by how much?
 *
 * The verdict comes from the backend rather than being derived in the UI, so
 * the distinction that matters most cannot be lost in presentation: a wide
 * interval straddling zero means "we could not detect an effect", which is NOT
 * the same claim as "spraying does nothing". With a handful of events the
 * honest answer is that the comparison is underpowered, and the panel says so
 * in those words.
 *
 * The confounds are rendered as part of the result, not tucked behind a
 * tooltip — this is observational data, and the design cannot support a causal
 * claim no matter how the numbers land.
 */
import { clsx } from "clsx";
import { AlertTriangle, Info, TrendingDown, TrendingUp, HelpCircle } from "lucide-react";
import type { SprayEffect, WaterEfficiency, EffectVerdict } from "@/types/analytics";

const VERDICT_STYLE: Record<EffectVerdict, { cls: string; Icon: typeof Info }> = {
  insufficient_data:    { cls: "border-surface-border bg-surface-hover text-slate-400", Icon: HelpCircle },
  underpowered:         { cls: "border-amber-500/40 bg-amber-500/10 text-amber-500",    Icon: AlertTriangle },
  no_detectable_effect: { cls: "border-surface-border bg-surface-hover text-slate-300", Icon: Info },
  cooling_detected:     { cls: "border-brand-green/40 bg-brand-green/10 text-brand-green", Icon: TrendingDown },
  warming_detected:     { cls: "border-amber-500/40 bg-amber-500/10 text-amber-500",    Icon: TrendingUp },
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-surface-hover ring-1 ring-surface-border rounded-xl px-3.5 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-[22px] font-bold font-mono-num tabular-nums text-slate-100 mt-1 leading-none">{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-2 leading-snug">{hint}</p>}
    </div>
  );
}

export default function SprayEffectPanel({
  effect,
  water,
}: {
  effect: SprayEffect;
  water: WaterEfficiency | null;
}) {
  const { interpretation: verdict } = effect;
  const style = VERDICT_STYLE[verdict.verdict] ?? VERDICT_STYLE.no_detectable_effect;
  const { Icon } = style;

  const fmt = (v: number | null, digits = 2, sign = false) =>
    v == null ? "—" : `${sign && v > 0 ? "+" : ""}${v.toFixed(digits)}`;

  return (
    <div className="space-y-4">
      {/* Verdict — the headline claim, phrased so it can't be over-read */}
      <div className={clsx("flex items-start gap-3 rounded-lg border p-3.5", style.cls)}>
        <Icon size={16} className="shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{verdict.headline}</p>
          <p className="text-xs mt-1 leading-relaxed opacity-90">{verdict.detail}</p>
        </div>
      </div>

      {/* The numbers behind it */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Mean change"
          value={effect.mean_difference == null ? "—" : `${fmt(effect.mean_difference, 2, true)} °C`}
          hint="after − before, averaged over events"
        />
        <Stat
          label={`${(effect.confidence * 100).toFixed(0)}% CI`}
          value={
            effect.ci_lower == null
              ? "—"
              : `${fmt(effect.ci_lower, 2, true)} … ${fmt(effect.ci_upper, 2, true)}`
          }
          hint={effect.ci_lower != null && effect.ci_upper != null && effect.ci_lower < 0 && effect.ci_upper > 0
            ? "spans zero — no reliable direction"
            : "does not span zero"}
        />
        <Stat
          label="Events used"
          value={`${effect.n_events_used} / ${effect.n_events_total}`}
          hint={effect.n_events_skipped > 0
            ? `${effect.n_events_skipped} skipped — window outside monitored hours`
            : "all events had usable windows"}
        />
        <Stat
          label="Smallest detectable"
          value={effect.resolution_c == null ? "—" : `±${effect.resolution_c.toFixed(2)} °C`}
          hint="effects smaller than this are invisible at this sample size"
        />
      </div>

      {/* Secondary statistics, shown but deliberately de-emphasised relative to
          the interval — a p-value alone says nothing about effect size. */}
      {(effect.p_value != null || effect.cohens_d != null) && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-500 font-mono-num">
          {effect.p_value != null && (
            <span>paired t-test p = {effect.p_value < 0.001 ? "<0.001" : effect.p_value.toFixed(3)}</span>
          )}
          {effect.cohens_d != null && <span>Cohen&apos;s d = {fmt(effect.cohens_d, 2, true)}</span>}
          <span>comparison window = ±{effect.window_minutes} min around each event</span>
        </div>
      )}

      {/* Water efficiency — only meaningful when cooling was actually measured */}
      {water && (
        <div className="rounded-lg border border-surface-border bg-surface-hover p-3">
          <p className="text-[11px] uppercase tracking-widest text-slate-500">Water cost of cooling</p>
          {water.liters_per_degree != null ? (
            <p className="text-sm text-slate-300 mt-1">
              <strong className="font-mono-num text-slate-100">
                {water.liters_per_degree.toFixed(0)} L
              </strong>{" "}
              of water per °C of measured cooling
              <span className="text-slate-600 font-mono-num">
                {" "}({water.liters_total.toFixed(0)} L total ÷ {water.mean_cooling_c.toFixed(2)} °C)
              </span>
            </p>
          ) : (
            <p className="text-sm text-slate-400 mt-1">{water.note}</p>
          )}
        </div>
      )}

      {/* Per-event detail — small n, so showing every pair is both feasible and
          the honest thing to do rather than hiding it behind an average. */}
      {effect.pairs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-600 border-b border-surface-border">
                <th className="pb-2 pr-4 font-medium">Spray started</th>
                <th className="pb-2 pr-4 font-medium text-right">Duration</th>
                <th className="pb-2 pr-4 font-medium text-right">Before</th>
                <th className="pb-2 pr-4 font-medium text-right">After</th>
                <th className="pb-2 font-medium text-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {effect.pairs.map((p) => (
                <tr key={p.start_time} className="border-b border-surface-border/40 last:border-0">
                  <td className="py-1.5 pr-4 text-slate-400 font-mono-num">
                    {p.start_time.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="py-1.5 pr-4 text-right text-slate-500 font-mono-num">
                    {p.duration_minutes != null ? `${p.duration_minutes.toFixed(1)}m` : "—"}
                  </td>
                  <td className="py-1.5 pr-4 text-right text-slate-300 font-mono-num">{p.before.toFixed(2)}</td>
                  <td className="py-1.5 pr-4 text-right text-slate-300 font-mono-num">{p.after.toFixed(2)}</td>
                  <td
                    className={clsx(
                      "py-1.5 text-right font-mono-num font-semibold",
                      p.difference < 0 ? "text-brand-green" : "text-amber-500",
                    )}
                  >
                    {fmt(p.difference, 2, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confounds — part of the result, not a disclaimer */}
      <div className="rounded-lg border border-surface-border bg-surface-card p-3">
        <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-1.5">
          Why this is association, not proof
        </p>
        <ul className="space-y-1">
          {effect.confounds.map((c) => (
            <li key={c} className="text-xs text-slate-500 leading-relaxed flex gap-2">
              <span className="text-slate-700 shrink-0">•</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
