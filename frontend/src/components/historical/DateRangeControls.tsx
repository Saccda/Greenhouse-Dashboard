"use client";
import { useState, useRef, useEffect } from "react";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isSameMonth,
  isWithinInterval, isBefore, isAfter, parseISO,
} from "date-fns";
import { CalendarDays, BarChart3, ChevronDown, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { clsx } from "clsx";
import type { Aggregation } from "@/types";

export interface RangePreset {
  label: string;
  start: () => string;
  end: () => string;
}

function useClickOutside<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onOutside();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onOutside]);
  return ref;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function MonthGrid({
  anchor, rangeStart, rangeEnd, previewStart, previewEnd, onPick, onHover,
}: {
  anchor: Date; rangeStart: Date; rangeEnd: Date;
  previewStart: Date | null; previewEnd: Date | null;
  onPick: (d: Date) => void; onHover: (d: Date | null) => void;
}) {
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const days = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(monthEnd) });
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const previewLo = previewStart && previewEnd && isBefore(previewEnd, previewStart) ? previewEnd : previewStart;
  const previewHi = previewStart && previewEnd && isBefore(previewEnd, previewStart) ? previewStart : previewEnd;

  return (
    <div>
      <p className="text-xs font-semibold text-slate-300 text-center mb-2">{format(anchor, "MMMM yyyy")}</p>
      <div className="grid grid-cols-7 gap-y-1">
        {WEEKDAYS.map((d) => (
          <span key={d} className="text-[10px] text-slate-600 font-medium text-center">{d}</span>
        ))}
        {days.map((day) => {
          if (!isSameMonth(day, anchor)) return <span key={day.toISOString()} />;
          const future = isAfter(day, today);
          const isStart = isSameDay(day, rangeStart);
          const isEnd = isSameDay(day, rangeEnd);
          const inCommitted = !future && isWithinInterval(day, { start: rangeStart, end: rangeEnd });
          const inPreview = !future && previewLo && previewHi && isWithinInterval(day, { start: previewLo, end: previewHi });
          const isToday = isSameDay(day, today);
          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={future}
              onClick={() => onPick(day)}
              onMouseEnter={() => onHover(day)}
              className={clsx(
                "h-7 w-7 mx-auto text-xs rounded-full flex items-center justify-center transition-colors",
                future && "text-slate-700 cursor-not-allowed",
                !future && (isStart || isEnd) && "bg-brand-green text-black font-bold",
                !future && !isStart && !isEnd && (inCommitted || inPreview) && "bg-brand-green/15 text-brand-green",
                !future && !isStart && !isEnd && !inCommitted && !inPreview && "text-slate-300 hover:bg-surface-hover",
                isToday && !isStart && !isEnd && "ring-1 ring-brand-green/50",
              )}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface DateRangePickerProps {
  start: string;
  end: string;
  presets: RangePreset[];
  onChange: (start: string, end: string) => void;
}

export function DateRangePicker({ start, end, presets, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(parseISO(end)));
  const [pendingStart, setPendingStart] = useState<Date | null>(null);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  // Deliberately only on the open/close transition, not on every start/end change - this
  // resets the popover's scratch state (visible month, in-progress pick) each time it's
  // opened. Depending on `start` here too would re-fire after the *first* of a two-click
  // range pick (which already commits a same-day range as an interim value) and wipe out
  // pendingStart before the second click can complete the range.
  useEffect(() => {
    if (open) {
      setVisibleMonth(startOfMonth(parseISO(start)));
      setPendingStart(null);
      setHoverDate(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const rangeStart = parseISO(start);
  const rangeEnd = parseISO(end);
  const activePreset = presets.find((p) => p.start() === start && p.end() === end);

  function handlePick(day: Date) {
    if (!pendingStart) {
      const iso = format(day, "yyyy-MM-dd");
      setPendingStart(day);
      onChange(iso, iso);
    } else {
      const lo = isBefore(day, pendingStart) ? day : pendingStart;
      const hi = isBefore(day, pendingStart) ? pendingStart : day;
      onChange(format(lo, "yyyy-MM-dd"), format(hi, "yyyy-MM-dd"));
      setPendingStart(null);
      setOpen(false);
    }
  }

  function handlePreset(p: RangePreset) {
    onChange(p.start(), p.end());
    setPendingStart(null);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-surface-hover border border-surface-bright text-slate-200 text-sm rounded-md px-3 py-1.5 hover:border-brand-green/40 transition-colors"
      >
        <CalendarDays size={18} className="text-brand-green shrink-0" />
        <span className="font-medium whitespace-nowrap">{activePreset ? activePreset.label : "Custom"}</span>
        <span className="text-slate-500 font-mono-num whitespace-nowrap">
          ({format(rangeStart, "MM/dd/yyyy")} - {format(rangeEnd, "MM/dd/yyyy")})
        </span>
        <ChevronDown size={13} className={clsx("text-slate-500 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-30 top-full left-0 mt-2 bg-surface-card border border-surface-border rounded-xl shadow-xl p-4 flex gap-4 w-max">
          <div className="flex flex-col gap-1 pr-4 border-r border-surface-border min-w-[132px]">
            {presets.map((p) => {
              const active = p.start() === start && p.end() === end;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handlePreset(p)}
                  className={clsx(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-left transition-colors",
                    active
                      ? "bg-brand-green/20 text-brand-green font-semibold"
                      : "text-slate-400 hover:bg-surface-hover hover:text-slate-200",
                  )}
                >
                  {active && <Check size={11} strokeWidth={3} className="shrink-0" />}
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-start gap-1">
            <button
              type="button"
              onClick={() => setVisibleMonth((m) => subMonths(m, 1))}
              className="mt-6 p-1 rounded hover:bg-surface-hover text-slate-400 shrink-0"
              aria-label="Previous month"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="flex gap-6" onMouseLeave={() => setHoverDate(null)}>
              <MonthGrid
                anchor={visibleMonth} rangeStart={rangeStart} rangeEnd={rangeEnd}
                previewStart={pendingStart} previewEnd={pendingStart ? hoverDate : null}
                onPick={handlePick} onHover={setHoverDate}
              />
              <MonthGrid
                anchor={addMonths(visibleMonth, 1)} rangeStart={rangeStart} rangeEnd={rangeEnd}
                previewStart={pendingStart} previewEnd={pendingStart ? hoverDate : null}
                onPick={handlePick} onHover={setHoverDate}
              />
            </div>
            <button
              type="button"
              onClick={() => setVisibleMonth((m) => addMonths(m, 1))}
              className="mt-6 p-1 rounded hover:bg-surface-hover text-slate-400 shrink-0"
              aria-label="Next month"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const AGG_LABELS: Record<Aggregation, string> = {
  "1m": "1 minute", "5m": "5 minutes", "15m": "15 minutes",
  "1h": "1 hour", "6h": "6 hours", "1d": "1 day",
};

interface AggregationDropdownProps {
  value: "auto" | Aggregation;
  autoValue: Aggregation;
  options: Aggregation[];
  onChange: (v: "auto" | Aggregation) => void;
}

export function AggregationDropdown({ value, autoValue, options, onChange }: AggregationDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  const display = value === "auto" ? `${autoValue} (auto)` : value;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-surface-hover border border-surface-bright text-slate-200 text-sm rounded-md px-3 py-1.5 hover:border-brand-green/40 transition-colors"
      >
        <BarChart3 size={13} className="text-slate-500 shrink-0" />
        <span className="font-mono-num font-semibold whitespace-nowrap">{display}</span>
        <ChevronDown size={13} className={clsx("text-slate-500 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-30 top-full right-0 mt-2 bg-surface-card border border-surface-border rounded-xl shadow-xl p-1.5 w-44">
          <button
            type="button"
            onClick={() => { onChange("auto"); setOpen(false); }}
            className={clsx(
              "flex items-center justify-between w-full px-2.5 py-1.5 rounded-md text-xs text-left transition-colors",
              value === "auto"
                ? "bg-brand-green/20 text-brand-green font-semibold"
                : "text-slate-400 hover:bg-surface-hover hover:text-slate-200",
            )}
          >
            Auto ({autoValue})
            {value === "auto" && <Check size={12} strokeWidth={3} />}
          </button>
          <div className="my-1 border-t border-surface-border" />
          {options.map((o) => {
            const active = value === o;
            return (
              <button
                key={o}
                type="button"
                onClick={() => { onChange(o); setOpen(false); }}
                className={clsx(
                  "flex items-center justify-between w-full px-2.5 py-1.5 rounded-md text-xs text-left transition-colors",
                  active
                    ? "bg-brand-green/20 text-brand-green font-semibold"
                    : "text-slate-400 hover:bg-surface-hover hover:text-slate-200",
                )}
              >
                {AGG_LABELS[o]}
                {active && <Check size={12} strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
