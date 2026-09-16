import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        hud: {
          bg: "#020617",
          panel: "rgba(8, 20, 36, 0.72)",
          line: "rgba(34, 211, 238, 0.22)",
          cyan: "#22d3ee",
          cyanDim: "#0e7490",
          amber: "#fbbf24",
          red: "#f87171",
          green: "#34d399",
        },
      },
      fontFamily: {
        hud: ["var(--font-orbitron)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        hud: "0 0 0 1px rgba(34,211,238,0.25), 0 0 24px rgba(34,211,238,0.12), inset 0 0 32px rgba(34,211,238,0.06)",
        "hud-glow": "0 0 48px rgba(34,211,238,0.25)",
      },
      keyframes: {
        "scan-line": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        "pulse-ring": {
          "0%, 100%": { opacity: "0.4", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.04)" },
        },
        flicker: {
          "0%, 100%": { opacity: "1" },
          "92%": { opacity: "1" },
          "93%": { opacity: "0.6" },
          "94%": { opacity: "1" },
          "97%": { opacity: "0.8" },
        },
      },
      animation: {
        "scan-line": "scan-line 6s linear infinite",
        "pulse-ring": "pulse-ring 2.4s ease-in-out infinite",
        flicker: "flicker 8s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
