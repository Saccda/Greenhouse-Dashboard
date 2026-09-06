"use client";
/**
 * Shared card primitives for the Analytics page.
 *
 * Deliberately built in the same visual language as components/ui/KPICard.tsx
 * (the Dashboard's Temperature/Humidity cards) so the two pages read as one
 * product: 2xl radius, p-5, min-height, bold 16px title top-left with the icon
 * top-right, a large centred value, a hover gradient wash, and a status accent
 * down the left edge.
 *
 * The one addition over KPICard is a divided footer slot, because these cards
 * carry a methodological caveat as well as a reading — and those two must not
 * compete for the same visual position.
 *
 * Type scale (floor of 12px; nothing smaller than 11px anywhere, and 11px only
 * for tags):
 *   Card title      16px semibold            slate-300
 *   Value           48px extrabold tabular   tone colour
 *   Description     15px                     slate-300
 *   Footer note     14px                     slate-500
 *   Metric value    24px bold tabular        slate-100
 *   Metric label    12px medium uppercase    slate-400
 */
import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";

export type Tone = "neutral" | "good" | "warn" | "bad";

/** Value colour. Neutral matches KPICard's sky accent so the pages agree. */
const TONE_VALUE: Record<Tone, string> = {
  neutral: "text-sky-400",
  good:    "text-brand-green",
  warn:    "text-amber-500",
  bad:     "text-red-400",
};

/** Left-edge accent, mirroring KPICard's status border. */
const TONE_ACCENT: Record<Tone, string> = {
  neutral: "bg-sky-400/70",
  good:    "bg-green-400",
  warn:    "bg-amber-400",
  bad:     "bg-red-500",
};

/**
 * Verdict text under the value. Plain coloured type rather than a pill: the
 * words themselves carry the meaning, so the pill's background was chrome
 * around a label that already reads fine on its own.
 */
const TONE_VERDICT: Record<Tone, string> = {
  neutral: "text-slate-400 group-hover:text-white/75",
  good:    "text-brand-green group-hover:text-white",
  warn:    "text-amber-500 group-hover:text-white",
  bad:     "text-red-400 group-hover:text-white",
};

const TONE_BADGE: Record<Tone, string> = {
  neutral: "bg-sky-400/15 text-sky-400 group-hover:bg-white group-hover:text-sky-600",
  good:    "bg-brand-green/15 text-brand-green group-hover:bg-white group-hover:text-green-700",
  warn:    "bg-amber-500/15 text-amber-500 group-hover:bg-white group-hover:text-amber-700",
  bad:     "bg-red-500/15 text-red-400 group-hover:bg-white group-hover:text-red-700",
};

