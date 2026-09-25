"use client";
/**
 * The HMI shell — persistent chrome, swappable view.
 *
 * An HMI is not one screen. It is a small application with its own
 * navigation, and the industrial convention is a fixed frame carrying three
 * things that must never disappear:
 *
 *   1. WHO and WHAT — which plant this is, so a wall panel is never ambiguous
 *   2. HOW IT IS — a state strip that survives every view change, so walking
 *      up to any screen tells you whether to be worried before you read a
 *      single number
 *   3. WHERE ELSE — the view switcher
 *
 * Only the content area changes. That is why this is a layout rather than
 * three pages each drawing their own header: the state strip has to be the
 * SAME strip across views, not three that happen to look alike and can drift.
 *
 * Some views carry the mimic, some do not. Alarms and history are lists and
 * tables, and forcing a 3D model onto them would cost the space the actual
 * content needs — which is the mistake the first version of this page made.
 */
import { useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Maximize } from "lucide-react";
import { clsx } from "clsx";

import { swrFetcher } from "@/lib/api";
import { HMI } from "@/components/hmi2/tokens";
import AlarmStrip, { type LiveAlarm } from "@/components/hmi2/AlarmStrip";
import StatusBar from "@/components/hmi2/StatusBar";
import type { LatestResponse } from "@/types";

// Area pages first, then function pages — the order the plant screens use,
// and the order that matches how someone thinks: WHERE, then WHAT ABOUT IT.
const VIEWS = [
  { href: "/hmi", label: "3D Model" },
  { href: "/hmi/process", label: "Process Diagram" },
  { href: "/hmi/dashboard", label: "Dashboard" },
  { href: "/hmi/alarms", label: "Alarms & Events" },
  { href: "/hmi/trends", label: "Trends & History" },
];

export default function HmiLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: latest, error } = useSWR<LatestResponse>(
    "/api/sensors/latest?farm=campus", swrFetcher, { refreshInterval: 10_000 },
  );

  const stale = !!error || (latest ? !latest.is_online : true);
  const temp = latest?.readings?.temperature?.value;
  const hum = latest?.readings?.humidity?.value;
  const running = (latest?.relays ?? []).filter((r) => r.state === "ON");

  const liveAlarms = useMemo<LiveAlarm[]>(() => {
    if (stale) {
      return [{
        id: "feed",
        priority: "alarm",
        tag: "CAMPUS FEED",
        text: "SENSOR FEED STALE — channel states and readings are unknown, not off",
      }];
    }
    return [];
  }, [stale]);

  const goFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: HMI.bg }}>
      {/* ── 1. Identity and exit ────────────────────────────────────────── */}
      <header
        className="flex items-center gap-5 px-5 h-14 shrink-0"
        style={{ backgroundColor: HMI.panel, borderBottom: "1px solid " + HMI.line }}
      >
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-[13px] font-semibold tracking-widest shrink-0 opacity-70 hover:opacity-100 transition-opacity"
          style={{ color: HMI.inkMuted }}
        >
          <ArrowLeft size={16} /> EXIT
        </Link>
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="text-[19px] font-bold tracking-widest" style={{ color: HMI.ink }}>
            PP CAMPUS
          </span>
          <span className="text-[13px] tracking-wide truncate" style={{ color: HMI.inkFaint }}>
            AUTOMATED COOLING AND SPRAYING SYSTEM
          </span>
        </div>
        <button
          onClick={goFullscreen}
          title="Full screen"
          className="ml-auto opacity-70 hover:opacity-100 transition-opacity shrink-0"
          style={{ color: HMI.inkMuted }}
        >
          <Maximize size={18} />
        </button>
      </header>

      {/* ── 2. State strip — the same one on every view ─────────────────── */}
      <div
        className="flex items-stretch shrink-0 divide-x"
        style={{ backgroundColor: HMI.panelAlt, borderBottom: "1px solid " + HMI.line, borderColor: HMI.line }}
      >
        <StateCell
          label="System"
          value={stale ? "UNKNOWN" : running.length ? "RUNNING" : "IDLE"}
          bad={stale}
          wide
        />
        <StateCell label="Temperature" value={temp != null ? temp.toFixed(1) + " °C" : "––.–"} bad={stale} />
        <StateCell label="Humidity" value={hum != null ? hum.toFixed(0) + " %" : "–– "} bad={stale} />
        <StateCell
          label="Channels on"
          value={stale ? "?" : running.length ? running.map((r) => r.key).join(" ") : "none"}
          bad={stale}
        />
        <StateCell
          label="Last reading"
          value={
            latest?.timestamp
              ? new Date(latest.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "––:––"
          }
          bad={stale}
        />
      </div>

      <AlarmStrip live={liveAlarms} />

      {/* ── 3. View switcher ───────────────────────────────────────────── */}
      <nav
        className="flex shrink-0"
        style={{ backgroundColor: HMI.panel, borderBottom: "1px solid " + HMI.line }}
      >
        {VIEWS.map((v) => {
          const active = pathname === v.href;
          return (
            <Link
              key={v.href}
              href={v.href}
              className={clsx(
                "px-6 py-3 text-[14px] font-semibold tracking-widest uppercase transition-colors",
                !active && "opacity-60 hover:opacity-100",
              )}
              style={{
                color: HMI.ink,
                backgroundColor: active ? HMI.bg : "transparent",
                // The active tab is marked by a bar rather than a colour, so the
                // rule that colour means abnormal survives even in the chrome.
                boxShadow: active ? "inset 0 -2px 0 0 " + HMI.ink : undefined,
              }}
            >
              {v.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1 min-h-0">{children}</div>

      <StatusBar feedStale={stale} />
    </div>
  );
}

function StateCell({
  label, value, bad, wide,
}: {
  label: string; value: string; bad: boolean; wide?: boolean;
}) {
  return (
    <div className={clsx("px-5 py-2.5 leading-tight", wide && "min-w-[11rem]")} style={{ borderColor: HMI.line }}>
      <div className="text-[11px] tracking-widest uppercase" style={{ color: HMI.inkFaint }}>
        {label}
      </div>
      <div
        className="text-[22px] font-mono-num font-semibold tabular-nums leading-tight"
        style={{ color: bad ? HMI.warn : HMI.ink }}
      >
        {value}
      </div>
    </div>
  );
}
