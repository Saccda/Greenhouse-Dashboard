"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";

import { swrFetcher } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { HMI } from "./tokens";

interface Health {
  status: string;
  influxdb: string;
  timestamp: string;
}

/**
 * The bottom status bar — is the SYSTEM working, as distinct from is the
 * PLANT working.
 *
 * Taken from the plant screens: theirs carries the server name, the computer
 * name and a comms chip per subsystem along the bottom of every page. It is
 * the answer to the question that undermines every other number on screen —
 * "can I trust what I am looking at".
 *
 * Ours has three links in the chain, and each can fail independently while the
 * others look fine: the browser reaching the API, the API reaching InfluxDB,
 * and the meter or controller reaching the broker. A dashboard that shows
 * stale data confidently is worse than one that admits it cannot tell, so this
 * is deliberately always visible rather than tucked behind a menu.
 *
 * The clock is here for the same reason a plant screen has one: a frozen page
 * looks exactly like a quiet one until you notice the time has stopped.
 */
export default function StatusBar({ feedStale }: { feedStale: boolean }) {
  const { user } = useAuth();
  const { data: health, error } = useSWR<Health>(
    "/api/health", swrFetcher, { refreshInterval: 30_000 },
  );
  const [now, setNow] = useState<Date | null>(null);

  // Set on the client only — rendering a clock during SSR guarantees a
  // hydration mismatch, since the server's second is never the browser's.
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const apiUp = !error && health?.status === "healthy";
  const influxUp = health?.influxdb === "connected";

  return (
    <footer
      className="flex items-center gap-5 px-5 h-9 shrink-0 text-[12px]"
      style={{ backgroundColor: HMI.panel, borderTop: "1px solid " + HMI.line, color: HMI.inkFaint }}
    >
      <span className="font-mono-num" style={{ color: HMI.inkMuted }}>
        {now ? now.toLocaleString([], {
          weekday: "short", day: "2-digit", month: "short",
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        }) : "—"}
      </span>

      <span className="w-px h-3.5" style={{ backgroundColor: HMI.line }} />

      <Chip label="API" ok={apiUp} />
      <Chip label="INFLUXDB" ok={influxUp} />
      {/* The feed is the one the other two cannot speak for: the API can be
          healthy and InfluxDB connected while the controller has said nothing
          for a day. */}
      <Chip label="CAMPUS FEED" ok={!feedStale} />

      <span className="ml-auto flex items-center gap-4">
        <span>
          OPERATOR{" "}
          <span className="font-semibold" style={{ color: HMI.inkMuted }}>
            {user ? `${user.username} (${user.role})` : "not signed in"}
          </span>
        </span>
      </span>
    </footer>
  );
}

function Chip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      {/* Square for good, hollow for bad — form as well as colour, so the state
          survives a colour-blind operator and a sunlit screen. */}
      <span
        className="w-2.5 h-2.5 inline-block"
        style={{
          backgroundColor: ok ? HMI.inkMuted : "transparent",
          border: ok ? "none" : "1px solid " + HMI.alarm,
        }}
      />
      <span style={{ color: ok ? HMI.inkFaint : HMI.alarm }}>{label}</span>
    </span>
  );
}
