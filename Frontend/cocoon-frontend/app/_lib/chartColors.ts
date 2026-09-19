/**
 * chartColors.ts — one palette for every series on the results pages so the
 * legend colour of a quantity is the same wherever it appears (spec §6).
 */
export const SERIES_COLORS = {
  physics: "#fe932c", // Physics Model indoor temperature — orange
  outdoor: "#1e3a8a", // NASA outdoor temperature — blue
  comfortBand: "#22c55e", // comfort band fill — light translucent green (use low opacity)
  ground: "#0f766e", // ground temperature — accessible teal, distinct from the above
  ansys: "#7c3aed", // ANSYS FEM indoor temperature — purple
  solar: "#d97706", // solar radiation (secondary axis) — amber
} as const;
