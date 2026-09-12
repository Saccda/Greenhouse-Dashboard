"use client";
import { RefreshCw, Wifi, WifiOff, SignalZero, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { format } from "date-fns";
import type { Farm } from "@/types";
import type { ConnectionStatus } from "@/lib/connection";

interface HeaderProps {
  selectedFarm:      string;
  farms:             Farm[];
  onFarmChange:      (id: string) => void;
  connectionStatus:  ConnectionStatus;
  lastUpdated:       Date | null;
  isLoading:         boolean;
  onRefresh:         () => void;
  /** Age of the newest sensor reading — shown on the badge when stale. */
  dataAgeMinutes?:   number | null;
}

export default function Header({
  selectedFarm,
  farms,
  onFarmChange,
  connectionStatus,
  lastUpdated,
  isLoading,
  onRefresh,
  dataAgeMinutes,
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

        <ConnectionBadge status={connectionStatus} dataAgeMinutes={dataAgeMinutes} />

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

function formatAge(minutes: number): string {
  if (minutes < 60)   return `${Math.round(minutes)} min`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / 1440)} d`;
}

function ConnectionBadge({
  status, dataAgeMinutes,
}: {
  status: ConnectionStatus; dataAgeMinutes?: number | null;
}) {
  if (status === "online")
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-status-active">
        <Wifi size={12} />
        <span className="hidden sm:inline">Online</span>
      </span>
    );

  // The backend answered, but the newest reading is older than the staleness
  // threshold — the server is up and the FARM is dark. Amber, matching the
  // UNKNOWN relay cards, and using --warn-ink so it stays readable on the
  // white header in light mode (plain amber-500 is ~1.8:1 there).
  if (status === "stale")
    return (
      <span
        title={
          dataAgeMinutes != null
            ? `No sensor data for ${formatAge(dataAgeMinutes)}. The dashboard can reach the backend, but the farm has stopped reporting.`
            : "The dashboard can reach the backend, but the farm has stopped reporting."
        }
        className="flex items-center gap-1.5 text-[11px] font-medium text-[color:var(--warn-ink)]"
      >
        <SignalZero size={12} />
        <span className="hidden sm:inline">
          No signal{dataAgeMinutes != null && ` · ${formatAge(dataAgeMinutes)}`}
        </span>
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
    <span
      title="The dashboard cannot reach the backend API."
      className="flex items-center gap-1.5 text-[11px] text-status-danger"
    >
      <WifiOff size={12} />
      <span className="hidden sm:inline">Offline</span>
    </span>
  );
}
