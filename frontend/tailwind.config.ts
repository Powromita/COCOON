import type { Config } from "tailwindcss";

// Tokens mirror the Stitch export (stitch-exports/alpine_mission_thermal/DESIGN.md).
// The radius scale is intentionally Stitch's compressed one so converted screens render 1:1.
const sans = ["var(--font-inter)", "Inter", "Noto Sans Devanagari", "system-ui", "sans-serif"];
const mono = ["var(--font-jetbrains-mono)", "JetBrains Mono", "ui-monospace", "monospace"];

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#f8f9ff",
        "surface-dim": "#ccdbf4",
        "surface-bright": "#f8f9ff",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#eff4ff",
        "surface-container": "#e6eeff",
        "surface-container-high": "#dde9ff",
        "surface-container-highest": "#d5e3fd",
        "surface-variant": "#d5e3fd",
        "surface-tint": "#4059aa",
        background: "#f8f9ff",
        "on-background": "#0d1c2f",
        "on-surface": "#0d1c2f",
        "on-surface-variant": "#444651",
        "inverse-surface": "#233144",
        "inverse-on-surface": "#ebf1ff",
        outline: "#757682",
        "outline-variant": "#c5c5d3",
        primary: "#00236f",
        "on-primary": "#ffffff",
        "primary-container": "#1e3a8a",
        "on-primary-container": "#90a8ff",
        "inverse-primary": "#b6c4ff",
        "primary-fixed": "#dce1ff",
        "primary-fixed-dim": "#b6c4ff",
        "on-primary-fixed": "#00164e",
        "on-primary-fixed-variant": "#264191",
        secondary: "#006878",
        "on-secondary": "#ffffff",
        "secondary-container": "#94eafe",
        "on-secondary-container": "#006b7b",
        "secondary-fixed": "#a7eeff",
        "secondary-fixed-dim": "#7dd3e7",
        "on-secondary-fixed": "#001f25",
        "on-secondary-fixed-variant": "#004e5b",
        tertiary: "#442100",
        "on-tertiary": "#ffffff",
        "tertiary-container": "#653400",
        "on-tertiary-container": "#fc922b",
        "tertiary-fixed": "#ffdcc3",
        "tertiary-fixed-dim": "#ffb77d",
        "on-tertiary-fixed": "#2f1500",
        "on-tertiary-fixed-variant": "#6e3900",
        error: "#ba1a1a",
        "on-error": "#ffffff",
        "error-container": "#ffdad6",
        "on-error-container": "#93000a",

        // DESIGN.md semantic spectrum — used by components/ui and new screens.
        navy: { DEFAULT: "#1E3A8A", hover: "#1E40AF", active: "#172554" },
        thermal: { DEFAULT: "#D97706", tint: "#FFFBEB" },
        equilibrium: { DEFAULT: "#059669", tint: "#ECFDF5" },
        teal: { DEFAULT: "#0F7A8C", tint: "#ECFBFC" },
        plum: { DEFAULT: "#6B4C9A", tint: "#F3EEFA" },
        critical: { DEFAULT: "#BA1A1A", tint: "#FEF2F2", hover: "#991B1B" },
        line: { DEFAULT: "#E2E8F0", sub: "#EDF2F7", strong: "#CBD5E1" },
        ink: { DEFAULT: "#0F172A", body: "#334155", muted: "#64748B", disabled: "#94A3B8" },
      },
      // Polish pass: softer scale (was Stitch's compressed 2/4/8/12px). `full` is a true pill again.
      borderRadius: {
        sm: "0.25rem", // 4px — checkboxes
        DEFAULT: "0.5rem", // 8px — inputs, buttons, bars
        md: "0.5rem", // 8px
        lg: "0.5rem", // 8px — buttons, segmented controls
        xl: "0.75rem", // 12px — cards, panels, stat/info boxes
        "2xl": "1rem", // 16px — feature cards
        full: "9999px", // pills, badges, dots, icon buttons
      },
      spacing: {
        gutter: "1rem",
        "gutter-sm": "0.75rem",
        "gutter-lg": "1.5rem",
        margin: "1.5rem",
        "margin-sm": "1rem",
        "margin-lg": "2rem",
        "space-xs": "0.25rem",
        "space-sm": "0.5rem",
        "space-md": "0.75rem",
        "space-lg": "1rem",
        "space-xl": "1.5rem",
      },
      fontFamily: {
        sans,
        mono,
        "display-lg": sans,
        "display-lg-mobile": sans,
        "headline-lg": sans,
        "headline-md": sans,
        "headline-sm": sans,
        "body-lg": sans,
        "body-md": sans,
        "body-sm": sans,
        // Label styles render in Inter; only numeric/engineering data opts back into mono via `font-data`.
        "label-mono-lg": sans,
        "label-mono-md": sans,
        "label-mono-sm": sans,
        "label-mono-xs": sans,
        data: mono,
      },
      fontSize: {
        "display-lg": ["30px", { lineHeight: "38px", letterSpacing: "-0.02em", fontWeight: "600" }],
        "display-lg-mobile": ["24px", { lineHeight: "32px", letterSpacing: "-0.015em", fontWeight: "600" }],
        "headline-lg": ["22px", { lineHeight: "28px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "headline-md": ["18px", { lineHeight: "24px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "headline-sm": ["15px", { lineHeight: "20px", letterSpacing: "-0.005em", fontWeight: "600" }],
        "body-lg": ["15px", { lineHeight: "22px", letterSpacing: "0em", fontWeight: "400" }],
        "body-md": ["13px", { lineHeight: "18px", letterSpacing: "0em", fontWeight: "400" }],
        "body-sm": ["12px", { lineHeight: "16px", letterSpacing: "0.005em", fontWeight: "400" }],
        "label-mono-lg": ["14px", { lineHeight: "18px", letterSpacing: "-0.01em", fontWeight: "500" }],
        "label-mono-md": ["12px", { lineHeight: "16px", letterSpacing: "-0.005em", fontWeight: "500" }],
        "label-mono-sm": ["11px", { lineHeight: "14px", letterSpacing: "0em", fontWeight: "500" }],
        "label-mono-xs": ["10px", { lineHeight: "12px", letterSpacing: "0.02em", fontWeight: "500" }],
      },
      boxShadow: {
        card: "0 1px 4px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.04)",
        "card-hover": "0 2px 6px rgba(0, 0, 0, 0.07), 0 8px 20px rgba(0, 0, 0, 0.06)",
        feature: "0 4px 16px rgba(30, 58, 138, 0.18)",
        flyout: "0 4px 12px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
