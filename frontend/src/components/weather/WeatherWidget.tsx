"use client";
import { useMemo } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import useSWR from "swr";
import { clsx } from "clsx";
import { MapPin, Wind, Droplets } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

const WeatherMap = dynamic(() => import("./WeatherMap"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-slate-200/30 animate-pulse" />,
});

const fetcher = (url: string) => fetch(url).then(r => r.json());

const OPEN_METEO_URL =
  "https://api.open-meteo.com/v1/forecast" +
  "?latitude=10.6278&longitude=104.18" +
  "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m" +
  "&daily=weather_code,temperature_2m_max,temperature_2m_min" +
  "&timezone=Asia%2FBangkok&forecast_days=5";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Rain overlay ──────────────────────────────────────────────────────────────

function rainIntensity(code: number): "drizzle" | "rain" | "heavy" | null {
  if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57) return "drizzle";
  if (code === 61 || code === 63 || code === 80 || code === 81)                return "rain";
  if (code === 65 || code === 66 || code === 67 || code === 82 || code >= 95)  return "heavy";
  return null;
}

const RAIN_CFG = {
  drizzle: { count: 18, baseMs: 140, rangeMs: 60 },
  rain:    { count: 30, baseMs: 90,  rangeMs: 50 },
  heavy:   { count: 50, baseMs: 60,  rangeMs: 40 },
} as const;

function RainOverlay({ intensity }: { intensity: "drizzle" | "rain" | "heavy" }) {
  const { count, baseMs, rangeMs } = RAIN_CFG[intensity];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="raindrop absolute"
          style={{
            left:              `${(i * 97) % 100}%`,
            top:               -24,
            width:             "2px",
            height:            `${14 + (i * 7) % 14}px`,
            borderRadius:      "0 0 2px 2px",
            background:        "rgba(255,255,255,0.92)",
            boxShadow:         "0 0 3px rgba(100,180,255,0.6)",
            animationDelay:    `${((i * 37) % 28) / 10}s`,
            animationDuration: `${(baseMs + (i * 53) % rangeMs) / 100}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Weather helpers ───────────────────────────────────────────────────────────

function weatherEmoji(code: number): string {
  if (code === 0)  return "☀️";
  if (code <= 2)   return "🌤";
  if (code === 3)  return "☁️";
  if (code <= 48)  return "🌫";
  if (code <= 55)  return "🌦";
  if (code <= 65)  return "🌧";
  if (code <= 77)  return "🌨";
  if (code <= 82)  return "🌧";
  return "⛈";
}

function weatherLabel(code: number): string {
  if (code === 0)  return "Clear sky";
  if (code <= 2)   return "Partly cloudy";
  if (code === 3)  return "Overcast";
  if (code <= 48)  return "Foggy";
  if (code <= 55)  return "Drizzle";
  if (code <= 65)  return "Rain";
  if (code <= 77)  return "Snow";
  if (code <= 82)  return "Rain showers";
  return "Thunderstorm";
}

export default function WeatherWidget() {
  const { isDark } = useTheme();

  const { data } = useSWR(OPEN_METEO_URL, fetcher, {
    refreshInterval: 1_800_000,
    revalidateOnFocus: false,
  });

  const current = data?.current;
  const daily   = data?.daily;

  const forecast = useMemo(() => {
    if (!daily?.time) return [];
    return (daily.time as string[]).slice(0, 5).map((dateStr, i) => ({
      day:  i === 0 ? "Today" : DAY_NAMES[new Date(dateStr + "T12:00:00").getDay()],
      code: (daily.weather_code as number[])[i],
      max:  Math.round((daily.temperature_2m_max as number[])[i]),
      min:  Math.round((daily.temperature_2m_min as number[])[i]),
    }));
  }, [daily]);

  const temp      = current?.temperature_2m as number | undefined;
  const code      = (current?.weather_code as number) ?? 0;
  const wind      = current?.wind_speed_10m as number | undefined;
  const hum       = current?.relative_humidity_2m as number | undefined;
  const intensity = current ? rainIntensity(code) : null;

  return (
    <div className={clsx(
      "flex flex-col h-full rounded-2xl overflow-hidden border",
      isDark ? "bg-white/[0.07] border-white/10" : "bg-white border-slate-200 shadow-sm",
    )}>

      {/* ── Header ── */}
      <div className={clsx(
        "flex items-center justify-between px-3 py-2 shrink-0",
        isDark ? "border-b border-white/[0.08]" : "border-b border-slate-100",
      )}>
        <div className="flex items-center gap-1.5">
          <MapPin size={10} className="text-sky-400 shrink-0" />
          <span className={clsx("text-xs font-semibold", isDark ? "text-white" : "text-slate-700")}>
            Kampot, Cambodia
          </span>
        </div>

        {current ? (
          <div className="flex items-center gap-2">
            <span className="text-sm leading-none">{weatherEmoji(code)}</span>
            <span className={clsx("text-sm font-bold tabular-nums", isDark ? "text-white" : "text-slate-800")}>
              {temp != null ? `${Math.round(temp)}°C` : "—"}
            </span>
            <span className={clsx("text-[10px] hidden sm:inline", isDark ? "text-slate-400" : "text-slate-500")}>
              {weatherLabel(code)}
            </span>
            {wind != null && (
              <span className={clsx("text-[10px] flex items-center gap-0.5", isDark ? "text-slate-500" : "text-slate-400")}>
                <Wind size={9} />{wind.toFixed(0)} km/h
              </span>
            )}
            {hum != null && (
              <span className={clsx("text-[10px] flex items-center gap-0.5", isDark ? "text-slate-500" : "text-slate-400")}>
                <Droplets size={9} />{hum}%
              </span>
            )}
          </div>
        ) : (
          <div className="h-4 w-24 rounded bg-surface-hover animate-pulse" />
        )}
      </div>

      {/* ── Map ── */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <WeatherMap temp={temp} />
        {intensity && <RainOverlay intensity={intensity} />}
      </div>

      {/* ── 5-day forecast strip ── */}
      <div className={clsx(
        "flex items-stretch justify-between shrink-0",
        isDark ? "border-t border-white/[0.08]" : "border-t border-slate-100",
      )}>
        {forecast.length > 0 ? forecast.map((f, i) => (
          <div
            key={f.day}
            className={clsx(
              "flex flex-col items-center gap-0.5 flex-1 py-2",
              i < forecast.length - 1 && (isDark ? "border-r border-white/[0.06]" : "border-r border-slate-100"),
            )}
          >
            <span className={clsx("text-[9px] font-medium", isDark ? "text-slate-400" : "text-slate-500")}>
              {f.day}
            </span>
            <span className="text-sm leading-none">{weatherEmoji(f.code)}</span>
            <span className={clsx("text-[10px] font-bold tabular-nums", isDark ? "text-white" : "text-slate-700")}>
              {f.max}°
            </span>
            <span className={clsx("text-[9px] tabular-nums", isDark ? "text-slate-500" : "text-slate-400")}>
              {f.min}°
            </span>
          </div>
        )) : (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-1 py-2 flex flex-col items-center gap-1">
              <div className="h-2 w-6 rounded bg-surface-hover animate-pulse" />
              <div className="h-4 w-4 rounded bg-surface-hover animate-pulse" />
              <div className="h-2 w-5 rounded bg-surface-hover animate-pulse" />
            </div>
          ))
        )}
      </div>

    </div>
  );
}
