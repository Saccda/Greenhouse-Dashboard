"use client";
/**
 * The furniture every section page is built from.
 *
 * One shell, so four pages that were written separately cannot drift into
 * four slightly different card paddings and heading sizes.
 */
import { AlertTriangle } from "lucide-react";

export function Panel({
  title, aside, children, className,
}: {
  title?: string;
  /** Right-aligned context for the heading: a legend, a total, a caveat. */
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`bg-surface-card border border-surface-border rounded-xl p-4 flex flex-col min-w-0 ${className ?? ""}`}
    >
      {(title || aside) && (
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
          {title && <h2 className="text-sm font-semibold text-slate-200">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Said only when something is wrong.
 *
 * A permanent "all fine" badge is one people stop reading, which is how
 * eighteen days of silence went unnoticed on this system. Silence means fine.
 */
export function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[13px] text-slate-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5 mb-4 leading-relaxed">
      <AlertTriangle size={15} className="shrink-0 mt-0.5 text-[color:var(--warn-ink)]" />
      <span>{children}</span>
    </p>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full min-h-[8rem] grid place-items-center bg-surface-card border border-surface-border rounded-xl p-6">
      <p className="text-[13px] text-slate-400 text-center max-w-md leading-relaxed">{children}</p>
    </div>
  );
}

/** A small labelled figure, for rows of supporting numbers inside a panel. */
export function Stat({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-lg bg-surface-hover px-3 py-2.5 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 truncate">{label}</div>
      <div
        className={`text-[17px] font-semibold font-mono-num tabular-nums mt-0.5 truncate ${
          tone === "warn" ? "text-[color:var(--warn-ink)]"
            : tone === "ok" ? "text-brand-green" : "text-slate-100"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

/** A row in a thresholds table. */
export function ThresholdRow({
  metric, low, high, current, unit,
}: {
  metric: string;
  low?: number | null;
  high?: number | null;
  current?: number | null;
  unit: string;
}) {
  const over = current != null && high != null && current >= high;
  const under = current != null && low != null && current <= low;
  const known = current != null;

  return (
    <tr className="border-t border-surface-border">
      <td className="py-2 text-slate-300">{metric}</td>
      <td className="py-2 text-right font-mono-num text-slate-500">
        {low != null ? low.toFixed(1) : "—"}
      </td>
      <td className="py-2 text-right font-mono-num text-slate-500">
        {high != null ? high.toFixed(1) : "—"}
      </td>
      <td className="py-2 text-right font-mono-num text-slate-100">
        {known ? `${current.toFixed(1)} ${unit}` : "—"}
      </td>
      <td className="py-2 pl-4 text-[12px]">
        {!known ? (
          <span className="text-slate-500">No reading</span>
        ) : over ? (
          <span className="text-[color:var(--warn-ink)] font-medium">Above limit</span>
        ) : under ? (
          <span className="text-[color:var(--warn-ink)] font-medium">Below limit</span>
        ) : (
          <span className="text-slate-500">Within limits</span>
        )}
      </td>
    </tr>
  );
}
