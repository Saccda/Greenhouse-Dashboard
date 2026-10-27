"use client";
/**
 * Water in full: how much was used, and what the pump did to use it.
 *
 * THERE IS NO "WHY IT SPRAYS" PANEL
 *   There was one, showing the temperature band read back from the controller
 *   and the current reading against it. It went because it answered a question
 *   people ask once — what is this thing set to? — and then kept answering it
 *   every day, in a column, beside figures that change hourly. The Control
 *   page owns the setpoint; this page is about what happened.
 *
 *   The one part of it that was genuinely urgent survives: a pump taken out of
 *   service by the dry-run guard is called out at the top of the page and on
 *   the Pump card, because "0 cycles today" reads identically for a cool day
 *   and a locked-out pump, and those call for opposite responses.
 *
 * WHY THE TANK SHARES THE AIR'S AXIS
 *   Tank temperature alone says little. Tank temperature against air
 *   temperature says whether spraying can remove any heat at all — a tank
 *   sitting at ambient cools nothing, and that looks identical to a working
 *   system in every other figure on this page.
 */
import useSWR from "swr";
import { Waves, Clock, Timer, Power } from "lucide-react";

import { swrFetcher } from "@/lib/api";
import KPICard from "@/components/ui/KPICard";
import ConsumptionChart, { type Bucket } from "@/components/dashboard/sections/ConsumptionChart";
import { duration } from "@/lib/series";

import OverlayChart, { ChartLegendHints } from "./OverlayChart";
import SprayTimeline from "./SprayTimeline";
import { Empty, Panel, Warning } from "./Panel";
import type { DetailProps } from "./types";

interface LockoutResponse {
  locked: boolean;
  lockout: { reason?: string; locked_at?: string } | null;
  strikes: number;
}

