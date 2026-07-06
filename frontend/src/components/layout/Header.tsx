"use client";
import { RefreshCw, Wifi, WifiOff, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { format } from "date-fns";
import type { Farm } from "@/types";

interface HeaderProps {
  selectedFarm:      string;
  farms:             Farm[];
  onFarmChange:      (id: string) => void;
  connectionStatus:  "online" | "offline" | "loading";
  lastUpdated:       Date | null;
  isLoading:         boolean;
  onRefresh:         () => void;
}

export default function Header({
  selectedFarm,
  farms,
  onFarmChange,
  connectionStatus,
  lastUpdated,
  isLoading,
  onRefresh,
}: HeaderProps) {
  const farmLabel = farms.find((f) => f.id === selectedFarm)?.display_name ?? selectedFarm;

  return (
    <header className="flex items-center justify-between px-6 h-14 shrink-0 bg-surface-card border-b border-surface-border">
      {/* Left: title + farm selector */}
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-sm font-semibold text-slate-100 leading-none">
            FarmOS
          </h1>
          <p className="text-[11px] text-slate-500 mt-0.5">{farmLabel}</p>
        </div>

        {farms.length > 1 && (
          <select
            value={selectedFarm}
            onChange={(e) => onFarmChange(e.target.value)}
            className={clsx(
              "text-xs bg-surface-hover border border-surface-bright",
              "text-slate-200 rounded-md px-2.5 py-1.5",
              "focus:outline-none focus:ring-1 focus:ring-brand-green/50 cursor-pointer",
            )}
          >
            {farms.map((f) => (
              <option key={f.id} value={f.id}>{f.display_name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Right: last update + connection + refresh */}
      <div className="flex items-center gap-4">
        {lastUpdated && (
          <span className="text-[11px] text-slate-500 font-mono-num hidden sm:block">
            Updated {format(lastUpdated, "HH:mm:ss")}
          </span>
        )}

        <ConnectionBadge status={connectionStatus} />

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs",
            "bg-surface-hover border border-surface-bright text-slate-300",
            "hover:bg-surface-bright hover:text-slate-100",
            "disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150",
          )}
        >
          {isLoading
            ? <Loader2 size={12} className="animate-spin" />
            : <RefreshCw size={12} />}
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>
    </header>
  );
}

function ConnectionBadge({ status }: { status: "online" | "offline" | "loading" }) {
  if (status === "online")
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-status-active">
        <Wifi size={12} />
        <span className="hidden sm:inline">Online</span>
      </span>
    );
  if (status === "loading")
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <Loader2 size={12} className="animate-spin" />
        <span className="hidden sm:inline">Connecting</span>
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-status-danger">
      <WifiOff size={12} />
      <span className="hidden sm:inline">Offline</span>
    </span>
  );
}
