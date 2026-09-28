/**
 * COCOON design tokens — colors ("MIL-SPEC Thermal Platform", light).
 *
 * White is the dominant surface; light technical backgrounds sit around it
 * (stitch-exports/alpine_mission_thermal/DESIGN.md, adapted for mobile).
 * Every hue has one meaning:
 *   navy   — primary actions, active navigation, cold/exterior boundaries
 *   teal   — heat flow, atmosphere, coordinates
 *   amber  — thermal load, solar gain, running/demo states, warnings
 *   green  — converged/valid/comfort
 *   red    — critical errors and failures only
 * Status is never conveyed by color alone: badges always carry text.
 * Text/background pairs meet WCAG AA for their sizes.
 */

export const palette = {
  white: "#FFFFFF",
  paper: "#F8F9FF",
  surfaceTint: "#EFF4FF",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  navyDeep: "#00236F",
  navy: "#1E3A8A",
  teal: "#006878",
  tealEngineering: "#0F7A8C",
  amber: "#D97706",
  green: "#059669",
  red: "#BA1A1A",
  ink: "#0F172A",
  body: "#334155",
  muted: "#64748B",
  plum: "#6B4C9A",
} as const;

export interface ColorTokens {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textBody: string;
  textSecondary: string;
  textInverse: string;
  primary: string;
  primaryText: string;
  accent: string;
  teal: string;
  amber: string;
  statusReady: string;
  statusReadyBg: string;
  statusDemo: string;
  statusDemoBg: string;
  statusWarning: string;
  statusWarningBg: string;
  statusUnavailable: string;
  statusUnavailableBg: string;
  statusInfo: string;
  statusInfoBg: string;
  danger: string;
  dangerBg: string;
  /** Categorical series colors, in order. Outdoor/ambient uses `chartAmbient`. */
  chart: string[];
  chartAmbient: string;
  chartGrid: string;
  /** Semantic chart colors (DESIGN.md): temperature, solar, heat flow, comfort band. */
  chartTemperature: string;
  chartSolar: string;
  chartSolarHighlight: string;
  chartHeatFlow: string;
  chartComfortBand: string;
}

export const lightColors: ColorTokens = {
  background: palette.paper,
  surface: palette.white,
  surfaceAlt: palette.surfaceTint,
  border: palette.border,
  borderStrong: palette.borderStrong,
  textPrimary: palette.ink,
  textBody: palette.body,
  textSecondary: palette.muted,
  textInverse: palette.white,
  primary: palette.navyDeep,
  primaryText: palette.white,
  accent: palette.navy,
  teal: palette.tealEngineering,
  amber: palette.amber,
  statusReady: "#047857",
  statusReadyBg: "#ECFDF5",
  // Amber text is darkened for small-text contrast on its tint.
  statusDemo: "#92400E",
  statusDemoBg: "#FFFBEB",
  statusWarning: "#92400E",
  statusWarningBg: "#FFFBEB",
  statusUnavailable: "#475569",
  statusUnavailableBg: "#F1F5F9",
  statusInfo: palette.navy,
  statusInfoBg: palette.surfaceTint,
  danger: palette.red,
  dangerBg: "#FEF2F2",
  chart: [palette.navy, palette.tealEngineering, palette.amber, palette.green, palette.plum, palette.red],
  chartAmbient: palette.muted,
  chartGrid: palette.border,
  chartTemperature: palette.green,
  chartSolar: palette.navy,
  chartSolarHighlight: palette.amber,
  chartHeatFlow: palette.tealEngineering,
  chartComfortBand: "#D1FAE5",
};
