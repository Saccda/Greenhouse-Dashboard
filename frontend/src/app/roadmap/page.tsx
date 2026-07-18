"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Rocket, Info, Droplets, Zap, Sprout, FlaskConical, Camera, Gauge,
  AlertTriangle, CheckCircle2, Leaf as LeafIcon,
} from "lucide-react";
import { clsx } from "clsx";

import KPICard from "@/components/ui/KPICard";
import TrendChart from "@/components/roadmap/TrendChart";
import MiniBarChart from "@/components/roadmap/MiniBarChart";
import { mulberry32, hourlyTimeline, dailyTimeline, daylightCurve, round } from "@/lib/simData";

// ─────────────────────────────────────────────────────────────────────────
// Section shell — icon badge + title + description, matching the "What's
// Next" cards on the Overview page so the two pages read as one narrative.
// ─────────────────────────────────────────────────────────────────────────

function SectionShell({
  id, icon: Icon, color, bg, border, title, description, children,
}: {
  id: string; icon: React.ElementType; color: string; bg: string; border: string;
  title: string; description: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-3 scroll-mt-4">
      <div className="flex items-start gap-4">
        <div className={clsx("shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border", bg, border)}>
          <Icon size={20} className={color} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
          <p className="text-base text-slate-500 mt-1">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function TripleStat({ title, items }: { title: string; items: { label: string; value: string; color: string }[] }) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-2xl p-5 min-h-[10rem] flex flex-col">
      <p className="text-base font-semibold leading-tight text-slate-300">{title}</p>
      <div className="flex-1 grid grid-cols-3 gap-2 mt-3">
        {items.map((it) => (
          <div key={it.label} className="flex flex-col items-center justify-center rounded-xl bg-surface-hover py-3">
            <span className="text-2xl font-extrabold tabular-nums" style={{ color: it.color }}>{it.value}</span>
            <span className="text-[10px] text-slate-500 mt-1 uppercase tracking-wide">{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Water
// ─────────────────────────────────────────────────────────────────────────

function WaterSection() {
  const rand = mulberry32(101);
  const days = dailyTimeline(7).map((d, i) => ({
    label: d.label,
    value: round(16 + i * 1.3 + rand() * 7, 1),
  }));
  const today = days[days.length - 1].value;
  const weekTotal = round(days.reduce((s, d) => s + d.value, 0), 0);

  return (
    <SectionShell
      id="water"
      icon={Droplets} color="text-sky-400" bg="bg-sky-500/10" border="border-sky-500/30"
      title="Water" description="A flow meter on the supply line — usage per cycle, and an anomaly signature that can catch a leak long before anyone notices standing water."
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard title="Today's Usage" value={today} unit="L" icon={Droplets} subtitle="Metered at the supply line" />
        <KPICard title="Flow Rate Now" value="0.0" unit="L/min" icon={Gauge} subtitle="Idle — no active spray cycle" />
        <KPICard title="This Week" value={weekTotal} unit="L" icon={Droplets} subtitle="Across all spray cycles" />
        <KPICard title="Leak Status" value="Normal" icon={CheckCircle2} subtitle="No anomalous flow detected" status="ok" />
      </div>
      <div className="bg-surface-card border border-surface-border rounded-xl p-4">
        <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Daily usage — last 7 days</p>
        <MiniBarChart data={days} color="#38bdf8" unit=" L" highlightLast />
      </div>
    </SectionShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Energy
// ─────────────────────────────────────────────────────────────────────────

function EnergySection() {
  const rand = mulberry32(202);
  let soc = 78;
  const hours = hourlyTimeline(24).map((h) => {
    const solar = round(Math.max(0, daylightCurve(h.hourOfDay, 1.8) + (rand() - 0.5) * 0.15), 2);
    const netCharge = solar > 0.2 ? solar * 3.2 : -2.4; // charges by day, draws down overnight
    soc = Math.min(100, Math.max(35, soc + netCharge + (rand() - 0.5)));
    return { label: h.label, solar, soc: round(soc, 0) };
  });
  const solarToday = round(hours.reduce((s, h) => s + h.solar, 0), 1);

  return (
    <SectionShell
      id="energy"
      icon={Zap} color="text-amber-400" bg="bg-amber-500/10" border="border-amber-500/30"
      title="Energy" description="Solar generation, battery state of charge, and battery health over time — the off-grid system the pumps already depend on, finally visible instead of assumed."
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard title="Solar Today" value={solarToday} unit="kWh" icon={Zap} subtitle="Generated so far today" />
        <KPICard title="Battery SoC" value={hours[hours.length - 1].soc} unit="%" icon={Gauge} subtitle="State of charge, right now" />
        <KPICard title="Battery Health" value="97" unit="%" icon={CheckCircle2} subtitle="State of health vs. rated capacity" status="ok" />
        <KPICard title="Grid-Free Streak" value="312" unit="days" icon={Zap} subtitle="Days running fully off-grid" />
      </div>
      <div className="bg-surface-card border border-surface-border rounded-xl p-4">
        <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Solar output vs. battery charge — last 24h</p>
        <TrendChart
          data={hours}
          series={[
            { key: "solar", name: "Solar Output", color: "#fbbf24", unit: " kW", variant: "area" },
            { key: "soc", name: "Battery SoC", color: "#38bdf8", unit: "%", axis: "right" },
          ]}
        />
      </div>
    </SectionShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Soil
// ─────────────────────────────────────────────────────────────────────────

function SoilSection() {
  const rand = mulberry32(303);
  let moisture = 44;
  const days = dailyTimeline(7).map((d) => {
    moisture = moisture - 4 - rand() * 2;
    if (moisture < 28) moisture = 46; // irrigation event resets it
    return { label: d.label, moisture: round(moisture, 0), soilTemp: round(26.5 + Math.sin(d.dayIndex) * 1.2 + rand() * 0.6, 1) };
  });
  const latest = days[days.length - 1];

  return (
    <SectionShell
      id="soil"
      icon={Sprout} color="text-emerald-400" bg="bg-emerald-500/10" border="border-emerald-500/30"
      title="Soil" description="Soil temperature, moisture, and N-P-K at the root zone — irrigation and feeding decisions grounded in what the roots actually experience, not just canopy air readings."
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard title="Soil Moisture" value={latest.moisture} unit="%" icon={Droplets} subtitle="30 cm root-zone depth" />
        <KPICard title="Soil Temp" value={latest.soilTemp} unit="°C" icon={Sprout} subtitle="30 cm root-zone depth" />
        <TripleStat
          title="N-P-K (mg/kg)"
          items={[
            { label: "N", value: "42", color: "#4ade80" },
            { label: "P", value: "18", color: "#facc15" },
            { label: "K", value: "63", color: "#38bdf8" },
          ]}
        />
        <KPICard title="Soil Health" value="Good" icon={CheckCircle2} subtitle="Composite of moisture, temp & N-P-K" status="ok" />
      </div>
      <div className="bg-surface-card border border-surface-border rounded-xl p-4">
        <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Soil moisture & temperature — last 7 days</p>
        <TrendChart
          data={days}
          series={[
            { key: "moisture", name: "Moisture", color: "#38bdf8", unit: "%", variant: "area" },
            { key: "soilTemp", name: "Soil Temp", color: "#fb923c", unit: "°C", axis: "right" },
          ]}
        />
      </div>
    </SectionShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Fertilizer input
// ─────────────────────────────────────────────────────────────────────────

const FERTILIZER_LOG = [
  { date: "Jul 2",  n: 1.8, p: 0.6, k: 2.2 },
  { date: "Jun 18", n: 1.6, p: 0.5, k: 2.0 },
  { date: "Jun 4",  n: 1.8, p: 0.6, k: 2.1 },
  { date: "May 21", n: 1.5, p: 0.5, k: 1.9 },
  { date: "May 7",  n: 1.7, p: 0.6, k: 2.0 },
];

function FertilizerSection() {
  const seasonN = round(FERTILIZER_LOG.reduce((s, r) => s + r.n, 0), 1);
  const seasonP = round(FERTILIZER_LOG.reduce((s, r) => s + r.p, 0), 1);
  const seasonK = round(FERTILIZER_LOG.reduce((s, r) => s + r.k, 0), 1);

  return (
    <SectionShell
      id="fertilizer"
      icon={FlaskConical} color="text-violet-400" bg="bg-violet-500/10" border="border-violet-500/30"
      title="Fertilizer input" description="Every N-P-K application logged against the soil readings before and after it — the first real record of whether a feeding schedule is under-, over-, or right-dosing the crop."
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard title="Last Applied" value="Jul 2" icon={FlaskConical} subtitle="14 days ago" />
        <KPICard title="Season N" value={seasonN} unit="kg" icon={FlaskConical} subtitle="Nitrogen applied this season" />
        <KPICard title="Season P" value={seasonP} unit="kg" icon={FlaskConical} subtitle="Phosphorus applied this season" />
        <KPICard title="Season K" value={seasonK} unit="kg" icon={FlaskConical} subtitle="Potassium applied this season" />
      </div>
      <div className="bg-surface-card border border-surface-border rounded-xl p-4">
        <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Application log</p>
        <div className="divide-y divide-surface-border">
          <div className="grid grid-cols-4 text-xs font-semibold text-slate-500 uppercase tracking-wide pb-2">
            <span>Date</span><span>N (kg)</span><span>P (kg)</span><span>K (kg)</span>
          </div>
          {FERTILIZER_LOG.map((r) => (
            <div key={r.date} className="grid grid-cols-4 text-sm text-slate-300 py-2.5">
              <span className="font-mono-num">{r.date}</span>
              <span className="font-mono-num">{r.n.toFixed(1)}</span>
              <span className="font-mono-num">{r.p.toFixed(1)}</span>
              <span className="font-mono-num">{r.k.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Plant Visual (computer vision)
// ─────────────────────────────────────────────────────────────────────────

const DETECTION_LOG = [
  { date: "Today, 07:12",   location: "Row 4, Plant 09", finding: "Healthy — no signs detected", confidence: 98, severity: "ok" as const },
  { date: "Yesterday, 07:05", location: "Row 2, Plant 21", finding: "Early leaf yellowing — monitor",  confidence: 82, severity: "warn" as const },
  { date: "Yesterday, 07:03", location: "Row 2, Plant 14", finding: "Possible pollu beetle damage",    confidence: 76, severity: "warn" as const },
  { date: "Jul 15, 07:10",  location: "Row 6, Plant 03", finding: "Healthy — no signs detected", confidence: 99, severity: "ok" as const },
  { date: "Jul 14, 07:08",  location: "Row 1, Plant 18", finding: "Healthy — no signs detected", confidence: 97, severity: "ok" as const },
];

// Reference imagery — real Piper nigrum photos (CC BY-SA, Wikimedia Commons),
// standing in until this farm's own stem/leaf/berry photos replace them.
// Not stock "detection" photos and not claimed as live captures — labeled
// as reference material, with attribution as the licence requires.
const REFERENCE_IMAGES = [
  {
    id: "stem", label: "Stem", src: "/plant-ref-stem.jpg",
    author: "H. Zell", license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Piper_nigrum_001.JPG",
  },
  {
    id: "leaf", label: "Leaf", src: "/plant-ref-leaf.jpg",
    author: "David Monniaux", license: "CC BY-SA",
    source: "https://commons.wikimedia.org/wiki/File:Piper_nigrum_dsc00197.jpg",
  },
  {
    id: "berries", label: "Peppercorn cluster (unripe)", src: "/plant-ref-berries.jpg",
    author: "K Hari Krishnan", license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Black_Pepper_(Piper_nigrum)_fruits.jpg",
  },
  {
    id: "flower", label: "Flower spike", src: "/plant-ref-flower.jpg",
    author: "Forest & Kim Starr", license: "CC BY 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Starr-130312-2428-Piper_nigrum-leaves_and_flower_spikes-Pali_o_Waipio_Huelo-Maui_(25181000846).jpg",
  },
  {
    id: "dried", label: "Dried peppercorns", src: "/plant-ref-dried.jpg",
    author: "Didier Descouens", license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Piper_nigrum_Dried_fruits_with_and_without_pericarp_-_Penja_Cameroun.jpg",
  },
];

function ReferenceImage({ label, src, author, license, source }: {
  label: string; src: string; author?: string; license?: string; source?: string;
}) {
  const [error, setError] = useState(false);
  return (
    <div className="rounded-lg overflow-hidden border border-surface-border">
      <div className={clsx(
        "aspect-square relative",
        error ? "border-2 border-dashed border-surface-bright bg-surface-hover" : "bg-surface-hover",
      )}>
        {!error ? (
          <Image
            src={src}
            alt={`Reference ${label.toLowerCase()} photo`}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover"
            onError={() => setError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center">
            <Camera size={20} className="text-slate-500" />
            <p className="text-xs font-medium text-slate-400">Add {label.toLowerCase()} photo</p>
            <code className="text-slate-600 text-[9px]">{src.split("/").pop()}</code>
          </div>
        )}
      </div>
      <div className="bg-surface-card py-1.5 px-2 text-center">
        <p className="text-xs text-slate-500">{label}</p>
        {!error && author && source && (
          <a
            href={source} target="_blank" rel="noreferrer noopener"
            className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
          >
            Photo: {author} / {license}, Wikimedia Commons
          </a>
        )}
      </div>
    </div>
  );
}

function PlantVisualSection() {
  const weekCounts = [
    { label: "Mon", value: 0 }, { label: "Tue", value: 1 }, { label: "Wed", value: 0 },
    { label: "Thu", value: 0 }, { label: "Fri", value: 2 }, { label: "Sat", value: 0 }, { label: "Sun", value: 1 },
  ];

  return (
    <SectionShell
      id="plant-visual"
      icon={Camera} color="text-rose-400" bg="bg-rose-500/10" border="border-rose-500/30"
      title="Plant Visual" description="Live imaging of stem, leaf, and berry clusters — aimed first at Phytophthora foot rot and pollu beetle damage, the two production risks that do more damage to black pepper worldwide than heat alone."
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard title="Scanned Today" value="146" unit="plants" icon={Camera} subtitle="Full pass completed at 07:12" />
        <KPICard title="Active Alerts" value="2" icon={AlertTriangle} subtitle="Flagged for a technician to check" status="warn" />
        <KPICard title="Disease Risk" value="Low" icon={CheckCircle2} subtitle="Composite of imaging + ambient + soil" status="ok" />
        <KPICard title="Detections" value="4" unit="/ week" icon={Camera} subtitle="Non-healthy findings this week" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-card border border-surface-border rounded-xl p-4">
          <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Recent scans</p>
          <div className="space-y-2">
            {DETECTION_LOG.map((d) => (
              <div key={`${d.date}-${d.location}`} className="flex items-center gap-3 py-2 border-b border-surface-border last:border-0">
                <span className={clsx(
                  "shrink-0 w-2 h-2 rounded-full",
                  d.severity === "ok" ? "bg-brand-green" : "bg-amber-400",
                )} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-200 truncate">{d.finding}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{d.location} · {d.date}</p>
                </div>
                <span className="text-xs font-mono-num text-slate-500 shrink-0">{d.confidence}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-4">
          <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Detections this week</p>
          <MiniBarChart data={weekCounts} color="#fb7185" />
        </div>
      </div>
      <div className="bg-surface-card border border-surface-border rounded-xl p-4">
        <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-1">Reference imagery</p>
        <p className="text-xs text-slate-500 mb-3">
          What the model is trained to look at, across the plant&rsquo;s lifecycle. Reference photos
          of <em>Piper nigrum</em> for now — swap in this farm&rsquo;s own photos once available.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {REFERENCE_IMAGES.map((img) => <ReferenceImage key={img.id} {...img} />)}
        </div>
      </div>
    </SectionShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Ambient
// ─────────────────────────────────────────────────────────────────────────

function AmbientSection() {
  const rand = mulberry32(404);
  const hours = hourlyTimeline(24).map((h) => {
    const temp = round(27 + Math.sin(((h.hourOfDay - 9) / 24) * 2 * Math.PI) * 5 + (rand() - 0.5), 1);
    const humidity = round(72 - Math.sin(((h.hourOfDay - 9) / 24) * 2 * Math.PI) * 12 + (rand() - 0.5) * 3, 0);
    const co2 = round(420 + Math.max(0, 1 - daylightCurve(h.hourOfDay, 1)) * 90 + (rand() - 0.5) * 10, 0);
    const light = round(daylightCurve(h.hourOfDay, 1450) + rand() * 20, 0);
    return { label: h.label, temp, humidity, co2, light };
  });
  const latest = hours[hours.length - 1];

  return (
    <SectionShell
      id="ambient"
      icon={Gauge} color="text-orange-400" bg="bg-orange-500/10" border="border-orange-500/30"
      title="Ambient" description="Today's temperature and humidity, expanding to CO2 and light intensity — the same sensor category the cooling and spray loops already run on, just measuring more of what the plant feels."
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard title="Temperature" value={latest.temp} unit="°C" icon={Gauge} subtitle="Live today" />
        <KPICard title="Humidity" value={latest.humidity} unit="%" icon={Droplets} subtitle="Live today" />
        <KPICard title="CO2" value={latest.co2} unit="ppm" icon={LeafIcon} subtitle="Planned addition" />
        <KPICard title="Light Intensity" value={latest.light} unit="µmol" icon={Zap} subtitle="PAR, planned addition" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-card border border-surface-border rounded-xl p-4">
          <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Temperature & humidity — last 24h</p>
          <TrendChart
            data={hours}
            series={[
              { key: "temp", name: "Temperature", color: "#fb923c", unit: "°C" },
              { key: "humidity", name: "Humidity", color: "#60a5fa", unit: "%", axis: "right" },
            ]}
          />
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-4">
          <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">CO2 & light intensity — last 24h</p>
          <TrendChart
            data={hours}
            series={[
              { key: "co2", name: "CO2", color: "#a78bfa", unit: " ppm" },
              { key: "light", name: "Light", color: "#facc15", unit: " µmol", axis: "right", variant: "area" },
            ]}
          />
        </div>
      </div>
    </SectionShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────

export default function RoadmapPage() {
  // Handles a hash present on the initial load (e.g. a bookmarked or
  // shared /roadmap#health link) — the browser's native hash-scroll can
  // race with client-side rendering and miss the target on first paint.
  useEffect(() => {
    if (!window.location.hash) return;
    const id = window.location.hash.slice(1);
    const el = document.getElementById(id);
    el?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex items-center justify-between px-5 py-3.5 bg-surface-card border-b border-surface-border shrink-0">
        <div className="flex items-center gap-2">
          <Rocket size={16} className="text-slate-400" />
          <h1 className="text-sm font-semibold text-slate-200">Roadmap Preview</h1>
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-full">
          Simulated data — preview only
        </span>
      </header>

      <main className="flex-1 overflow-y-auto p-5 space-y-8">

        <section className="bg-surface-card border border-surface-border rounded-xl p-4 flex items-start gap-3">
          <Info size={18} className="text-sky-400 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-400 leading-relaxed">
            This is a working mockup of the dashboards described in the Overview page&rsquo;s roadmap —
            the layouts and charts are real, the numbers are simulated to show the shape of the data.
            Nothing on this page reads from a live sensor yet.
          </p>
        </section>

        <WaterSection />
        <EnergySection />
        <SoilSection />
        <FertilizerSection />
        <PlantVisualSection />
        <AmbientSection />

      </main>
    </div>
  );
}
