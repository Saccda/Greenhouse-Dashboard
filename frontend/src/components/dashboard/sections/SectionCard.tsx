"use client";
/**
 * One sensor domain, summarised, with a link to its own page.
 *
 * The Dashboard used to be a flat row of four figures. That worked while there
 * were four. PP Campus now also reports tank water temperature, and soil
 * probes are coming with two or three values of their own — a flat row becomes
 * ten unlabelled numbers, which is a list, not a dashboard.
 *
 * So each domain gets a card: the one or two figures worth seeing without
 * asking, a small shape showing where they have just been, and a link to the
 * page that carries the detail. Everything else goes behind that link.
 *
 * A card is rendered only when the farm HAS that sensor. A permanent "no data"
 * panel is worse than no panel — it spends the most valuable space on the
 * screen telling you nothing, every day, forever.
 */
import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { clsx } from "clsx";

export interface FooterStat {
  label: string;
  value: string;
  /** Draws attention to one figure. Used sparingly, or it stops meaning anything. */
  tone?: "normal" | "good" | "warn";
}

export default function SectionCard({
  icon: Icon,
  iconClass,
  title,
  subtitle,
  href,
  footer,
  children,
}: {
  icon: LucideIcon;
  /** Tint for the icon chip, so domains stay recognisable at a glance. */
  iconClass: string;
  title: string;
  subtitle: string;
  href: string;
  footer?: FooterStat[];
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface-card border border-surface-border rounded-xl p-4 flex flex-col min-w-0 h-full">
      <div className="flex items-start gap-3">
        <span className={clsx("shrink-0 grid place-items-center w-9 h-9 rounded-xl", iconClass)}>
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-slate-100 leading-tight">{title}</h2>
          <p className="text-[12px] text-slate-400 mt-0.5 leading-snug">{subtitle}</p>
        </div>
        {/* The whole card is not a link on purpose: these carry values people
            select and copy, and a card-wide click target fights that. */}
        <Link
          href={href}
          aria-label={`Open ${title}`}
          className="shrink-0 text-slate-500 hover:text-slate-200 transition-colors p-1 -m-1 rounded"
        >
          <ArrowUpRight size={16} />
        </Link>
      </div>

      <div className="flex-1 min-w-0 min-h-0 mt-4 flex flex-col">{children}</div>

      {/* Current values as chips under the chart. Boxed rather than bare so
          they read as a row of readings instead of a caption — the chart is
          history, these are now, and the visual break says which is which.
          Wraps rather than squeezing: four chips at 320px would otherwise
          each be too narrow for "35.9 °C". */}
      {footer && footer.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {footer.map((s) => (
            <div
              key={s.label}
              className="flex-1 min-w-[6.5rem] rounded-lg bg-surface-hover px-3 py-2"
            >
              <div className="text-[10px] uppercase tracking-wider text-slate-500 truncate">
                {s.label}
              </div>
              <div
                className={clsx(
                  "text-[15px] font-semibold font-mono-num tabular-nums mt-0.5 truncate",
                  s.tone === "good" && "text-brand-green",
                  s.tone === "warn" && "text-[color:var(--warn-ink)]",
                  (!s.tone || s.tone === "normal") && "text-slate-100",
                )}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
