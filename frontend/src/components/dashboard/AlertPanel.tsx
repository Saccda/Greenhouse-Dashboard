"use client";
import { AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { clsx } from "clsx";
import type { Alert } from "@/types";

interface AlertPanelProps {
  alerts:     Alert[];
  isLoading?: boolean;
}

export default function AlertPanel({ alerts, isLoading = false }: AlertPanelProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-10 rounded-lg bg-surface-hover animate-pulse" />
        ))}
      </div>
    );
  }

  if (!alerts.length) {
    return (
      <div className="flex items-center gap-2 text-status-active text-sm py-2">
        <CheckCircle2 size={15} />
        <span>All readings within normal range</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => (
        <AlertRow key={i} alert={alert} />
      ))}
    </div>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  const isWarn   = alert.type === "warning";
  const isDanger = alert.type === "danger";

  return (
    <div
      className={clsx(
        "flex items-start gap-2.5 px-3 py-2.5 rounded-lg border text-xs",
        isDanger
          ? "bg-status-danger/10 border-status-danger/30 text-status-danger"
          : isWarn
          ? "bg-status-warning/10 border-status-warning/30 text-status-warning"
          : "bg-status-info/10 border-status-info/30 text-status-info",
      )}
    >
      {isDanger ? (
        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
      ) : isWarn ? (
        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
      ) : (
        <Info size={13} className="shrink-0 mt-0.5" />
      )}
      <span>{alert.message}</span>
    </div>
  );
}
