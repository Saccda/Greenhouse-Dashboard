import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Driven by CSS variables in globals.css, NOT hex. <alpha-value> is what
        // lets bg-surface-card/85 and friends work: Tailwind substitutes the
        // opacity into the rgb() itself, so every variant a class can take
        // resolves per theme automatically. Baking hex in here is what forced
        // the hand-written `.light .bg-surface-*` overrides, which could only
        // ever cover the variants somebody remembered to write.
        surface: {
          DEFAULT: "rgb(var(--surface-base) / <alpha-value>)",
          base:    "rgb(var(--surface-base) / <alpha-value>)",
          card:    "rgb(var(--surface-card) / <alpha-value>)",
          hover:   "rgb(var(--surface-hover) / <alpha-value>)",
          border:  "rgb(var(--surface-border) / <alpha-value>)",
          bright:  "rgb(var(--surface-bright) / <alpha-value>)",
        },
        brand: {
          green: "#22c55e",
          teal:  "#0d9488",
          cyan:  "#06b6d4",
          lime:  "#84cc16",
        },
        status: {
          active:  "#4ade80",
          warning: "#f59e0b",
          danger:  "#f87171",
          offline: "#6b7280",
          info:    "#60a5fa",
        },
      },
      // The text scale, driven by the same variables globals.css defines.
      //
      // textColor, NOT colors.slate: that would drag bg-slate-* and
      // border-slate-* along with it, and those legitimately use the real
      // Tailwind palette — bg-slate-100 is a pale chip, while --t100 is
      // near-black in light mode.
      //
      // Same reason the surfaces moved: a `.light .text-slate-100` override
      // matches the bare class and nothing else, so hover:text-slate-100 and
      // its 38 siblings fell through to raw Tailwind slate. That put white
      // text on the sidebar's pale hover fill.
      //
      // Steps 50 and 700-950 are left as Tailwind ships them; nothing uses
      // them as themed text.
      textColor: {
        slate: {
          100: "rgb(var(--t100) / <alpha-value>)",
          200: "rgb(var(--t200) / <alpha-value>)",
          300: "rgb(var(--t300) / <alpha-value>)",
          400: "rgb(var(--t400) / <alpha-value>)",
          500: "rgb(var(--t500) / <alpha-value>)",
          600: "rgb(var(--t600) / <alpha-value>)",
        },
      },

      // Borders take their own scale. In dark mode an edge matches its fill, but
      // on a near-white card it has to stay darker than the surface to be seen
      // at all — border-surface-card is #e0eee2 against a #ffffff fill.
      borderColor: {
        surface: {
          DEFAULT: "rgb(var(--edge-base) / <alpha-value>)",
          base:    "rgb(var(--edge-base) / <alpha-value>)",
          card:    "rgb(var(--edge-card) / <alpha-value>)",
          hover:   "rgb(var(--edge-hover) / <alpha-value>)",
          border:  "rgb(var(--edge-border) / <alpha-value>)",
          bright:  "rgb(var(--edge-bright) / <alpha-value>)",
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "ui-monospace", "monospace"],
      },
      animation: {
        "led-pulse": "led-pulse 1.8s ease-in-out infinite",
        "led-blink": "led-blink 0.8s step-end infinite",
        "fade-in":   "fade-in 0.3s ease-out",
        "slide-in":  "slide-in 0.25s ease-out",
      },
      keyframes: {
        "led-pulse": {
          "0%, 100%": { opacity: "1",   boxShadow: "0 0 6px 2px currentColor"  },
          "50%":      { opacity: "0.5", boxShadow: "0 0 18px 5px currentColor" },
        },
        "led-blink": {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to:   { opacity: "1", transform: "translateY(0)"   },
        },
        "slide-in": {
          from: { transform: "translateX(-12px)", opacity: "0" },
          to:   { transform: "translateX(0)",     opacity: "1" },
        },
      },
      boxShadow: {
        "card-glow-green": "0 0 0 1px rgba(34,197,94,0.15), 0 4px 24px rgba(34,197,94,0.06)",
        "card-glow-cyan":  "0 0 0 1px rgba(6,182,212,0.15),  0 4px 24px rgba(6,182,212,0.06)",
        "card-glow-amber": "0 0 0 1px rgba(245,158,11,0.15), 0 4px 24px rgba(245,158,11,0.06)",
        "card-glow-red":   "0 0 0 1px rgba(248,113,113,0.15),0 4px 24px rgba(248,113,113,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
