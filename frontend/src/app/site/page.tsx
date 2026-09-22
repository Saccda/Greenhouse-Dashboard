"use client";
/**
 * /site — the physical installation: photographs, video, and (next) the 3D twin.
 *
 * Farm-aware rather than campus-specific, because the header already carries a
 * farm selector and a page that ignored it would be the odd one out. Campus is
 * simply the only site with media registered so far.
 *
 * The 3D slot is deliberately rendered as an empty state rather than hidden.
 * It names the exact file it is waiting for, so the next step is visible in the
 * product instead of buried in a TODO.
 */
import useSWR from "swr";
import { Box, Camera } from "lucide-react";

import { swrFetcher } from "@/lib/api";
import { useFarmSelection } from "@/hooks/useFarmSelection";
import { deriveConnectionStatus } from "@/lib/connection";
import Header from "@/components/layout/Header";
import SiteMedia from "@/components/site/SiteMedia";
import type { LatestResponse } from "@/types";

export default function SitePage() {
  const { farm, setFarm, farms } = useFarmSelection();
  const { data: latest, isLoading, error, mutate } = useSWR<LatestResponse>(
    `/api/sensors/latest?farm=${farm}`, swrFetcher, { refreshInterval: 30_000 },
  );

  const farmLabel = farms.find((f) => f.id === farm)?.display_name ?? farm;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header
        selectedFarm={farm} farms={farms} onFarmChange={setFarm}
        connectionStatus={deriveConnectionStatus(error, latest)}
        dataAgeMinutes={latest?.data_age_minutes}
        lastUpdated={latest ? new Date(latest.timestamp) : null}
        isLoading={isLoading} onRefresh={() => mutate()}
      />

      <main className="flex-1 overflow-y-auto p-5">
        <div className="max-w-screen-2xl mx-auto space-y-5">

          <div>
            <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <Camera size={17} className="text-sky-400" /> Site
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              {farmLabel} as it physically exists — the hardware behind the readings on every
              other page.
            </p>
          </div>

          <SiteMedia farm={farm} />

          {/* ── 3D twin slot ──────────────────────────────────────── */}
          <section className="rounded-2xl border border-surface-border bg-surface-card p-5">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Box size={15} className="text-sky-400" /> 3D model
            </h2>
            <p className="text-xs text-slate-500 mt-1 mb-4 max-w-2xl leading-relaxed">
              The CAD assembly, bound to live channel state — a sprinkler that lights up when CH2
              is actually running.
            </p>
            <div className="rounded-xl bg-surface-base ring-1 ring-surface-border px-6 py-10 text-center">
              <Box size={26} className="text-slate-500 mx-auto" />
              <p className="text-sm font-medium text-slate-300 mt-3">Model not uploaded yet</p>
              <p className="text-[12px] text-slate-500 mt-2 max-w-lg mx-auto leading-relaxed">
                A STEP file cannot be loaded in a browser — it stores parametric surfaces, not
                triangles. Convert it to glTF first, then drop the result at{" "}
                <code className="text-slate-400">public/models/campus.glb</code>.
              </p>
              <p className="text-[11px] text-slate-500 mt-3">
                Target under 5 MB after Draco compression.
              </p>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
