import type { Config } from "tailwindcss";

/**
 * BIOCore Tailwind Config — Clinical Architect Design System
 * Material Design 3 token set + shadcn-compatible HSL vars
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        mono: ["JetBrains Mono", "Cascadia Code", "Fira Code", "Consolas", "monospace"],
        headline: ["Inter", "sans-serif"],
        body: ["Inter", "sans-serif"],
        label: ["Inter", "sans-serif"],
      },
      colors: {
        // ─── Shadcn-compatible tokens (HSL CSS vars) ───
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // ─── Material Design 3 Clinical Architect tokens ───
        "outline-variant": "#bdc9c6",
        "outline-token": "#6e7977",
        "primary-container": "#0f766e",
        "on-primary-container": "#a3faef",
        "primary-fixed": "#9cf2e8",
        "primary-fixed-dim": "#80d5cb",
        "on-primary-fixed": "#00201d",
        "on-primary-fixed-variant": "#00504a",
        "inverse-primary": "#80d5cb",
        "surface-bright": "#f7faf8",
        "surface-dim": "#d7dbd9",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f1f4f3",
        "surface-container": "#ebefed",
        "surface-container-high": "#e5e9e7",
        "surface-container-highest": "#e0e3e1",
        "surface-variant": "#e0e3e1",
        "surface-tint": "#006a63",
        "on-surface": "#181c1c",
        "on-surface-variant": "#3e4947",
        "inverse-surface": "#2d3130",
        "inverse-on-surface": "#eef1f0",
        "on-background": "#181c1c",
        "on-secondary": "#ffffff",
        "secondary-token": "#3755c3",
        "secondary-container": "#708cfd",
        "on-secondary-container": "#00217a",
        "secondary-fixed": "#dde1ff",
        "secondary-fixed-dim": "#b8c4ff",
        "on-secondary-fixed": "#001453",
        "on-secondary-fixed-variant": "#173bab",
        "tertiary": "#863b00",
        "tertiary-container": "#ac4d01",
        "tertiary-fixed": "#ffdbca",
        "tertiary-fixed-dim": "#ffb68e",
        "on-tertiary": "#ffffff",
        "on-tertiary-container": "#ffe4d7",
        "on-tertiary-fixed": "#331200",
        "on-tertiary-fixed-variant": "#763300",
        "error-token": "#ba1a1a",
        "error-container": "#ffdad6",
        "on-error": "#ffffff",
        "on-error-container": "#93000a",

        // ─── MES semantic colors (status) ───
        mes: {
          green: "#10B981",
          yellow: "#B45309",
          red: "#BA1A1A",
          blue: "#1E40AF",
          purple: "#722ed1",
          gray: "#6b7280",
          teal: "#0F766E",
        },
      },
      borderRadius: {
        none: "0",
        sm: "0.125rem",   // 2px
        DEFAULT: "0.25rem", // 4px (Industrial sharp)
        md: "0.375rem",   // 6px
        lg: "0.5rem",     // 8px — Clinical default
        xl: "0.75rem",    // 12px — Metric card signature
        "2xl": "1rem",    // 16px
        full: "9999px",
      },
      boxShadow: {
        clinical: "0 4px 20px rgba(19, 27, 46, 0.04), 0 2px 8px rgba(19, 27, 46, 0.06)",
        modal: "0 20px 40px rgba(19, 27, 46, 0.08), 0 8px 16px rgba(19, 27, 46, 0.04)",
        inset: "inset 0 1px 2px rgba(19, 27, 46, 0.05)",
      },
      letterSpacing: {
        "tight-extra": "-0.02em",
        "wide-spec": "0.08em",
      },
      animation: {
        "led-pulse": "led-pulse 1.5s ease-in-out infinite",
      },
      backdropBlur: {
        glass: "20px",
      },
    },
  },
  plugins: [],
};

export default config;
