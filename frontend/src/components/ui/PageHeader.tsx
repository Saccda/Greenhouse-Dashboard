import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The opening of a page: what it is, and one line on what it is for.
 *
 * Before this, page titles ran from text-sm to text-2xl across eight different
 * treatments, and three pages — Historical, Analytics, Control — had no title
 * at all. A reader landing on one of those had to infer where they were from
 * the sidebar highlight.
 *
 * The description is not decoration. These pages show numbers whose meaning is
 * not obvious from a column heading: whether a reading is live or averaged,
 * whether a control writes to hardware or to a preference. One sentence at the
 * top is the cheapest place to say so.
 *
 * Deliberately NOT the sticky bar used by Alert Log, Roadmap, Settings and
 * Overview. Those carry toolbar actions and need to stay put while the body
 * scrolls; these pages already have the farm and connection bar above them, so
 * a second fixed strip would cost vertical room for nothing.
 */
export default function PageHeader({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  /** Optional controls, right-aligned; wraps beneath on narrow screens. */
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-100 tracking-tight">
          {Icon && <Icon size={18} className="shrink-0 text-slate-400" />}
          {title}
        </h1>
        {description && (
          <p className="text-[13px] text-slate-400 mt-1.5 max-w-3xl leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}
