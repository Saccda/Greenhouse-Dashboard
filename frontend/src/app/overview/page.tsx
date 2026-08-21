"use client";
import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Info, Video, Thermometer, Droplets, Database, Radio, ArrowRight,
  ThermometerSun, X, ChevronLeft, ChevronRight, Compass, ImageOff,
  Cpu, Workflow, Server, Cloud, Leaf,
  Zap, Sprout, FlaskConical, Camera, Gauge, Rocket, Sparkles,
} from "lucide-react";
import { clsx } from "clsx";
import SystemFlowDiagram from "@/components/hmi/SystemFlowDiagram";

// ─────────────────────────────────────────────────────────────────────────
// CDIO phase header — used to anchor each section to the Conceive / Design /
// Implement / Operate framework this project was built around.
// ─────────────────────────────────────────────────────────────────────────

function PhaseHeader({ n, phase, title, tagline }: { n: string; phase: string; title: string; tagline: string }) {
  return (
    <div className="flex items-start gap-4">
      <div className="shrink-0 w-12 h-12 rounded-xl bg-brand-green/10 border border-brand-green/30 flex items-center justify-center">
        <span className="text-brand-green font-bold text-base">{n}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-brand-green uppercase tracking-widest">{phase}</p>
        <h2 className="text-xl font-semibold text-slate-100 mt-0.5">{title}</h2>
        <p className="text-base text-slate-500 mt-1">{tagline}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Conceive — the problem
// ─────────────────────────────────────────────────────────────────────────

const SOURCES = [
  {
    text: "AFP, “Cambodia's famed Kampot pepper withers,” May 2024",
    url: "https://phys.org/news/2024-05-cambodia-famed-kampot-pepper-withers.html",
  },
  {
    text: "Sum & Thav (2023), APN Science Bulletin — coastal Cambodia climate survey",
    url: "https://www.apn-gcr.org/bulletin/article/impact-of-climate-change-climate-variability-and-adaptation-in-the-coastal-area-of-cambodia/",
  },
  {
    text: "World Bank / ADB / GFDRR, Climate Risk Country Profile: Cambodia",
    url: "https://climateknowledgeportal.worldbank.org/country/cambodia",
  },
  {
    text: "Hema, Priyanka & Chakravarthy (2023), Krishi Science eMagazine",
    url: "https://krishiscience.co.in/storage/app/finalpdf/LN3Se5dOu9DA4dizniIGhvHEQgjtpPYG5iFHF8Rv.pdf",
  },
  {
    text: "Nedspice, Pepper Crop Report, VIPO 2025",
    url: "https://www.nedspice.com/app/uploads/2025/03/VIPO-2025-vFinal-EN-v2.pdf",
  },
];

function ConceiveSection() {
  return (
    <section className="space-y-4">
      <PhaseHeader
        n="01"
        phase="Conceive"
        title="Why this project exists"
        tagline="Every design choice downstream starts from one problem: heat is cutting into the pepper harvest, and nobody can watch the crop around the clock."
      />
      <div className="bg-surface-card border border-surface-border rounded-xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <ThermometerSun size={22} className="text-orange-400 shrink-0 mt-0.5" />
          <div className="space-y-3 text-base text-slate-400 leading-relaxed">
            <p>
              In May 2024, a six-month drought and a heat spike near 43°C scorched Kampot&rsquo;s
              pepper farms. One grower lost all 264 of his pepper bushes to water shortage and heat;
              the Kampot Pepper Promotion Association expected that year&rsquo;s harvest to come in
              roughly halved, with possible export shortages the following year. It wasn&rsquo;t an
              isolated event — a 2023 household survey across Kampot, Kep, and the neighboring
              coastal provinces found 92% of farming households had experienced drought, with
              roughly 60% of agricultural land affected.
            </p>
            <p>
              That&rsquo;s the sharp end of a national trend: Cambodia has warmed by an estimated
              0.18–0.29°C per decade since the 1960s&ndash;70s, already sees around 64 days a year
              above 35°C, and — per the government&rsquo;s own climate planning — is seeing its dry
              season lengthen and its monsoon arrive later. None of that is unique to pepper, but
              black pepper (<em>Piper nigrum</em>) is unusually exposed to it: the vine needs steady
              humidity above roughly 70–80%, well-distributed rainfall through most of the year, and
              daytime temperatures that stay in a fairly narrow 23–32°C band. Push it into sustained
              heat and drought and the flower spikes that would have become peppercorns dry up and
              shed before fruit ever sets — documented in neighboring pepper-growing regions of India
              during comparable heat events, and consistent with what happened at Kampot in 2024.
            </p>
            <p>
              None of this is a once-off. Global pepper production has fallen by roughly a third
              since its 2018/19 peak, and while the causes are mixed — competition from more
              profitable crops, slower replanting, disease — heat and drought are explicitly named as
              a drag on yield in at least one major producing region. For a farm run by two or three
              people, with no way to watch every row for heat stress every day, the only real answer
              is a system that senses it and responds automatically, before the season is lost.
            </p>
          </div>
        </div>
        <p className="border-t border-surface-border pt-3 text-xs text-slate-600 leading-relaxed">
          {SOURCES.map((s, i) => (
            <span key={s.text}>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                className="hover:text-brand-green hover:underline underline-offset-2 transition-colors"
              >
                {s.text}
              </a>
              {i < SOURCES.length - 1 && <span className="mx-2">·</span>}
            </span>
          ))}
        </p>
        <div className="border-t border-surface-border pt-3.5 flex items-start gap-2.5">
          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
          <p className="text-sm text-slate-500 leading-relaxed">
            The figures above are general agronomic and national climate findings, sourced as noted
            — not this farm&rsquo;s own yield data. This section will get sharper once specific
            observations from this farm are added.
          </p>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Design — CDIO design philosophy + CAD gallery
// ─────────────────────────────────────────────────────────────────────────

const CAD_IMAGES = [
  {
    src: "/Overview_CAD.png",
    title: "Complete Farm Layout",
    caption: "A wide view showing how the whole farm, watering system, and main power station connect together.",
  },
  {
    src: "/System_Overview_CAD.png",
    title: "Close Up View of The System",
    caption: "A close look at solar tracker, cooling and spraying system and how the pipe are installed in the farm.",
  },
  {
    src: "/ClosesUpViewwithSolar_CAD.png",
    title: "Solar Power Connection",
    caption: "This view shows how the solar panels sit next to and safely plug into the main power equipment box.",
  },  
  {
    src: "/CloseUp_Solar_CAD.png",
    title: "Solar Tracker Setup",
    caption: "Ground-mounted solar panels that track the sun to power the entire cooling, watering and control system without needing grid power.",
  },
  {
    src: "/CloseUpView.png",
    title: "Cooling and Spraying System Architecture",
    caption: "The central water station featuring built-in filters, a storage tank, and automatic valves to control water flow.",
  },
  {
    src: "/CloseUp_Operator_CAD.png",
    title: "Main Control Box and Screen",
    caption: "A clear view of the weatherproof box housing the system computers and the simple control screen for the user.",
  },
    {
    src: "/CloseUp_SensorBox_CAD.png",
    title: "Weather and Soil Sensor Station",
    caption: "A small, outdoor-rated sensor box placed directly in the field to check the daily weather and soil moisture.",
  },
  {
    src: "/CloseUp_Sprikler_CAD.jpg",
    title: "Automatic Overhead Misting Nozzle",
    caption: "A close-up view of the overhead spray line showing the drop-down pipe and fine mist nozzle that waters the crops gently.",
  },

];

function CadGallery() {
  const [active, setActive] = useState<number | null>(null);

  const close = useCallback(() => setActive(null), []);
  const step  = useCallback((d: number) => {
    setActive((cur) => (cur === null ? null : (cur + d + CAD_IMAGES.length) % CAD_IMAGES.length));
  }, []);

  useEffect(() => {
    if (active === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, close, step]);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {CAD_IMAGES.map((img, i) => (
          <button
            key={img.src}
            onClick={() => setActive(i)}
            className="group text-left bg-surface-card border border-surface-border rounded-xl overflow-hidden hover:border-brand-green/40 transition-colors"
          >
            <div className="aspect-[4/3] relative bg-slate-900 overflow-hidden">
              <Image
                src={img.src}
                alt={img.title}
                fill
                sizes="(max-width: 768px) 50vw, 25vw"
                className="object-cover group-hover:scale-105 transition-transform duration-300"
              />
            </div>
            <div className="p-2.5">
              <p className="text-sm font-semibold text-slate-200 leading-snug">{img.title}</p>
            </div>
          </button>
        ))}
      </div>

      {active !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={close}
        >
          <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
              <Image
                src={CAD_IMAGES[active].src}
                alt={CAD_IMAGES[active].title}
                fill
                sizes="90vw"
                className="object-contain"
                priority
              />
            </div>
            <div className="flex items-start justify-between mt-3 gap-4">
              <div>
                <p className="text-base font-semibold text-white">{CAD_IMAGES[active].title}</p>
                <p className="text-sm text-slate-400 mt-1">{CAD_IMAGES[active].caption}</p>
              </div>
              <button onClick={close} className="shrink-0 text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
                <X size={18} />
              </button>
            </div>
            <div className="flex items-center justify-center gap-3 mt-4">
              <button onClick={() => step(-1)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10">
                <ChevronLeft size={18} />
              </button>
              <span className="text-xs text-slate-500 tabular-nums">{active + 1} / {CAD_IMAGES.length}</span>
              <button onClick={() => step(1)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DesignSection() {
  return (
    <section className="space-y-4">
      <PhaseHeader
        n="02"
        phase="Design"
        title="Engineering the solution"
        tagline="A dual-loop cooling system — chilled misting plus air circulation — sized and modeled in CAD before a single pipe was cut, and built to run off-grid on solar."
      />
      <div className="bg-surface-card border border-surface-border rounded-xl p-5">
        <p className="text-base text-slate-400 leading-relaxed">
          The design goal was to cool the crop without depending on grid power or constant manual
          attention: a chilled-water misting loop for direct evaporative cooling of the plants, a
          separate air-circulation loop for the farm itself, both driven by one temperature/humidity
          reading and both powered by an on-site solar + battery system so the farm isn&rsquo;t
          waiting on grid reliability during the exact heat events it&rsquo;s meant to respond to.
          The eight renders below are the CAD model this build was drawn from.
        </p>
      </div>
      <CadGallery />
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Implement — the built system
// ─────────────────────────────────────────────────────────────────────────

const LOOPS = [
  {
    icon: Thermometer,
    color: "text-orange-400",
    title: "Cooling loop",
    body: "The temperature sensor (TT-101) reports ambient conditions to the controller. When the reading rises above the high setpoint, the controller energizes Relay 1, running the cooling fan unit until the temperature drops back below the low setpoint.",
  },
  {
    icon: Droplets,
    color: "text-sky-400",
    title: "Spray loop",
    body: "The same sensor feeds a second, independent loop: when farm temperature exceeds its own high setpoint, Relay 3 starts the spray pump, drawing chilled water through the manifold to cool the plants by evaporation, stopping once the low setpoint is reached.",
  },
  {
    icon: Database,
    color: "text-emerald-400",
    title: "Water supply",
    body: "The spray pump draws from a chilled-water reservoir, cooled and buffered upstream, through a single supply line — the cooling fan is a separate, standalone air mover with no plumbing tie-in. The two loops share a sensor and a controller, not a pipe.",
  },
  {
    icon: Radio,
    color: "text-violet-400",
    title: "From sensor to screen",
    body: "The on-site controller publishes readings over MQTT to Node-RED, which writes them into InfluxDB. The FastAPI backend reads that data, runs the alert logic, and serves it to this dashboard over a Cloudflare Tunnel — the same path a setpoint change travels in reverse.",
  },
];

function VideoCard({ src, title }: { src: string; title: string }) {
  const [failure, setFailure] = useState<"missing" | "unsupported" | null>(null);

  const handleError: React.ReactEventHandler<HTMLVideoElement> = (e) => {
    const code = e.currentTarget.error?.code;
    // 4 = MEDIA_ERR_SRC_NOT_SUPPORTED (bad/undecodable file), the rest are network/abort → treat as missing
    setFailure(code === 4 ? "unsupported" : "missing");
  };

  return (
    <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
      <div className="aspect-video bg-black relative">
        {!failure ? (
          <video
            src={src}
            controls
            preload="metadata"
            className="absolute inset-0 w-full h-full"
            onError={handleError}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900 px-4 text-center">
            <Video size={28} className="text-slate-600" />
            <p className="text-slate-500 text-sm">
              {failure === "unsupported" ? "This browser can't play this file" : "Video not uploaded yet"}
            </p>
            <code className="text-slate-600 text-xs bg-slate-800 px-2.5 py-1 rounded">
              frontend/public{src}
            </code>
          </div>
        )}
      </div>
      <p className="px-4 py-3 text-base text-slate-300">{title}</p>
    </div>
  );
}

const VIDEOS = [
  { src: "/InsideFarm.MOV", title: "Inside the farm" },
  { src: "/OutsideFarm.mp4", title: "Around the farm" },
  { src: "/InsideFarm_Zoom Out View.MOV", title: "Inside the farm — zoomed out" },
  { src: "/OutsideFarm_Zoom Out View.MOV", title: "Around the farm — zoomed out" },
];

const PID_SRC = "/P&ID System Diagram.png";
const PID_ALT = "Piping & Instrumentation Diagram — water source tank, solar chiller, buffer tanks, and field sprinklers";

function PidDiagram() {
  const [error, setError]   = useState(false);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoomed(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  if (error) {
    return (
      <div className="bg-surface-card border border-surface-border rounded-xl p-10 flex flex-col items-center justify-center gap-2 text-center">
        <ImageOff size={28} className="text-slate-600" />
        <p className="text-slate-500 text-sm">P&amp;ID diagram not uploaded yet</p>
        <code className="text-slate-600 text-xs bg-slate-800 px-2.5 py-1 rounded">
          frontend/public{PID_SRC}
        </code>
      </div>
    );
  }

  return (
    <>
      <div className="w-full">
        <button
          onClick={() => setZoomed(true)}
          className="w-full bg-white rounded-xl overflow-hidden border border-surface-border block hover:border-brand-green/40 transition-colors"
        >
          <div className="relative w-full h-[68vh] max-h-[680px] min-h-[360px]">
            <Image
              src={PID_SRC}
              alt={PID_ALT}
              fill
              sizes="90vw"
              className="object-contain"
              onError={() => setError(true)}
            />
          </div>
        </button>
        <p className="text-center text-sm text-slate-500 mt-2">Click to view full size</p>
      </div>

      {zoomed && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-6"
          onClick={() => setZoomed(false)}
        >
          <div
            className="relative w-full max-w-6xl flex-1 min-h-0 bg-white rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <Image src={PID_SRC} alt={PID_ALT} fill sizes="95vw" className="object-contain" priority />
          </div>
          <button
            onClick={() => setZoomed(false)}
            className="shrink-0 flex items-center gap-1.5 text-sm text-slate-300 hover:text-white"
          >
            <X size={16} /> Close
          </button>
        </div>
      )}
    </>
  );
}

function ImplementSection() {
  return (
    <section className="space-y-4">
      <PhaseHeader
        n="03"
        phase="Implement"
        title="Building it"
        tagline="From CAD to a working prototype on the farm — the same loops shown in the design, now running on real hardware."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {LOOPS.map(({ icon: Icon, color, title, body }) => (
          <div key={title} className="bg-surface-card border border-surface-border rounded-xl p-4">
            <Icon size={20} className={clsx(color, "mb-2")} />
            <p className="text-base font-semibold text-slate-200">{title}</p>
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface-card border border-surface-border rounded-xl p-4">
        <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
          The System, in Three Parts
        </p>
        <SystemFlowDiagram />
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Process &amp; Instrumentation Diagram
        </p>
        <PidDiagram />
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Farm Footage
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {VIDEOS.map((v) => <VideoCard key={v.src} {...v} />)}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Operate — this dashboard
// ─────────────────────────────────────────────────────────────────────────

const DATA_PATH = [
  { label: "ESP32",           sub: "MQTT publish",       loc: "Field",    icon: Cpu      },
  { label: "Node-RED",        sub: "flow routing",       loc: "On-site",  icon: Workflow },
  { label: "InfluxDB",        sub: "time-series store",  loc: "Cloud",    icon: Database },
  { label: "FastAPI Backend", sub: "alerts · setpoints", loc: "On-site",  icon: Server   },
  { label: "Cloudflare",      sub: "public tunnel",      loc: "Edge",     icon: Cloud    },
  { label: "FarmOS",          sub: "this dashboard",     loc: "Cloud",    icon: Leaf     },
];

function DataFlowStrip() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {DATA_PATH.map(({ label, sub, loc, icon: Icon }, i) => (
        <div key={label} className="flex items-center gap-3">
          <div className="bg-surface-card border border-surface-border rounded-xl px-5 py-4 flex flex-col items-center text-center min-w-[160px]">
            <Icon size={22} className="text-brand-green/80 mb-2" />
            <p className="text-base font-semibold text-slate-200">{label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mt-2">{loc}</span>
          </div>
          {i < DATA_PATH.length - 1 && <ArrowRight size={16} className="text-slate-600 shrink-0" />}
        </div>
      ))}
    </div>
  );
}

function OperateSection() {
  return (
    <section className="space-y-4">
      <PhaseHeader
        n="04"
        phase="Operate"
        title="Running it, every day"
        tagline="This dashboard is the Operate phase in action — live telemetry, threshold-based alerts, and remote setpoint control, running continuously without someone standing in the field."
      />
      <div className="bg-surface-card border border-surface-border rounded-xl p-4">
        <DataFlowStrip />
      </div>
      <div className="bg-surface-card border border-brand-green/30 rounded-xl p-5">
        <p className="text-base text-slate-300 leading-relaxed">
          What started as a response to one problem — heat stress with no one watching — is now a
          running prototype with real telemetry, real alerting, and a real farm depending on it. The
          next phase is the same CDIO loop again: operating data feeding back into design, on a wider
          rollout across more rows and, eventually, more farms.
        </p>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// What's Next — the next turn of the CDIO loop. Organized as a maturity
// path (Sense → Automate → Predict) rather than a flat sensor list: adding
// more inputs only pays off if they close a control loop or feed a
// prediction, not just another dashboard tile.
// ─────────────────────────────────────────────────────────────────────────

const FUTURE_SENSE = [
  {
    slug: "water",
    icon: Droplets,
    color: "text-sky-400",
    hover: "hover:bg-sky-500/10 hover:border-sky-500/40",
    title: "Water",
    body: "A flow meter on the supply line — usage per spray cycle, and an anomaly signature that can catch a leak long before anyone notices standing water.",
  },
  {
    slug: "energy",
    icon: Zap,
    color: "text-amber-400",
    hover: "hover:bg-amber-500/10 hover:border-amber-500/40",
    title: "Energy",
    body: "Solar generation, battery state of charge, and battery health over time — the off-grid system the pumps already depend on, finally visible instead of assumed.",
  },
  {
    slug: "soil",
    icon: Sprout,
    color: "text-emerald-400",
    hover: "hover:bg-emerald-500/10 hover:border-emerald-500/40",
    title: "Soil",
    body: "Soil temperature, moisture, and N-P-K at the root zone — irrigation and feeding decisions grounded in what the roots actually experience, not just canopy air readings.",
  },
  {
    slug: "fertilizer",
    icon: FlaskConical,
    color: "text-violet-400",
    hover: "hover:bg-violet-500/10 hover:border-violet-500/40",
    title: "Fertilizer input",
    body: "Every N-P-K application logged against the soil readings before and after it — the first real record of whether a feeding schedule is under-, over-, or right-dosing the crop.",
  },
  {
    slug: "plant-visual",
    icon: Camera,
    color: "text-rose-400",
    hover: "hover:bg-rose-500/10 hover:border-rose-500/40",
    title: "Plant Visual",
    body: "Live imaging of stem, leaf, and berry clusters — aimed first at Phytophthora foot rot and pollu beetle damage, the two production risks that do more damage to black pepper worldwide than heat alone.",
  },
  {
    slug: "ambient",
    icon: Gauge,
    color: "text-orange-400",
    hover: "hover:bg-orange-500/10 hover:border-orange-500/40",
    title: "Ambient",
    body: "Today's temperature and humidity, expanding to CO2 and light intensity — the same sensor category the cooling and spray loops already run on, just measuring more of what the plant feels.",
  },
];

const FUTURE_AUTOMATE = [
  "Fertigate automatically off soil N-P-K thresholds, the same way the spray pump already runs off a temperature threshold.",
  "Pull the weather forecast already on this dashboard into the control loop — pre-cool ahead of a forecast heat spike instead of reacting after the sensor confirms it.",
  "Flag a likely leak from a water-flow anomaly, the same way the alert checker already flags a spray cycle that runs long without a matching temperature drop.",
];

const FUTURE_PREDICT = [
  "Combine ambient, soil, and imaging signals into an early disease-risk score — the humidity, temperature, and soil-moisture pattern that precedes a Phytophthora outbreak shows up before the leaves do.",
  "Correlate yield — counted from berry-cluster imaging — against every logged intervention, finally answering whether a given spray or feeding schedule actually moved the number that matters.",
  "Run the imaging model on-site instead of shipping every frame to the cloud — keeps it working on a slow rural connection, and keeps the power budget sane now that a camera shares the same solar system as the pumps.",
];

function FutureWorkSection() {
  return (
    <section className="space-y-4 pb-8">
      <div className="flex items-start gap-4">
        <div className="shrink-0 w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
          <Rocket size={20} className="text-sky-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-sky-400 uppercase tracking-widest">What&rsquo;s Next</p>
          <h2 className="text-xl font-semibold text-slate-100 mt-0.5">Closing the loop — the next iteration</h2>
          <p className="text-base text-slate-500 mt-1">
            Operate feeds back into Conceive. This is what the next pass adds — more of the farm
            sensed, more of it acted on automatically, and a first step toward predicting problems
            instead of reacting to them.
          </p>
          <Link
            href="/roadmap"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-400 hover:text-sky-300 mt-3 transition-colors"
          >
            See a working preview of these dashboards <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
          More to sense <span className="normal-case font-normal text-slate-600">— click a card to see its preview dashboard</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FUTURE_SENSE.map(({ slug, icon: Icon, color, hover, title, body }) => (
            <Link
              key={slug}
              href={`/roadmap#${slug}`}
              className={clsx(
                "group bg-surface-card border border-surface-border rounded-xl p-4 transition-all duration-200",
                hover,
              )}
            >
              <div className="flex items-start justify-between">
                <Icon size={20} className={clsx(color, "mb-2 transition-transform duration-200 group-hover:scale-110")} />
                <ArrowRight size={14} className={clsx("text-slate-600 transition-all duration-200 group-hover:translate-x-0.5", color, "group-hover:opacity-100 opacity-0")} />
              </div>
              <p className="text-base font-semibold text-slate-200">{title}</p>
              <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{body}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-surface-card border border-surface-border rounded-xl p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            <Workflow size={15} className="shrink-0" /> From sensing to acting
          </p>
          <ul className="space-y-2.5">
            {FUTURE_AUTOMATE.map((t) => (
              <li key={t} className="text-sm text-slate-400 leading-relaxed pl-3 border-l-2 border-brand-green/30">
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            <Sparkles size={15} className="shrink-0" /> From acting to predicting
          </p>
          <ul className="space-y-2.5">
            {FUTURE_PREDICT.map((t) => (
              <li key={t} className="text-sm text-slate-400 leading-relaxed pl-3 border-l-2 border-brand-green/30">
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex items-center gap-2 px-5 py-3.5 bg-surface-card border-b border-surface-border shrink-0">
        <Info size={16} className="text-slate-400" />
        <h1 className="text-sm font-semibold text-slate-200">System Overview</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-5 space-y-10">

        <section className="flex items-center gap-3 text-sm text-slate-500">
          <Compass size={16} className="text-brand-green shrink-0" />
          <p>
            FarmOS was built the way it&rsquo;s presented here — following <strong className="text-slate-300">CDIO</strong>
            {" "}(Conceive, Design, Implement, Operate), the engineering framework this project follows from problem
            to running prototype.
          </p>
        </section>

        <ConceiveSection />
        <DesignSection />
        <ImplementSection />
        <OperateSection />
        <FutureWorkSection />

      </main>
    </div>
  );
}
