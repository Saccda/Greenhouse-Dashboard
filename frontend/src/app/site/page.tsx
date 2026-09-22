"use client";
/**
 * /site — the PP Campus rig: photographs, video, and (next) the 3D twin.
 *
 * CAMPUS ONLY, by design rather than by omission. Campus is our own development
 * platform; Kampot is a working farm someone depends on, and the two should not
 * share a page whose whole purpose is showing off hardware we are still
 * building. The sidebar only offers this entry while campus is selected, and
 * switching farms while here shows a plain explanation rather than an empty
 * page — the header's farm selector stays available so the way back is obvious.
 *
 * The 3D slot is rendered as a visible empty state rather than hidden. It names
 * the exact file it is waiting for, so the next step lives in the product
 * instead of a TODO nobody reads.
 */
import useSWR from "swr";
import { Box, Camera, MapPin } from "lucide-react";

import { swrFetcher } from "@/lib/api";
import { useFarmSelection } from "@/hooks/useFarmSelection";
import { deriveConnectionStatus } from "@/lib/connection";
import Header from "@/components/layout/Header";
import CampusMedia from "@/components/site/CampusMedia";
import type { LatestResponse } from "@/types";

const SITE_FARM = "campus";

export default function SitePage() {
  const { farm, setFarm, farms } = useFarmSelection();
  const { data: latest, isLoading, error, mutate } = useSWR<LatestResponse>(
    `/api/sensors/latest?farm=${farm}`, swrFetcher, { refreshInterval: 30_000 },
  );

  const isCampus = farm === SITE_FARM;

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

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                <Camera size={17} className="text-sky-400" /> PP Campus — the rig
              </h1>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                The hardware behind the readings on every other page: what it looks like, and what
                it does when a channel switches on.
              </p>
            </div>
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-sky-400/15 text-sky-400 shrink-0">
              <MapPin size={10} /> Development site
            </span>
          </div>

          {isCampus ? (
            <>
              <CampusMedia />

              {/* ── 3D twin slot ──────────────────────────────────── */}
              <section className="rounded-2xl border border-surface-border bg-surface-card p-5">
                <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Box size={15} className="text-sky-400" /> 3D model
                </h2>
                <p className="text-xs text-slate-500 mt-1 mb-4 max-w-2xl leading-relaxed">
                  The CAD assembly, bound to live channel state — a sprinkler that lights up when
                  CH2 is actually running.
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
            </>
          ) : (
            <section className="rounded-2xl border border-surface-border bg-surface-card p-8">
              <div className="flex items-start gap-4 max-w-2xl">
                <div className="w-10 h-10 rounded-xl bg-surface-hover flex items-center justify-center shrink-0">
                  <MapPin size={18} className="text-slate-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-200">
                    This page covers PP Campus only
                  </h2>
                  <p className="text-[13px] text-slate-500 mt-1.5 leading-relaxed">
                    Campus is our development platform, so it is the one site whose hardware is
                    documented here. Switch the farm selector back to PP Campus to view it.
                  </p>
                  <button
                    type="button"
                    onClick={() => setFarm(SITE_FARM)}
                    className="mt-4 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-500 text-white hover:bg-sky-600 transition-colors"
                  >
                    Switch to PP Campus
                  </button>
                </div>
              </div>
            </section>
          )}

        </div>
      </main>
    </div>
  );
}
