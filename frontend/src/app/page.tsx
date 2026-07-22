"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import useSWR from "swr";
import { clsx } from "clsx";
import {
  Search, ArrowUpRight, Leaf,
  LayoutDashboard, Sliders, BarChart3, Bell, History, Info,
  MapPin, Clock, Thermometer, Droplets, Cpu,
} from "lucide-react";

import { swrFetcher, fetchFarms } from "@/lib/api";
import { useTheme } from "@/hooks/useTheme";
import { useSettings } from "@/hooks/useSettings";
import WeatherWidget from "@/components/weather/WeatherWidget";
import type { LatestResponse, Farm } from "@/types";

const SECTIONS = [
  { href: "/overview",   label: "Overview",   sub: "How the system works",  icon: Info            },
  { href: "/dashboard",  label: "Dashboard",  sub: "Live sensor readings",  icon: LayoutDashboard },
  { href: "/control",    label: "Control",    sub: "Relay & thresholds",    icon: Sliders         },
  { href: "/analytics",  label: "Analytics",  sub: "Trends & statistics",   icon: BarChart3       },
  { href: "/alert-log",  label: "Alert Log",  sub: "Event & alert history", icon: Bell            },
  { href: "/historical", label: "Historical", sub: "Date-range browser",    icon: History         },
];

interface AlertLogResponse { logs: { id: number; created_at: string }[]; count: number; }

// ── Live info card ────────────────────────────────────────────────────────────