/** Base surface, matching the Dashboard card shell. */
export function Panel({
  children, className, interactive = false,
}: {
  children: React.ReactNode; className?: string; interactive?: boolean;
}) {
  return (
    <div
      className={clsx(
        "relative rounded-2xl border border-surface-border bg-surface-card overflow-hidden",
        "transition-all duration-300",
        interactive && "hover:border-slate-600/70",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Title + icon row, in KPICard's arrangement: label left, icon right. */
export function CardHeader({
  icon: Icon, title, subtitle, badge, badgeTone = "neutral",
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeTone?: Tone;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-base font-semibold leading-tight text-slate-200">{title}</p>
        {subtitle && <p className="text-sm text-slate-500 mt-1.5 leading-snug">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        {badge && (
          <span className={clsx(
            "text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap",
            TONE_BADGE[badgeTone],
          )}>
            {badge}
          </span>
        )}
        {Icon && <Icon size={20} strokeWidth={1.5} className="shrink-0 text-sky-400" />}
      </div>
    </div>
  );
}

/**
 * Headline KPI card — the Dashboard's card shape, with a footer slot added.
 *
 * `facts` is the reading in plain words. `note` is the methodological caveat,
 * pinned below a divider so cards in a row stay aligned and the caveat never
 * reads as part of the finding.
 */
export function StatCard({
  icon: Icon, label, value, unit, facts, note, tone = "neutral", badge,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  facts: string;
  note?: string;
  tone?: Tone;
  badge?: string;
}) {
  return (
    <div className={clsx(
      "group relative flex flex-col rounded-2xl px-5 py-4 overflow-hidden h-full",
      "bg-surface-card border border-surface-border transition-all duration-300",
    )}>
      {/* Hover wash, as on the Dashboard cards */}
      <div className="absolute inset-0 bg-gradient-to-br from-sky-500 to-sky-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

      {/* Status accent down the left edge */}
      <div className={clsx(
        "absolute left-0 top-3 bottom-3 w-[3px] rounded-full transition-opacity duration-300 group-hover:opacity-0",
        TONE_ACCENT[tone],
      )} />

      {/*
       * Every zone below has a FIXED height rather than flexing to its content.
       * Cards in a row otherwise centre their value at different heights and
       * put their divider in a different place, because the description lines
       * wrap differently — so the row reads as misaligned even though each card
       * is individually fine.
       */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Title + icon — one line, fixed */}
        <div className="flex items-start justify-between gap-3 h-6">
          <p className="text-base font-semibold leading-tight text-slate-200 group-hover:text-white transition-colors duration-300 truncate">
            {label}
          </p>
          {Icon && (
            <Icon size={20} strokeWidth={1.5}
              className="shrink-0 text-sky-400 group-hover:text-white/70 transition-colors duration-300" />
          )}
        </div>

        {/*
         * Value and verdict, LEFT-aligned and stacked.
         *
         * Everything else in the card — label, description, note — is
         * left-aligned, so a centred value left the verdict with nowhere
         * natural to sit: beside the number it read as an afterthought, and
         * beneath it as a floating pill. Sharing the card's single left edge
         * puts the verdict directly under the figure it interprets, which is
         * also how it would be said aloud ("four percent — well below target"),
         * and gives the whole card one vertical rhythm to scan.
         *
         * Fixed height so the values line up across the row regardless of
         * whether a card has a verdict.
         */}
        <div className="h-[4.25rem] flex flex-col justify-center">
          <div className="flex items-baseline gap-1.5">
            <span className={clsx(
              "text-[42px] font-extrabold font-mono-num tabular-nums tracking-tight leading-none",
              "group-hover:text-white transition-colors duration-300",
              TONE_VALUE[tone],
            )}>
              {value}
            </span>
            {unit && (
              <span className="text-lg font-bold leading-none text-slate-500 group-hover:text-white/60 transition-colors duration-300">
                {unit}
              </span>
            )}
          </div>
          {badge && (
            <p className={clsx(
              "text-[13px] font-bold leading-none mt-1.5 transition-colors duration-300",
              TONE_VERDICT[tone],
            )}>
              {badge}
            </p>
          )}
        </div>

        {/*
         * Description block, fixed at two lines' worth of height.
         *
         * Its first line therefore starts at the same y in every card of the
         * row, and — because the block does not grow — the divider beneath it
         * also lands at the same y. A one-line description simply leaves the
         * second line empty rather than pulling the rule up.
         */}
        <p className="text-[15px] leading-snug text-slate-300 group-hover:text-white/85 transition-colors duration-300 min-h-[2.75rem] mt-1">
          {facts}
        </p>

        {/*
         * The note is NOT pinned with mt-auto. Doing that made the divider's
         * position depend on how many lines the note wrapped to, so a card
         * with a one-line note put its rule ~28px lower than its neighbours.
         * Anchoring it directly under the fixed description block instead
         * keeps every rule — and every note's first line — on the same y,
         * and lets a longer note simply run on downward.
         */}
        {note && (
          <p className="text-sm leading-snug text-slate-500 pt-2.5 mt-2.5 border-t border-surface-border/70 group-hover:text-white/60 group-hover:border-white/20 transition-colors duration-300">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Compact metric tile for a row of supporting figures (mean / median / SD /…).
 * `emphasis` marks the figure to trust most, tagged in words rather than by
 * colour alone.
 */
export function MetricTile({
  label, value, emphasis = false, emphasisLabel,
}: {
  label: string; value: string; emphasis?: boolean; emphasisLabel?: string;
}) {
  // Every tile keeps the SAME border and background. Emphasis is carried by the
  // word-tag alone — a different edge colour on one tile of four reads as an
  // inconsistency to be explained rather than as a deliberate highlight.
  return (
    <div className="rounded-xl px-4 py-3.5 ring-1 ring-surface-border bg-surface-hover transition-colors">
      <div className="flex items-center gap-2 flex-wrap h-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        {emphasis && emphasisLabel && (
          <span className="text-[11px] font-bold text-brand-green uppercase tracking-wide">
            {emphasisLabel}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold font-mono-num tabular-nums text-slate-100 mt-1.5 leading-none">
        {value}
      </p>
    </div>
  );
}

/** Footer note inside a chart card — the methodology line, clearly secondary. */
export function CardFooterNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 pt-4 border-t border-surface-border/70">
      <p className="text-sm text-slate-500 leading-relaxed">{children}</p>
    </div>
  );
}
