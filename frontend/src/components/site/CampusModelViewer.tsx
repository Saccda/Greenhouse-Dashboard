"use client";
/**
 * CampusModelViewer — the chrome around the 3D scene.
 *
 * Exists separately from CampusModelScene so that three/fiber/drei stay behind
 * a dynamic import: this file is ordinary React and ships with the page, while
 * roughly 250 KB of WebGL only downloads once someone actually opens the model.
 *
 * WebGL fails in ways ordinary components do not — an old GPU, a blocklisted
 * driver, hardware acceleration switched off — and none of those throw where a
 * try/catch would catch them. Hence the error boundary: the fallback explains
 * what happened and points at the photographs, which is the honest alternative
 * to a blank rectangle.
 */
import { Component, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { clsx } from "clsx";
import { Box, Maximize2, RotateCcw, AlertTriangle } from "lucide-react";

const CampusModelScene = dynamic(() => import("./CampusModelScene"), {
  ssr: false,   // WebGL needs a real canvas; there is nothing to render on the server
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <div className="w-6 h-6 rounded-full border-2 border-sky-400/30 border-t-sky-400 animate-spin" />
        <p className="text-[11px] text-slate-400">Loading viewer…</p>
      </div>
    </div>
  ),
});

class WebGLBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="absolute inset-0 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <AlertTriangle size={24} className="text-[color:var(--warn-ink)] mx-auto" />
          <p className="text-sm font-medium text-slate-300 mt-3">
            The 3D view could not start
          </p>
          <p className="text-[12px] text-slate-500 mt-1.5 leading-relaxed">
            This usually means WebGL is unavailable — an older graphics card, or hardware
            acceleration turned off in the browser. The photographs on the Overview page show the
            same rig.
          </p>
        </div>
      </div>
    );
  }
}

export default function CampusModelViewer() {
  // Remounting the scene is the simplest honest "reset": OrbitControls owns the
  // camera once it is mounted, so nudging it from outside means reaching into
  // its internals. A key change throws the old canvas away and reframes from
  // scratch, which is exactly what the button promises.
  const [sceneKey, setSceneKey] = useState(0);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-3">
      <div
        className={clsx(
          "relative rounded-xl bg-surface-base ring-1 ring-surface-border overflow-hidden",
          "transition-[height] duration-300",
          expanded ? "h-[72vh]" : "h-[420px]",
        )}
      >
        <WebGLBoundary key={sceneKey}>
          <CampusModelScene />
        </WebGLBoundary>

        <div className="absolute top-3 right-3 flex gap-1.5">
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
            aria-label={expanded ? "Shrink viewer" : "Expand viewer"}
            aria-pressed={expanded}
            className="p-2 rounded-lg bg-surface-card/85 backdrop-blur ring-1 ring-surface-border text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Maximize2 size={14} />
          </button>
        </div>

        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-[10px] text-slate-500 bg-surface-card/85 backdrop-blur px-2.5 py-1.5 rounded-lg ring-1 ring-surface-border">
          <Box size={11} />
          drag to rotate · scroll to zoom · right-drag to pan
        </div>
      </div>
    </div>
  );
}
