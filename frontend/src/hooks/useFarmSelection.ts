"use client";
import { useEffect, useState } from "react";
import { useSettings } from "./useSettings";
import { fetchFarms } from "@/lib/api";
import type { Farm } from "@/types";

/**
 * Shared "currently selected farm" — fetches the account's allowed farms
 * (already server-filtered), and reads/writes settings.defaultFarm directly
 * rather than copying it into separate local state (a copy would only
 * capture defaultFarm's *initial* value and miss the correction
 * useLocalStorage applies right after mount once it's actually read
 * localStorage, or updates from another component instance — see
 * useLocalStorage.ts). Falls back to the first farm the account actually
 * has access to if the stored default isn't in its list (access changed, or
 * this is a first login before any default is set).
 */
export function useFarmSelection() {
  const { settings, update } = useSettings();
  const [farms, setFarms] = useState<Farm[]>([]);

  useEffect(() => {
    fetchFarms().then((r) => setFarms(r.farms)).catch(() => {});
  }, []);

  const farm = settings.defaultFarm;
  const setFarm = (id: string) => update({ defaultFarm: id });

  useEffect(() => {
    if (farms.length && !farms.some((f) => f.id === farm)) {
      setFarm(farms[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farms, farm]);

  return { farm, setFarm, farms };
}
