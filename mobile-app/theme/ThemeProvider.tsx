import React, { createContext, useContext } from "react";

import { lightColors, type ColorTokens } from "./colors";
import { radii, spacing } from "./spacing";
import { typography } from "./typography";

export interface Theme {
  /** COCOON mobile is a light, white-based UI by design; there is no dark theme. */
  scheme: "light";
  colors: ColorTokens;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
}

const THEME: Theme = { scheme: "light", colors: lightColors, spacing, radii, typography };

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <ThemeContext.Provider value={THEME}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme() must be used within a <ThemeProvider>.");
  }
  return ctx;
}
