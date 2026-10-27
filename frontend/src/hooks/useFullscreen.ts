"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * Whether the browser is in true fullscreen, and how to change that.
 *
 * This used to live inside FullscreenToggle. The sidebar now needs the same
 * answer — it hides itself completely in fullscreen rather than leaving a
 * strip of icons — and two components reading the same browser state through
 * two separate listeners is how they end up disagreeing.
 *
 * State is read from document.fullscreenElement on the fullscreenchange event
 * rather than tracked locally, because fullscreen can be left with Escape or
 * F11 without this app being involved at all. Local state would then say the
 * window is still fullscreen while the taskbar is plainly back.
 */
export function useFullscreen() {
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

  return { isFullscreen, supported, toggle };
}
