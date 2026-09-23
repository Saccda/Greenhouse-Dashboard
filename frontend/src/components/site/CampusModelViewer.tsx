"use client";
/**
 * CampusModelViewer — chrome, live channel state, and the part picker.
 *
 * Separate from CampusModelScene so three/fiber/drei stay behind a dynamic
 * import: this file is ordinary React and ships with the page, while ~250 KB of
 * WebGL downloads only when someone opens the model.
 *
 * The binding is the point of the whole exercise: CH2 running means the nozzle
 * run glows, CH4 means the cooling skid does. Relay state comes from the same
 * /api/sensors/latest the Control page uses, so the model and the relay cards
 * can never disagree.
 *
 * Nothing glows when the feed is stale. The API reports UNKNOWN rather than a
 * last-known state once readings go past DATA_STALE_MINUTES, and a twin that
 * keeps a sprinkler lit from yesterday's reading is worse than one that admits
 * it does not know.
 */
import { useState, useMemo, Component, type ReactNode } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { clsx } from "clsx";
import { Box, Maximize2, RotateCcw, AlertTriangle, Crosshair, Copy, Check } from "lucide-react";

import { swrFetcher } from "@/lib/api";
import type { LatestResponse } from "@/types";

const CampusModelScene = dynamic(() => import("./CampusModelScene"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <div className="w-6 h-6 rounded-full border-2 border-sky-400/30 border-t-sky-400 animate-spin" />
        <p className="text-[11px] text-slate-400">Loading viewer…</p>
      </div>
    </div>
  ),
});

/** Which relay drives which group of parts in the model. */
const CHANNEL_ROLE: Record<string, { role: string; label: string; tint: string }> = {
  CH1: { role: "ch1_enable", label: "System enable", tint: "text-brand-green" },
  CH2: { role: "ch2_spray",  label: "Spraying",     tint: "text-sky-400" },
  CH4: { role: "ch4_cool",   label: "Cooling",      tint: "text-cyan-400" },
};

class WebGLBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="absolute inset-0 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <AlertTriangle size={24} className="text-[color:var(--warn-ink)] mx-auto" />
          <p className="text-sm font-medium text-slate-300 mt-3">The 3D view could not start</p>
          <p className="text-[12px] text-slate-500 mt-1.5 leading-relaxed">
            WebGL is unavailable — usually an older graphics card or hardware acceleration turned
            off. The photographs on the Overview page show the same rig.
          </p>
        </div>
      </div>
    );
  }
}

export default function CampusModelViewer({ farm = "campus" }: { farm?: string }) {
  const [sceneKey, setSceneKey] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const { data: latest } = useSWR<LatestResponse>(
    `/api/sensors/latest?farm=${farm}`, swrFetcher, { refreshInterval: 15_000 },
  );

  // Only "ON" lights anything. UNKNOWN — which is what the API returns once the
  // feed is stale — deliberately lights nothing.
  const active = useMemo(() => {
    const on = new Set<string>();
    for (const relay of latest?.relays ?? []) {
      const m = CHANNEL_ROLE[relay.key];
      if (m && relay.state === "ON") on.add(m.role);
    }
    return on;
  }, [latest]);

  const isStale = latest ? !latest.is_online : false;

  return (
    <div className="space-y-3">
      <div
        className={clsx(
          "relative rounded-xl bg-surface-base ring-1 ring-surface-border overflow-hidden",
          "transition-[height] duration-300",
          expanded ? "h-[72vh]" : "h-[440px]",
        )}
      >
        <WebGLBoundary key={sceneKey}>
          <CampusModelScene
            active={active}
            pickMode={pickMode}
            onPick={(name) => setPicked((p) => (p.includes(name) ? p : [...p, name]))}
          />
        </WebGLBoundary>

        {/* Live channel legend */}
        <div className="absolute top-3 left-3 flex flex-col gap-1">
          {Object.entries(CHANNEL_ROLE).map(([ch, { role, label, tint }]) => {
            const on = active.has(role);
            return (
              <div
                key={ch}
                className="flex items-center gap-2 text-[10px] bg-surface-card/85 backdrop-blur px-2.5 py-1.5 rounded-lg ring-1 ring-surface-border"
              >
                <span className={clsx(
                  "w-1.5 h-1.5 rounded-full",
                  on ? "bg-current animate-pulse" : "bg-surface-border",
                  on && tint,
                )} />
                <span className={clsx("font-mono-num", on ? tint : "text-slate-500")}>{ch}</span>
                <span className={on ? "text-slate-300" : "text-slate-500"}>{label}</span>
              </div>
            );
          })}
          {isStale && (
            <p className="text-[10px] text-[color:var(--warn-ink)] bg-amber-500/10 px-2.5 py-1.5 rounded-lg ring-1 ring-amber-500/25 max-w-[190px] leading-snug">
              Feed is stale — nothing is lit because the channel states are unknown, not off.
            </p>
          )}
        </div>

        <div className="absolute top-3 right-3 flex gap-1.5">
          <button
            type="button"
            onClick={() => { setPickMode((p) => !p); setPicked([]); }}
            title="Identify parts"
            aria-pressed={pickMode}
            className={clsx(
              "p-2 rounded-lg backdrop-blur ring-1 transition-colors",
              pickMode
                ? "bg-sky-500 text-white ring-sky-400"
                : "bg-surface-card/85 ring-surface-border text-slate-400 hover:text-slate-200",
            )}
          >
            <Crosshair size={14} />
          </button>
          <button
            type="button"
            onClick={() => setSceneKey((k) => k + 1)}
            title="Reset view"
            aria-label="Reset view"
            className="p-2 rounded-lg bg-surface-card/85 backdrop-blur ring-1 ring-surface-border text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            title={expanded ? "Shrink" : "Expand"}
            aria-pressed={expanded}
            className="p-2 rounded-lg bg-surface-card/85 backdrop-blur ring-1 ring-surface-border text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Maximize2 size={14} />
          </button>
        </div>

        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-[10px] text-slate-500 bg-surface-card/85 backdrop-blur px-2.5 py-1.5 rounded-lg ring-1 ring-surface-border">
          <Box size={11} />
          {pickMode ? "click a highlighted part to identify it" : "drag to rotate · scroll to zoom · right-drag to pan"}
        </div>
      </div>

      {pickMode && (
        <div className="rounded-xl bg-surface-hover ring-1 ring-surface-border p-3.5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Identified parts
            </p>
            {picked.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(picked.join(", "));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? "Copied" : "Copy"}
              </button>
            )}
          </div>
          {picked.length === 0 ? (
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Only the 14 mapped bodies are clickable — the rest of the rig is merged into one mesh
              for performance. Each name carries its SolidWorks body number, so anything wrong here
              can be traced straight back to the CAD.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {picked.map((p) => (
                <span key={p} className="text-[10px] font-mono-num px-2 py-1 rounded bg-surface-card text-slate-300 ring-1 ring-surface-border">
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
