"use client";
import { clsx } from "clsx";
import {
  Droplets,
  Wind,
  CloudDrizzle,
  Zap,
  Snowflake,
  type LucideIcon,
} from "lucide-react";
import type { RelayStatus } from "@/types";

const ICON_MAP: Record<string, LucideIcon> = {
  droplets:        Droplets,
  wind:            Wind,
  "cloud-drizzle": CloudDrizzle,
  zap:             Zap,
  snowflake:       Snowflake,
};

interface RelayIndicatorProps {
  relay:      RelayStatus;
  className?: string;
  /** Present + relay.controllable → card becomes a clickable toggle (campus channels). */
  onToggle?:  (relay: RelayStatus) => void;
  pending?:   boolean;
}

export default function RelayIndicator({ relay, className, onToggle, pending = false }: RelayIndicatorProps) {
  const isOn        = relay.state === "ON";
  const isUnknown   = relay.state === "UNKNOWN";
  const Icon        = ICON_MAP[relay.icon] ?? Zap;
  const isClickable = relay.controllable && !!onToggle;

  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-pressed={isClickable ? isOn : undefined}
      aria-disabled={isClickable ? pending : undefined}
      onClick={isClickable && !pending ? () => onToggle!(relay) : undefined}
      onKeyDown={
        isClickable && !pending
          ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle!(relay); } }
          : undefined
      }
      className={clsx(
        "flex flex-col items-center gap-3 p-4 rounded-xl",
        "bg-surface-card border",
        isOn
          ? "border-status-active/30 shadow-[0_0_20px_rgba(74,222,128,0.08)]"
          : isUnknown
          ? "border-status-warning/30"
          : "border-surface-border",
        "transition-all duration-300",
        isClickable && !pending && "cursor-pointer hover:border-brand-green/40",
        pending && "opacity-60 cursor-wait",
        className,
      )}
    >
      {/* LED circle */}
      <div className="relative flex items-center justify-center">
        {isOn && (
          <span className="led-ring text-status-active pointer-events-none" aria-hidden />
        )}
        <div
          className={clsx(
            "w-12 h-12 rounded-full flex items-center justify-center",
            "border-2 relative z-10 transition-colors duration-300",
            isOn
              ? "bg-status-active/15 border-status-active text-status-active led-active"
              : isUnknown
              ? "bg-status-warning/15 border-status-warning text-status-warning led-unknown"
              : "bg-surface-hover border-slate-700 text-slate-600",
          )}
          style={{ color: isOn ? "#4ade80" : isUnknown ? "#fbbf24" : "#6b7280" }}
        >
          <Icon size={20} />
        </div>
      </div>

      {/* Label + description */}
      <div className="text-center">
        <p className="text-xs font-semibold tracking-wider uppercase text-slate-300">
          {relay.label}
        </p>
        {relay.description && (
          <p className="text-[10px] text-slate-600 mt-0.5 leading-tight">
            {relay.description}
          </p>
        )}
        <p
          className={clsx(
            "text-[11px] font-bold mt-1.5 tracking-widest uppercase font-mono-num",
            isOn
              ? "text-status-active"
              : isUnknown
              ? "text-status-warning"
              : "text-slate-600",
          )}
        >
          {relay.state}
        </p>
      </div>

      {/* Status dot + key */}
      <div className="flex items-center gap-1.5">
        <span
          className={clsx(
            "w-1.5 h-1.5 rounded-full",
            isOn ? "bg-status-active animate-pulse" : "bg-slate-700",
          )}
        />
        <span className="text-[10px] text-slate-600 font-mono-num uppercase">
          {relay.key}
        </span>
      </div>

      {isClickable && (
        <p className="text-[9px] text-slate-600 uppercase tracking-widest">
          {pending ? "Sending…" : "Tap to toggle"}
        </p>
      )}
    </div>
  );
}

// ── Panel: renders all relays side-by-side ────────────────────────────────

interface RelayPanelProps {
  relays:      RelayStatus[];
  isLoading?:  boolean;
  onToggle?:   (relay: RelayStatus) => void;
  pendingKeys?: Set<string>;
}

export function RelayPanel({ relays, isLoading = false, onToggle, pendingKeys }: RelayPanelProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 rounded-xl bg-surface-hover animate-pulse" />
        ))}
      </div>
    );
  }

  if (!relays.length) {
    return (
      <p className="text-sm text-slate-600 text-center py-6">
        No relay data available
      </p>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
      {relays.map((relay) => (
        <RelayIndicator
          key={relay.key}
          relay={relay}
          onToggle={onToggle}
          pending={pendingKeys?.has(relay.key)}
        />
      ))}
    </div>
  );
}