function FarmAnnotation({ farm }: { farm: Farm }) {
  const { data } = useSWR<LatestResponse>(
    `/api/sensors/latest?farm=${farm.id}`,
    swrFetcher,
    { refreshInterval: 15_000 },
  );

  const online = data?.is_online ?? false;
  const temp   = data?.readings?.temperature?.value;
  const hum    = data?.readings?.humidity?.value;
  const ageMin = data?.data_age_minutes;
  const relays = data?.relays ?? [];

  return (
    <div
      className="absolute top-5 right-5 w-60 bg-white rounded-2xl shadow-2xl border border-white/60 overflow-hidden"
      style={{ zIndex: 20 }}
    >
      <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-slate-100">
        <div>
          <p className="text-sm font-bold text-slate-900 leading-tight">{farm.display_name}</p>
          <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
            <MapPin size={9} className="shrink-0" />{farm.location}
          </p>
        </div>
        <span className={clsx(
          "flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full mt-0.5 shrink-0",
          online ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-400",
        )}>
          <span className={clsx(
            "w-1.5 h-1.5 rounded-full",
            online ? "bg-green-500 animate-pulse" : "bg-slate-400",
          )} />
          {online ? "Online" : "Offline"}
        </span>
      </div>

      <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
        <div className="px-4 py-3">
          <p className="text-[9px] text-slate-400 uppercase tracking-widest flex items-center gap-1 mb-1">
            <Thermometer size={9} /> Temperature
          </p>
          <p className={clsx(
            "text-xl font-extrabold font-mono-num leading-none",
            temp != null && temp >= 35 ? "text-red-500" : "text-slate-900",
          )}>
            {temp != null ? `${temp.toFixed(1)}°` : "—"}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Celsius</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[9px] text-slate-400 uppercase tracking-widest flex items-center gap-1 mb-1">
            <Droplets size={9} /> Humidity
          </p>
          <p className="text-xl font-extrabold font-mono-num leading-none text-blue-600">
            {hum != null ? `${hum.toFixed(0)}%` : "—"}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Relative</p>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-[9px] text-slate-400 uppercase tracking-widest flex items-center gap-1 mb-2.5">
          <Cpu size={9} /> Systems
        </p>
        {relays.length === 0 ? (
          <p className="text-[11px] text-slate-400">No relay data</p>
        ) : (
          <div className="space-y-1.5">
            {relays.map((relay: { key: string; label: string; state: string }) => (
              <div key={relay.key} className="flex items-center justify-between">
                <span className="text-[11px] text-slate-600 truncate pr-2">{relay.label}</span>
                <span className={clsx(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0",
                  relay.state === "ON"        ? "bg-green-50 text-green-600"
                  : relay.state === "UNKNOWN" ? "bg-amber-50 text-amber-500"
                  :                             "bg-slate-100 text-slate-500",
                )}>
                  {relay.state}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-50">
        <Clock size={10} className="text-slate-400 shrink-0" />
        <span className="text-[10px] text-slate-400">
          {ageMin == null ? "Waiting for data…"
            : ageMin < 1  ? "Just updated"
            :               `Updated ${Math.round(ageMin)} min ago`}
        </span>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { isDark } = useTheme();
  const { settings } = useSettings();

  const [query,          setQuery]          = useState("");
  const [farms,          setFarms]          = useState<Farm[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState(settings.defaultFarm);
  const [imgError,       setImgError]       = useState(false);

  // Compute left column width so 4 rows of aspect-square cards fill the exact height.
  // The image panel gets whatever remains via flex-1.
  const leftPanelRef  = useRef<HTMLDivElement>(null);
  const [leftWidth,      setLeftWidth]      = useState(320);
  const [cardsGridHeight, setCardsGridHeight] = useState(300);

  useEffect(() => {
    const el = leftPanelRef.current;
    if (!el) return;
    const compute = () => {
      const h   = el.clientHeight;
      const gap = 12; // gap-3
      // Cards take ~65% of panel height, leaving ~35% for the weather widget
      const cardsH  = Math.floor(h * 0.65);
      const cardH   = (cardsH - 2 * gap) / 3;
      setLeftWidth(Math.max(150, Math.round(2 * cardH + gap)));
      setCardsGridHeight(cardsH);
    };
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    compute();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    fetchFarms().then((r) => setFarms(r.farms)).catch(() => {});
  }, []);

  const { data: alertData } = useSWR<AlertLogResponse>(
    "/api/notifications/log?days=1&limit=100",
    swrFetcher,
    { refreshInterval: 60_000 },
  );

  // System online status for the header pill
  const { data: sensorLatest } = useSWR<LatestResponse>(
    `/api/sensors/latest?farm=${selectedFarmId}`,
    swrFetcher,
    { refreshInterval: 15_000 },
  );
  const isOnline = sensorLatest?.is_online ?? null;

  // Live clock — null on server to avoid hydration mismatch, set after mount
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const clockDate = now?.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short" }) ?? "";
  const clockTime = now?.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) ?? "";

  // Read last-viewed timestamp on mount (re-reads when component remounts after navigation)
  const [lastAlertView] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("gh_last_alert_view") : null
  );

  const alertCount = alertData?.logs
    ? alertData.logs.filter(log =>
        !lastAlertView || new Date(log.created_at) > new Date(lastAlertView)
      ).length
    : 0;
  const selectedFarm = farms.find((f) => f.id === selectedFarmId) ?? null;

  const filtered = query
    ? SECTIONS.filter((s) => s.label.toLowerCase().includes(query.toLowerCase()))
    : SECTIONS;

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--navy-bg)" }}>

      {/* ── Header ──────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-6 py-4 border-b shrink-0"
        style={{
          borderColor: "var(--navy-border)",
          background: isDark
            ? "linear-gradient(to bottom, rgba(0,40,120,0.45) 0%, rgba(0,16,64,0.15) 100%)"
            : "linear-gradient(to bottom, rgba(255,255,255,0.95) 0%, rgba(242,247,243,0.70) 100%)",
        }}
      >
        {/* ── Left: logo + brand + status pill ── */}
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div className={clsx(
            "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ring-1",
            isDark
              ? "bg-emerald-500/20 ring-emerald-500/25"
              : "bg-emerald-50 ring-emerald-200",
          )}>
            <Leaf size={18} strokeWidth={2} className="text-emerald-400" />
          </div>

          {/* Split typography */}
          <h1 className="text-base leading-tight">
            <span className={clsx("font-bold", isDark ? "text-white" : "text-slate-900")}>
              Greenhouse
            </span>
            <span className={clsx("font-normal ml-1.5", isDark ? "text-slate-400" : "text-slate-500")}>
              Management System
            </span>
          </h1>

          {/* Live status pill */}
          {isOnline !== null && (
            <div className={clsx(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border",
              isOnline
                ? isDark
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-emerald-50 text-emerald-600 border-emerald-200"
                : isDark
                  ? "bg-slate-500/10 text-slate-400 border-slate-600/30"
                  : "bg-slate-100 text-slate-500 border-slate-300",
            )}>
              <span className={clsx(
                "w-1.5 h-1.5 rounded-full shrink-0",
                isOnline ? "bg-emerald-400 animate-pulse" : "bg-slate-400",
              )} />
              {isOnline ? "Online" : "Offline"}
            </div>
          )}
        </div>

        {/* ── Right: clock + bell + farm selector + search ── */}
        <div className="flex items-center gap-3">

          {/* Live clock */}
          {now && (
            <div className={clsx(
              "hidden md:flex items-center gap-2 text-sm tabular-nums select-none",
              isDark ? "text-slate-400" : "text-slate-500",
            )}>
              <Clock size={15} className="shrink-0 opacity-60" />
              <span>{clockDate}</span>
              <span className={isDark ? "text-slate-600" : "text-slate-300"}>·</span>
              <span className="font-mono font-medium">{clockTime}</span>
            </div>
          )}

          {/* Divider */}
          <div className={clsx("hidden md:block w-px h-4 shrink-0", isDark ? "bg-white/10" : "bg-slate-200")} />

          {/* Notification bell */}
          <Link
            href="/alert-log"
            className={clsx(
              "relative p-1.5 rounded-lg transition-colors",
              isDark
                ? "text-slate-400 hover:text-white hover:bg-white/10"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-100",
            )}
          >
            <Bell size={18} strokeWidth={1.8} />
            {alertCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow shadow-red-500/40">
                {alertCount > 99 ? "99+" : alertCount}
              </span>
            )}
          </Link>

          {/* Divider */}
          <div className={clsx("w-px h-4 shrink-0", isDark ? "bg-white/10" : "bg-slate-200")} />

          {/* Farm selector */}
          {farms.length > 1 && (
            <select
              value={selectedFarmId}
              onChange={(e) => setSelectedFarmId(e.target.value)}
              className={clsx(
                "text-sm rounded-lg px-3 py-1.5 border focus:outline-none cursor-pointer",
                isDark
                  ? "bg-white/10 border-white/15 text-white"
                  : "bg-white border-slate-200 text-slate-700",
              )}
            >
              {farms.map((f) => (
                <option key={f.id} value={f.id}>{f.display_name}</option>
              ))}
            </select>
          )}

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={clsx(
                "pl-8 pr-4 py-1.5 rounded-lg text-sm border focus:outline-none transition-colors w-36",
                isDark
                  ? "text-white placeholder-slate-500 border-white/15 focus:border-blue-400/60"
                  : "text-slate-800 placeholder-slate-400 border-slate-200 focus:border-sky-400",
              )}
              style={{ backgroundColor: "var(--navy-input)" }}
            />
          </div>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden p-4 gap-4 min-h-0">

        {/* ── Left panel: cards (top) + weather widget (bottom) ── */}
        <div
          ref={leftPanelRef}
          style={{ width: leftWidth }}
          className="shrink-0 flex flex-col gap-3 min-h-0"
        >
          {/* Navigation cards grid */}
          <div
            className="grid grid-cols-2 grid-rows-3 gap-3 shrink-0"
            style={{ height: cardsGridHeight }}
          >
            {filtered.map(({ href, label, sub, icon: Icon }) => {
              const isAlertLog = href === "/alert-log";
              return (
                <Link
                  key={href}
                  href={href}
                  className={clsx(
                    "relative group flex flex-col p-4",
                    "rounded-2xl border",
                    "transition-all duration-200",
                    "hover:scale-[1.02] active:scale-[0.97]",
                    isDark
                      ? "bg-white/[0.07] border-white/10 hover:border-white/20 hover:shadow-lg hover:shadow-black/40"
                      : "bg-white border-slate-200 shadow-sm hover:border-sky-300 hover:shadow-md hover:shadow-blue-100",
                  )}
                >
                  {/* Hover gradient - clipped to the card's own rounded corners via this wrapper,
                      so the outer Link stays unclipped and the corner badge below isn't cut off */}
                  <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-br from-sky-500 to-sky-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>

                  {/* Arrow */}
                  <ArrowUpRight size={15} className={clsx(
                    "absolute top-4 right-4 z-10 transition-colors",
                    isDark ? "text-slate-600 group-hover:text-white/50" : "text-slate-300 group-hover:text-white/50",
                  )} />

                  {/* Content */}
                  <div className="relative z-10 flex flex-col items-center justify-center h-full gap-5">
                    <div className={clsx(
                      "w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 transition-colors",
                      isDark ? "bg-sky-500/20 group-hover:bg-white/20" : "bg-blue-50 group-hover:bg-white/30",
                    )}>
                      <Icon size={34} strokeWidth={1.4} className="text-sky-400 group-hover:text-white transition-colors" />
                    </div>
                    <div className="text-center mt-1">
                      <p className={clsx(
                        "text-base font-bold leading-tight transition-colors group-hover:text-white",
                        isDark ? "text-white" : "text-slate-800",
                      )}>
                        {label}
                      </p>
                      <p className={clsx(
                        "text-xs mt-1.5 leading-tight transition-colors group-hover:text-white/60",
                        isDark ? "text-slate-500" : "text-slate-400",
                      )}>
                        {sub}
                      </p>
                    </div>
                  </div>

                  {isAlertLog && alertCount > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-md shadow-red-500/40 z-20">
                      {alertCount > 99 ? "99+" : alertCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Weather widget */}
          <div className="flex-1 min-h-0">
            <WeatherWidget />
          </div>
        </div>

        {/* ── Right: farm image ─────────────────────────────── */}
        <div className="flex-1 relative rounded-2xl overflow-hidden bg-slate-900 min-h-0">

          {!imgError ? (
            <Image
              src="/farm.jpg"
              alt="Farm overview"
              fill
              className="object-cover"
              onError={() => setImgError(true)}
              priority
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-800 to-slate-900">
              <div className="text-7xl select-none" style={{ opacity: 0.12 }}>🌿</div>
              <div className="text-center space-y-2">
                <p className="text-slate-400 text-sm font-medium">Add your farm photo to display here</p>
                <code className="text-slate-500 text-xs bg-slate-800 px-4 py-2 rounded-lg block">
                  frontend/public/farm.jpg
                </code>
              </div>
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-transparent to-transparent pointer-events-none" />

          {selectedFarm && <FarmAnnotation farm={selectedFarm} />}

          {selectedFarm && (
            <div className="absolute bottom-5 left-5" style={{ zIndex: 20 }}>
              <div className="flex items-center gap-2 bg-black/55 backdrop-blur-md text-white text-xs px-3.5 py-2 rounded-xl border border-white/10">
                <MapPin size={12} className="text-sky-400 shrink-0" />
                <span className="font-bold">{selectedFarm.display_name}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-300">{selectedFarm.location}</span>
              </div>
            </div>
          )}

          {/* Partner logos — collaboration credit, kept separate from our own identity in the header.
              Each logo already carries its own white backing for legibility, so the group sits
              directly on the photo instead of inside a second, redundant card. */}
          <div className="absolute bottom-5 right-5 flex items-center gap-4" style={{ zIndex: 20 }}>
            <span className="text-sm font-bold uppercase tracking-widest text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.85),0_1px_12px_rgba(0,0,0,0.6)] shrink-0">
              In partnership with
            </span>
            <div className="flex items-center gap-3.5">
              <div className="h-16 px-4 flex items-center bg-white rounded-xl shadow-lg">
                <Image
                  src="/soge_logo.png" alt="SOGE — Solar Green Energy Cambodia"
                  width={2000} height={749}
                  className="h-12 w-auto object-contain"
                />
              </div>
              <div className="h-16 px-3 flex items-center bg-white rounded-xl shadow-lg">
                <Image
                  src="/FairsFarmLogo.png" alt="Fair Farms — Organic Spices"
                  width={368} height={357}
                  className="h-[3.4rem] w-auto object-contain"
                />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
