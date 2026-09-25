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
  // last_seen, NOT timestamp. The API sets timestamp to datetime.now() when it
  // builds the response, so it is always a second old and said "1 SEC AGO"
  // beside four cells reading NO DATA. last_seen is when the SENSOR last
  // spoke, which is the only version of this fact worth showing.
  const lastSeen = latest?.last_seen ? new Date(latest.last_seen) : null;
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
        {/* The SYSTEM leads and the site follows. This screen exists to show
            the system; which site it is at is the qualifier, not the headline. */}
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="text-[19px] font-bold tracking-wide truncate" style={{ color: HMI.ink }}>
            AUTOMATED COOLING AND SPRAYING SYSTEM
          </span>
          <span className="text-[14px] tracking-widest shrink-0" style={{ color: HMI.inkFaint }}>
            — PP CAMPUS
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
        {/* The two questions someone walks up to this screen with are "is data
            coming in" and "if not, since when". They get the first two cells,
            in that order, before any process value — a reading is only worth
            reading once you know whether it is current.

            Every other cell says NO DATA in words rather than a dash or a
            question mark. A placeholder glyph is a puzzle: the reader has to
            work out that "––.–" means we do not know, and on a control screen
            an unreadable state is indistinguishable from a broken page. */}
        <StateCell
          label="Feed"
          value={stale ? "OFFLINE" : "LIVE"}
          bad={stale}
        />
        <StateCell
          label={stale ? "Offline since" : "Last reading"}
          value={
            lastSeen
              ? stale
                ? lastSeen.toLocaleString([], {
                    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                  })
                : ago(lastSeen)
              : "NEVER"
          }
          sub={lastSeen && stale ? ago(lastSeen) : undefined}
          title={lastSeen ? lastSeen.toLocaleString() : undefined}
          bad={stale}
          wide
        />
        <StateCell
          label="Running?"
          value={stale ? "NO DATA" : running.length ? "YES" : "NO — IDLE"}
          sub={!stale && running.length ? running.map((r) => r.key).join("  ") : undefined}
          bad={stale}
        />
        <StateCell
          label="Air temperature"
          value={!stale && temp != null ? temp.toFixed(1) + " °C" : "NO DATA"}
          bad={stale}
        />
        <StateCell
          label="Humidity"
          value={!stale && hum != null ? hum.toFixed(0) + " %" : "NO DATA"}
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

/** How long ago, in words. "2 DAYS AGO" is actionable; "03:16 PM" is not. */
function ago(d: Date): string {
  const secs = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (secs < 90) return Math.round(secs) + " SEC AGO";
  const mins = secs / 60;
  if (mins < 90) return Math.round(mins) + " MIN AGO";
  const hours = mins / 60;
  if (hours < 36) return Math.round(hours) + " HOURS AGO";
  return Math.round(hours / 24) + " DAYS AGO";
}

function StateCell({
  label, value, bad, wide, title, sub,
}: {
  label: string; value: string; bad: boolean; wide?: boolean; title?: string;
  /** A quieter second line — the duration under a date, the channels under a yes. */
  sub?: string;
}) {
  return (
    <div className={clsx("px-5 py-2 leading-tight", wide && "min-w-[13rem]")}
         style={{ borderColor: HMI.line }} title={title}>
      <div className="text-[11px] tracking-widest uppercase" style={{ color: HMI.inkFaint }}>
        {label}
      </div>
      <div
        className="text-[20px] font-mono-num font-semibold tabular-nums leading-tight"
        style={{ color: bad ? HMI.warn : HMI.ink }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11px] font-mono-num tracking-wide" style={{ color: HMI.inkFaint }}>
          {sub}
        </div>
      )}
    </div>
  );
}
