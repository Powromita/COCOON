/**
 * COCOON design tokens — typography.
 *
 * Inter for interface text; JetBrains Mono for every engineering value
 * (IDs, coordinates, temperatures, units, timestamps, solver data). Compact
 * technical scale — screen titles never exceed 26px.
 *
 * Family names are the ones registered by app/_layout.tsx's useFonts(); if
 * a font has not loaded yet the platform default is used.
 */
export const fontFamilies = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  mono: "JetBrainsMono_400Regular",
  monoMedium: "JetBrainsMono_500Medium",
} as const;

export const typography = {
  display: { fontFamily: fontFamilies.semibold, fontSize: 26, lineHeight: 32, fontWeight: "600" as const, letterSpacing: -0.3 },
  title: { fontFamily: fontFamilies.semibold, fontSize: 20, lineHeight: 26, fontWeight: "600" as const, letterSpacing: -0.2 },
  subtitle: { fontFamily: fontFamilies.semibold, fontSize: 17, lineHeight: 22, fontWeight: "600" as const },
  body: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 21, fontWeight: "400" as const },
  bodyStrong: { fontFamily: fontFamilies.semibold, fontSize: 15, lineHeight: 21, fontWeight: "600" as const },
  caption: { fontFamily: fontFamilies.regular, fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
  label: { fontFamily: fontFamilies.semibold, fontSize: 12, lineHeight: 16, fontWeight: "600" as const, letterSpacing: 0.4 },
  /** Engineering values: IDs, units, temperatures, timestamps. */
  mono: { fontFamily: fontFamilies.mono, fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
  monoStrong: { fontFamily: fontFamilies.monoMedium, fontSize: 15, lineHeight: 20, fontWeight: "500" as const },
  monoSmall: { fontFamily: fontFamilies.mono, fontSize: 11, lineHeight: 14, fontWeight: "400" as const, letterSpacing: 0.2 },
};
