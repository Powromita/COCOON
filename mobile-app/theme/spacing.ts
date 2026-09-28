/** COCOON design tokens — spacing & radii. 4pt base grid. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Buttons 8px, cards 10px, badges fully rounded — tight, engineering proportions. */
export const radii = {
  sm: 4,
  md: 8,
  lg: 10,
  pill: 999,
} as const;

/** Minimum Android-safe touch target, per Material guidance. */
export const minTouchTarget = 48;
