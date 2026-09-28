/**
 * App-wide client/UI state (Zustand). Server data lives in React Query and
 * SQLite — this store only holds what the UI itself owns: connectivity, unit
 * preference and the candidate comparison tray.
 */
import { create } from "zustand";

import type { Language } from "../i18n";
import type { TemperatureUnit } from "../utils/format";

export const MAX_COMPARE = 3;

export interface AppState {
  /** null until NetInfo has reported once. */
  isOnline: boolean | null;
  jobMonitorError: string | null;
  temperatureUnit: TemperatureUnit;
  language: Language;
  /** Design ids selected for side-by-side comparison, per optimization. */
  compare: { optimizationId: string | null; designIds: string[] };

  setOnline: (online: boolean) => void;
  setJobMonitorError: (error: string | null) => void;
  setTemperatureUnit: (unit: TemperatureUnit) => void;
  setLanguage: (language: Language) => void;
  toggleCompare: (optimizationId: string, designId: string) => void;
  clearCompare: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  isOnline: null,
  jobMonitorError: null,
  temperatureUnit: "C",
  language: "en",
  compare: { optimizationId: null, designIds: [] },

  setOnline: (online) => set({ isOnline: online }),
  setJobMonitorError: (error) => set({ jobMonitorError: error }),
  setTemperatureUnit: (unit) => set({ temperatureUnit: unit }),
  setLanguage: (language) => set({ language }),
  toggleCompare: (optimizationId, designId) =>
    set((state) => {
      const current = state.compare.optimizationId === optimizationId ? state.compare.designIds : [];
      if (current.includes(designId)) {
        return { compare: { optimizationId, designIds: current.filter((d) => d !== designId) } };
      }
      if (current.length >= MAX_COMPARE) return state;
      return { compare: { optimizationId, designIds: [...current, designId] } };
    }),
  clearCompare: () => set({ compare: { optimizationId: null, designIds: [] } }),
}));