export default function WaterDetail({
  farm, latest, history, water, sprayStats, isLoading,
  windowStart, windowEnd, rangeWord,
}: DetailProps) {
  const farmId = farm?.id ?? "";

  const { data: lockout } = useSWR<LockoutResponse>(
    farmId ? `/api/pump-lockout?farm=${farmId}` : null,
    swrFetcher, { refreshInterval: 60_000 },
  );

  const stats = sprayStats?.stats;
  const events = stats?.spray_events ?? [];
  const last = events.length ? events[events.length - 1] : null;
  const running = (latest?.relays ?? []).some((r) => r.state === "ON" && /spray/i.test(r.label));

  const tankField = farm?.water_temp?.field;

  const metered = farm?.water_source === "measured";
  const unitLabel = water?.unit_label ?? "m³";
  const buckets: Bucket[] = metered
    ? [...(water?.readings ?? [])].reverse().map((r) => ({
        ts: new Date(r.timestamp).getTime(),
        value: r.consumption ?? null,
      }))
    : [];

  const sinceLast = last && !last.ongoing
    ? (Date.now() - new Date(last.end_time).getTime()) / 60_000
    : null;

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          title="Spray cycles" icon={Waves}
          value={stats ? String(stats.total_sprays) : "—"}
          isLoading={isLoading && !sprayStats}
          subtitle={`This ${rangeWord}`}
        />
        <KPICard
          title="Last spray" icon={Clock}
          value={last ? new Date(last.start_time).toLocaleTimeString([], {
            hour: "2-digit", minute: "2-digit",
          }) : "—"}
          isLoading={isLoading && !sprayStats}
          subtitle={
            !last ? "Has not run in this period"
              : last.ongoing ? "Running now"
                : sinceLast != null ? `${duration(sinceLast)} ago`
                  : ""
          }
        />
        <KPICard
          title="Total runtime" icon={Timer}
          value={stats?.total_spray_display ?? "—"}
          isLoading={isLoading && !sprayStats}
          subtitle={
            stats && stats.total_sprays > 0
              ? `Averaging ${stats.avg_spray_minutes.toFixed(1)} min a cycle`
              : `This ${rangeWord}`
          }
        />
        <KPICard
          title="Pump" icon={Power}
          value={lockout?.locked ? "Locked" : running ? "Running" : "Idle"}
          status={lockout?.locked ? "danger" : running ? "ok" : undefined}
          subtitle={
            lockout?.locked ? "Dry-run guard has stopped it"
              : lockout && lockout.strikes > 0 ? "One strike spent — next lockout is manual"
                : "Dry-run guard clear"
          }
        />
      </section>

      {/* Above everything, because it changes what every figure below means. */}
      {lockout?.locked && (
        <Warning>
          The dry-run guard has taken this pump out of service
          {lockout.lockout?.locked_at
            ? ` since ${new Date(lockout.lockout.locked_at).toLocaleString()}`
            : ""}.
          It will not spray until it is released, so a low cycle count below is
          the lockout rather than a cool period. Release it from the Control page.
        </Warning>
      )}

      {/* Full width, because a timeline is an axis and an axis wants width:
          at a third of the page, two cycles forty minutes apart sat in the
          same few pixels. */}
      <Panel
        title="When the pump ran"
        aside={
          <span className="text-[11px] text-slate-500">
            {events.length} cycle{events.length === 1 ? "" : "s"} · width is runtime
          </span>
        }
      >
        <SprayTimeline
          events={events}
          windowStart={windowStart}
          windowEnd={windowEnd}
        />
      </Panel>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel
          className="lg:col-span-2"
          title={metered ? "Water used, by day" : "Water used, estimated"}
          aside={
            <span className="text-[11px] text-slate-500">
              {metered ? "from the meter" : "from runtime and nozzle flow"}
            </span>
          }
        >
          {metered ? (
            <ConsumptionChart
              buckets={buckets}
              unit={unitLabel}
              color="#0ea5e9"
              height={220}
              xLabel="Day"
              yLabel={`Water used (${unitLabel})`}
              labelFormat={(ts) =>
                new Date(ts).toLocaleDateString([], { day: "numeric", month: "short" })
              }
              empty="The meter has not reported yet. It sends only once another cubic metre has passed, so quiet is normal on a system that runs briefly."
            />
          ) : (
            <div className="h-[220px] grid place-items-center">
              <p className="text-[13px] text-slate-400 text-center max-w-sm leading-relaxed">
                {stats?.estimated_water_liters != null
                  ? `About ${Math.round(stats.estimated_water_liters).toLocaleString()} L this ${rangeWord}, worked out from spray runtime and the nozzle's rated flow. This farm has no meter, so it is an estimate rather than a measurement.`
                  : "This farm has no water meter, and no nozzle specification to estimate consumption from."}
              </p>
            </div>
          )}
        </Panel>

        <div className="flex flex-col gap-4 min-w-0">
          <Panel title="Cycles" className="flex-1">
            {events.length === 0 ? (
              <p className="text-[13px] text-slate-400 leading-relaxed">
                The pump did not run in this period.
              </p>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                      <th className="text-left font-medium pb-2">Started</th>
                      <th className="text-right font-medium pb-2">Ran for</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...events].reverse().map((e, i) => (
                      <tr key={i} className="border-t border-surface-border">
                        <td className="py-1.5 font-mono-num text-slate-300">
                          {new Date(e.start_time).toLocaleString([], {
                            month: "short", day: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </td>
                        <td className="py-1.5 text-right font-mono-num text-slate-100">
                          {e.duration_minutes.toFixed(1)} min
                          {/* A gap-bounded duration is a lower bound, not a
                              measurement, and the two look identical in a
                              column of numbers. */}
                          {e.incomplete && (
                            <span className="block text-[10px] text-[color:var(--warn-ink)] font-sans">
                              at least — feed cut out
                            </span>
                          )}
                          {e.ongoing && (
                            <span className="block text-[10px] text-brand-green font-sans">
                              still running
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </section>

      {tankField && (
        <Panel
          title="Tank water against air"
          aside={<ChartLegendHints spray />}
        >
          <OverlayChart
            series={history?.series}
            sprayEvents={events}
            height={300}
            leftUnit="°C"
            specs={[
              {
                field: tankField, label: "Tank water", unit: "°C",
                color: "#0ea5e9", axis: "left",
              },
              {
                field: "temperature", label: "Air", unit: "°C",
                color: "#94a3b8", axis: "left", dashed: true,
              },
            ]}
          />
          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            When the two lines meet, spraying removes no heat — the water is
            already at room temperature. That reads the same as a healthy
            system everywhere else on this page.
          </p>
        </Panel>
      )}

      {!metered && !tankField && events.length === 0 && (
        <Empty>
          This farm reports no water meter, no tank probe and no spray cycles in
          this period, so there is nothing further to show here.
        </Empty>
      )}
    </div>
  );
}
