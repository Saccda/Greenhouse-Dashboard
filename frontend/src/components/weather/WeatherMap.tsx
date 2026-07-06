"use client";
import { useEffect, useRef } from "react";

const KAMPOT: [number, number] = [10.6278, 104.18];
const OWM_KEY = "400be4092c6444beba5b5082578be159";

// RainViewer color scheme 6 = RAINBOW (blue→cyan→green→yellow→red)
const RV_COLOR = 6;

function iconHtml(temp?: number) {
  return `<div style="
    width:40px;height:40px;
    background:rgba(255,255,255,0.95);
    border:2.5px solid rgba(0,120,255,0.35);
    border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    font-size:13px;font-weight:700;color:#111;
    box-shadow:0 2px 12px rgba(0,0,0,0.35);
  ">${temp != null ? Math.round(temp) + "°" : "—"}</div>`;
}

export default function WeatherMap({ temp }: { temp?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);
  const markerRef    = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let alive = true;

    (async () => {
      const mod = await import("leaflet");
      if (!alive || !containerRef.current) return;
      const L = mod.default;

      const map = L.map(containerRef.current, {
        center: KAMPOT, zoom: 6,
        zoomControl: false, attributionControl: false,
        scrollWheelZoom: false,
      });
      mapRef.current = map;

      // Colorful Voyager base — green terrain, blue water, road network
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png",
      ).addTo(map);

      // RainViewer radar — free, no API key, vivid RAINBOW colours
      // Falls back to OWM precipitation if unavailable
      try {
        const rv = await fetch("https://api.rainviewer.com/public/weather-maps.json").then(r => r.json());
        if (!alive) return;
        const past: { time: number }[] = rv?.radar?.past ?? [];
        if (past.length > 0) {
          const ts = past[past.length - 1].time;
          L.tileLayer(
            `https://tilecache.rainviewer.com/v2/radar/${ts}/256/{z}/{x}/{y}/${RV_COLOR}/1_0.png`,
            { opacity: 0.75, maxNativeZoom: 6 },
          ).addTo(map);
        } else {
          throw new Error("no radar data");
        }
      } catch {
        L.tileLayer(
          `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`,
          { opacity: 0.85 },
        ).addTo(map);
      }

      // Voyager labels on top of radar so place names stay readable
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png",
      ).addTo(map);

      const icon = L.divIcon({ className: "", html: iconHtml(temp), iconSize: [40, 40], iconAnchor: [20, 20] });
      markerRef.current = L.marker(KAMPOT, { icon }).addTo(map);
    })();

    return () => {
      alive = false;
      mapRef.current?.remove();
      mapRef.current    = null;
      markerRef.current = null;
    };
  // temp intentionally omitted — marker updates via second effect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!markerRef.current) return;
    import("leaflet").then((mod) => {
      if (!markerRef.current) return;
      const icon = mod.default.divIcon({ className: "", html: iconHtml(temp), iconSize: [40, 40], iconAnchor: [20, 20] });
      markerRef.current.setIcon(icon);
    });
  }, [temp]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
