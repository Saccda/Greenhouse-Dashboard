"use client";
import { useCallback, useEffect, useState } from "react";
import { clsx } from "clsx";
import { Maximize, Minimize } from "lucide-react";

/**
 * True fullscreen — the part an installed PWA window cannot do by itself.
 *
 * Installing the app removes the URL bar and tab strip, but the Windows
 * taskbar stays. Only the Fullscreen API covers the whole screen, and it can
 * only be entered from a user gesture, so it has to be a button rather than
 * something applied on load.
 *
 * State is read from document.fullscreenElement via the fullscreenchange
 * event rather than tracked locally, because the user can leave fullscreen
 * with Escape or F11 without ever touching this button — local state would
 * then show the wrong icon.
 */
export default function FullscreenToggle({ collapsed }: { collapsed: boolean }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(typeof document !== "undefined" && !!document.documentElement.requestFullscreen);
    const sync = () => setIsFullscreen(!!document.fullscreenElement);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      // navigationUI "hide" asks the browser to drop any remaining chrome.
      else await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    } catch {
      // Blocked by policy, or the gesture expired. Nothing useful to say.
    }
  }, []);

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
        "text-gray-500 hover:bg-gray-100 hover:text-gray-800",
      )}
    >
      {isFullscreen
        ? <Minimize size={18} className="shrink-0 text-sky-500" />
        : <Maximize size={18} className="shrink-0 text-gray-400" />}
      {!collapsed && (
        <span className="text-[13px]">{isFullscreen ? "Exit Full Screen" : "Full Screen"}</span>
      )}
    </button>
  );
}
