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
 * Fire-and-forget — UI doesn't need to wait for this.
 */
export async function syncThresholdsToBackend(
  tempWarn: number,
  humWarn:  number,
): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/settings`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ temp_warn: tempWarn, hum_warn: humWarn }),
    });
  } catch {
    // Non-fatal — localStorage update already happened
    console.warn("[Settings] Could not sync thresholds to backend");
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
    // Keep backend in sync whenever thresholds change
    if (partial.tempWarn !== undefined || partial.humWarn !== undefined) {
      syncThresholdsToBackend(next.tempWarn, next.humWarn);
    }
  };

  return { settings, update };
}
