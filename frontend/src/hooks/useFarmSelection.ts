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
 *
 * WHY THE ERROR IS RETURNED RATHER THAN SWALLOWED
 *   This used to end in `.catch(() => {})`. An empty farm list then meant
 *   three completely different things and looked identical in all of them:
 *
 *     the request failed            — a problem to fix
 *     the account has no farms      — an access question for an admin
 *     the account has exactly one   — normal, nothing wrong
 *
 *   The page hides its farm selector when there is one farm or fewer, so a
 *   failed request silently removed every other site from the interface with
 *   nothing anywhere saying so. Callers now get `error` and `loading` and can
 *   tell a broken list from a short one.
 */
export function useFarmSelection() {
  const { settings, update } = useSettings();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchFarms()
      .then((r) => {
        if (cancelled) return;
        setFarms(r.farms);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Kept as a message rather than a boolean: "401" and "Failed to fetch"
        // need different actions from whoever is reading it.
        setError(e instanceof Error ? e.message : "Could not load the farm list");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const farm = settings.defaultFarm;
  const setFarm = (id: string) => update({ defaultFarm: id });

  useEffect(() => {
    if (farms.length && !farms.some((f) => f.id === farm)) {
      setFarm(farms[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farms, farm]);

  return { farm, setFarm, farms, error, loading };
}
