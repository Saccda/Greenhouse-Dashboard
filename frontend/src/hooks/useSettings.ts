"use client";
import { useLocalStorage } from "./useLocalStorage";
import { API_BASE } from "@/lib/api";

export interface DashboardSettings {
  tempWarn:    number;   // °C alert threshold
  humWarn:     number;   // % alert threshold
  defaultFarm: string;
  userName:    string;   // display name shown in sidebar
}

export const SETTINGS_DEFAULTS: DashboardSettings = {
  tempWarn:    30,
  humWarn:     70,
  defaultFarm: "kampot",
  userName:    "ME Team",
};

const KEY = "gh_dashboard_settings";

/**
 * Push thresholds to the backend so the alert checker uses the same values.
 * Requires a session cookie — only farm owner / developer accounts may write.
 * Returns "unauthorized" specifically so callers can prompt a re-login
 * instead of showing a generic failure.
 */
export async function syncThresholdsToBackend(
  tempWarn: number,
  humWarn:  number,
): Promise<"ok" | "unauthorized" | "error"> {
  try {
    const res = await fetch(`${API_BASE}/api/settings`, {
      method:      "POST",
      headers:     { "Content-Type": "application/json" },
      credentials: "include",
      body:        JSON.stringify({ temp_warn: tempWarn, hum_warn: humWarn }),
    });
    if (res.status === 401) return "unauthorized";
    return res.ok ? "ok" : "error";
  } catch {
    console.warn("[Settings] Could not sync thresholds to backend");
    return "error";
  }
}

export function useSettings() {
  const [settings, setSettings] = useLocalStorage<DashboardSettings>(
    KEY,
    SETTINGS_DEFAULTS,
  );

  const update = (partial: Partial<DashboardSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    // Keep backend in sync whenever thresholds change (silently — the
    // explicit awaited call in each page's handleSave surfaces failures)
    if (partial.tempWarn !== undefined || partial.humWarn !== undefined) {
      syncThresholdsToBackend(next.tempWarn, next.humWarn);
    }
  };

  return { settings, update };
}
