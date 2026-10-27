"use client";
import { clsx } from "clsx";
import { Maximize, Minimize } from "lucide-react";

import { useFullscreen } from "@/hooks/useFullscreen";

/**
 * True fullscreen — the part an installed PWA window cannot do by itself.
 *
 * Installing the app removes the URL bar and tab strip, but the Windows
 * taskbar stays. Only the Fullscreen API covers the whole screen, and it can
 * only be entered from a user gesture, so it has to be a button rather than
 * something applied on load.
 *
 * The state and the toggling live in useFullscreen, because the sidebar reads
 * the same thing to decide whether to hide itself entirely.
 */
export default function FullscreenToggle({ collapsed }: { collapsed: boolean }) {
  const { isFullscreen, supported, toggle } = useFullscreen();

  if (!supported) return null;

  return (
    <button
      onClick={toggle}
      aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
      aria-pressed={isFullscreen}
      title={isFullscreen ? "Exit full screen (Esc)" : "Full screen"}
      className={clsx(
        "flex items-center w-full rounded-xl font-medium transition-all duration-150",
        collapsed ? "justify-center p-3" : "gap-3 px-4 py-2.5",
        "text-slate-400 hover:bg-surface-hover hover:text-slate-100",
      )}
    >
      {isFullscreen
        ? <Minimize size={18} className="shrink-0 text-sky-500" />
        : <Maximize size={18} className="shrink-0 text-slate-400" />}
      {!collapsed && (
        <span className="text-[13px]">{isFullscreen ? "Exit Full Screen" : "Full Screen"}</span>
      )}
    </button>
  );
}
