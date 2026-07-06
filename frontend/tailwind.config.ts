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
        // Dark industrial palette — unchanged (light mode handled via CSS overrides)
        surface: {
          DEFAULT: "#001040",
          base:    "#001040",
          card:    "#002068",
          hover:   "#002d88",
          border:  "#0d3a8a",
          bright:  "#1a52b0",
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
