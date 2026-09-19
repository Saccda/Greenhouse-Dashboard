"use client";
/**
 * /insights — the predictive phase, in one place.
 *
 * DEVELOPER-ONLY while Stage 1 and Stage 2 are still previews
 * (ML_METHODOLOGY.md §2.6). The nav entry is hidden for other roles and the
 * backend rejects the API calls outright, so an owner who reaches this URL gets
 * a plain explanation rather than a wall of failed requests.
 *
 * Order is deliberate: sensor health sits ABOVE the forecast. A forecast built
 * on an instrument nobody has checked is worth nothing, so "can these readings
 * be trusted" is the question that has to be answered first.
 */
import useSWR from "swr";
import { Sparkles, Lock } from "lucide-react";

import { swrFetcher } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { useFarmSelection } from "@/hooks/useFarmSelection";
import { deriveConnectionStatus } from "@/lib/connection";
import Header from "@/components/layout/Header";
import ForecastPanel from "@/components/insights/ForecastPanel";
import SensorHealthPanel from "@/components/insights/SensorHealthPanel";
import type { LatestResponse } from "@/types";

// The farms these previews were actually built on. Kampot is the only one with
// enough history to train against (§0.1); campus only began archiving in
// September 2026 and Kep was never wired to Postgres at all.
const SUPPORTED_FARMS = ["kampot"];

export default function InsightsPage() {
  const { user, loading } = useAuth();
  const { settings } = useSettings();
  const { farm, setFarm, farms } = useFarmSelection();

  const { data: latest, isLoading, error, mutate } = useSWR<LatestResponse>(
    `/api/sensors/latest?farm=${farm}`, swrFetcher, { refreshInterval: 30_000 },
  );

  const isDeveloper = user?.role === "developer";
  const supported = SUPPORTED_FARMS.includes(farm);

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
                <Sparkles size={17} className="text-sky-400" /> Insights
              </h1>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                Sensor health and short-horizon forecasting. Both are validated against days the
                methods never saw — the figures here are measured, not asserted.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="h-64 rounded-2xl bg-surface-hover animate-pulse" />
          ) : !isDeveloper ? (
            <Notice
              icon={Lock}
              title="Developer preview"
              body="These panels are still being validated and are limited to developer accounts. Nothing is missing from your dashboard — this page simply is not part of it yet."
            />
          ) : !supported ? (
            <Notice
              icon={Lock}
              title={`Not available for this farm yet`}
              body="Kampot is the only farm with enough history behind it. Campus only began archiving in September 2026, and Kep was never wired to the archive — neither has the months of data these methods need. Switch to Kampot Farm to see them."
            />
          ) : (
            <>
              <SensorHealthPanel farm={farm} />
              <ForecastPanel farm={farm} tempWarn={settings.tempWarn} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Notice({
  icon: Icon, title, body,
}: {
  icon: typeof Lock; title: string; body: string;
}) {
  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-8">
      <div className="flex items-start gap-4 max-w-2xl">
        <div className="w-10 h-10 rounded-xl bg-surface-hover flex items-center justify-center shrink-0">
          <Icon size={18} className="text-slate-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
          <p className="text-[13px] text-slate-500 mt-1.5 leading-relaxed">{body}</p>
        </div>
      </div>
    </section>
  );
}
