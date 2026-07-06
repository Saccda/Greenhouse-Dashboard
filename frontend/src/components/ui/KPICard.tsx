"use client";
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";

interface KPICardProps {
  title:      string;
  value:      string | number;
  unit?:      string;
  subtitle?:  string;
  badge?:     string;
  icon:       LucideIcon;
  isLoading?: boolean;
  isStale?:   boolean;
  className?: string;
  rawValue?:  number;
  decimals?:  number;
  status?:    "ok" | "warn" | "danger";
  // kept for backward compat, ignored
  accent?:    string;
  featured?:  boolean;
}

// ── Animated counter ──────────────────────────────────────────────────────────

function useCountUp(target: number | undefined, duration = 700): number | undefined {
  const [current, setCurrent] = useState(target);
  const frameRef = useRef<number>();
  const prevRef  = useRef(target);

  useEffect(() => {
    if (target === undefined) return;
    const from = prevRef.current ?? target;
    prevRef.current = target;
    if (from === target) return;

    const startTime = performance.now();
    const animate = (now: number) => {
      const t     = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setCurrent(from + (target - from) * eased);
      if (t < 1) frameRef.current = requestAnimationFrame(animate);
      else        setCurrent(target);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [target, duration]);

  return current;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function KPICard({
  title,
  value,
  unit,
  subtitle,
  badge,
  icon: Icon,
  isLoading = false,
  isStale   = false,
  className,
  rawValue,
  decimals  = 1,
  status,
}: KPICardProps) {
  const animatedRaw  = useCountUp(rawValue);
  const displayValue = rawValue != null && animatedRaw != null
    ? animatedRaw.toFixed(decimals)
    : value;

  return (
    <div
      className={clsx(
        "group relative flex flex-col rounded-2xl p-5 overflow-hidden min-h-[10rem]",
        "bg-surface-card border border-surface-border",
        "transition-all duration-300",
        isStale && "opacity-50",
        className,
      )}
    >
      {/* Hover gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-sky-500 to-sky-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

      {/* ── Status left border ── */}
      {status && (
        <div className={clsx(
          "absolute left-0 top-3 bottom-3 w-[3px] rounded-full transition-opacity duration-300 group-hover:opacity-0",
          status === "ok"     && "bg-green-400",
          status === "warn"   && "bg-amber-400",
          status === "danger" && "bg-red-500",
        )} />
      )}

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full">

        {/* Top: label + icon */}
        <div className="flex items-start justify-between">
          <p className="text-base font-semibold leading-tight text-slate-300 group-hover:text-white transition-colors duration-300">
            {title}
          </p>
          <Icon
            size={20}
            strokeWidth={1.5}
            className="shrink-0 text-sky-400 group-hover:text-white/70 transition-colors duration-300"
          />
        </div>

        {/* Center: value + badge */}
        <div className="flex-1 flex flex-col items-center justify-center gap-2.5">
          {isLoading ? (
            <div className="h-12 w-24 rounded-lg bg-surface-hover animate-pulse" />
          ) : (
            <>
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-5xl font-extrabold tabular-nums tracking-tight leading-none text-sky-400 group-hover:text-white transition-colors duration-300">
                  {displayValue}
                </span>
                {unit && (
                  <span className="text-xl font-bold leading-none text-slate-500 group-hover:text-white/60 transition-colors duration-300">
                    {unit}
                  </span>
                )}
              </div>
              {badge && (
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-sky-400/15 text-sky-400 group-hover:bg-white group-hover:text-sky-600 transition-all duration-300">
                  {badge}
                </span>
              )}
            </>
          )}
        </div>

        {/* Bottom: subtitle */}
        {subtitle && (
          <p className="text-xs leading-snug text-slate-600 group-hover:text-white/60 transition-colors duration-300">
            {subtitle}
          </p>
        )}
      </div>

      {/* Stale pulse dot */}
      {isStale && (
        <span className="absolute top-3 right-3 z-20 w-1.5 h-1.5 rounded-full bg-status-warning animate-pulse" />
      )}
    </div>
  );
}
