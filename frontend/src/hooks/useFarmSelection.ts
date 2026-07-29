"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSettings } from "./useSettings";
import { fetchFarms } from "@/lib/api";
import type { Farm } from "@/types";

// Campus is a dedicated control interface, not a farm-monitoring dashboard —
// /scada is its only page (see Sidebar.tsx, which drops every other nav item
// while campus is selected). Keep in sync with that.
const CAMPUS_FARM_ID   = "campus";
const CAMPUS_ONLY_PATH = "/scada";

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
 * Also redirects to /scada whenever campus becomes (or already is) the
 * active farm — whether from switching to it here or landing on any other
 * page while it was already the stored default.
 */
export function useFarmSelection() {
  const { settings, update } = useSettings();
  const [farms, setFarms] = useState<Farm[]>([]);
  const pathname = usePathname();
  const router = useRouter();

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

  useEffect(() => {
    if (farm === CAMPUS_FARM_ID && pathname !== CAMPUS_ONLY_PATH) {
      router.replace(CAMPUS_ONLY_PATH);
    }
  }, [farm, pathname, router]);

  return { farm, setFarm, farms };
}
