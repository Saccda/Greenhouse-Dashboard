"use client";
/**
 * /site — the PP Campus 3D twin.
 *
 * CAMPUS ONLY, by design rather than by omission. Campus is our own development
 * platform; Kampot is a working farm someone depends on. The sidebar only offers
 * this entry while campus is selected, and switching farms while here shows a
 * plain explanation rather than an empty page.
 *
 * The photographs and footage that used to live here moved to the Overview
 * page's Implement section, where they sit with the CAD renders they are the
 * built counterpart of. What is left is the model itself.
 *
 * The 3D slot is rendered as a visible empty state rather than hidden. It names
 * the exact file it is waiting for, so the next step lives in the product
 * instead of a TODO nobody reads.
 */
import useSWR from "swr";
import { Box, Camera, MapPin } from "lucide-react";

import PageHeader from "@/components/ui/PageHeader";
import { swrFetcher } from "@/lib/api";
import { useFarmSelection } from "@/hooks/useFarmSelection";
import { deriveConnectionStatus } from "@/lib/connection";
import Header from "@/components/layout/Header";
import CampusModelViewer from "@/components/site/CampusModelViewer";
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

          <PageHeader
            icon={Camera}
            title="PP Campus — the rig"
            description="The hardware behind the readings on every other page: what it looks like, and what it does when a channel switches on."
          >
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-sky-400/15 text-sky-400">
              <MapPin size={10} /> Development site
            </span>
          </PageHeader>

          {isCampus ? (
            <>
              {/* ── 3D twin slot ──────────────────────────────────── */}
              <section className="rounded-2xl border border-surface-border bg-surface-card p-5">
                <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Box size={15} className="text-sky-400" /> 3D model
                </h2>
                <p className="text-xs text-slate-200 mt-1 mb-4 max-w-2xl leading-relaxed">
                  The CAD assembly of the rig, from the SolidWorks model, bound to live channel
                  state: the nozzle run lights when CH2 is actually spraying, and the chilled-water
                  tank and its copper coil when CH4 is cooling. Nothing lights while the feed is
                  stale, because the channel states are then unknown rather than off.
                </p>
                <CampusModelViewer />
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
                    className="mt-4 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-700 text-white hover:bg-sky-700 transition-colors"
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
