/**
 * Message protocol between the React Native app and the WebView 3D viewer
 * (viewer/viewer.js). Pure functions so they can be unit-tested.
 */
import type { VisualizationModel } from "@cocoon/contracts";

import { palette } from "../../theme/colors";

export type ViewerMode = "material" | "thermal";

/** Cold → neutral → warm scale used by viewer/viewer.js thermalColor(); the legend must match it. */
export const THERMAL_SCALE = [palette.navy, palette.paper, palette.amber] as const;

export interface ViewerState {
  floor: number | null;
  isolate: string | null;
  exploded: boolean;
  showRoof: boolean;
  mode: ViewerMode;
  timeIndex: number;
  /** Color range for thermal mode, from the model's own temperatures. */
  range: { min: number; max: number } | null;
}

export type ViewerInbound =
  | { type: "READY" }
  | { type: "MODEL_LOADED"; zoneCount: number; floors: number[] }
  | { type: "ROOM_SELECTED"; zoneId: string | null }
  | { type: "ERROR"; message: string };

/** Parses a WebView message; anything unexpected returns null rather than throwing. */
export function parseViewerMessage(raw: string): ViewerInbound | null {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof msg !== "object" || msg === null) return null;
  const m = msg as Record<string, unknown>;
  switch (m.type) {
    case "READY":
      return { type: "READY" };
    case "MODEL_LOADED":
      return {
        type: "MODEL_LOADED",
        zoneCount: typeof m.zoneCount === "number" ? m.zoneCount : 0,
        floors: Array.isArray(m.floors) ? m.floors.filter((f): f is number => typeof f === "number") : [],
      };
    case "ROOM_SELECTED":
      return { type: "ROOM_SELECTED", zoneId: typeof m.zoneId === "string" ? m.zoneId : null };
    case "ERROR":
      return { type: "ERROR", message: typeof m.message === "string" ? m.message : "Unknown viewer error" };
    default:
      return null;
  }
}

/** JS to inject into the WebView to deliver a message to window.cocoonViewer. */
export function toInjection(message: { type: "LOAD_MODEL"; model: VisualizationModel } | ({ type: "SET_STATE" } & ViewerState)): string {
  return `window.cocoonViewer && window.cocoonViewer.receive(${JSON.stringify(message)}); true;`;
}

/** Min/max over every temperature the model lists — the thermal legend's range. */
export function temperatureRange(model: VisualizationModel): { min: number; max: number } | null {
  const all = (model.temperature_series ?? []).flatMap((s) => s.temperatures_c).filter((t) => Number.isFinite(t));
  if (all.length === 0) return null;
  return { min: Math.min(...all), max: Math.max(...all) };
}

/** Timestamps of the playback timeline (the first series' — all series share one clock in M0 models). */
export function playbackTimestamps(model: VisualizationModel): string[] {
  return model.temperature_series?.[0]?.timestamps ?? [];
}

export function temperatureAt(model: VisualizationModel, zoneId: string, index: number): number | undefined {
  const s = model.temperature_series?.find((x) => x.zone_id === zoneId);
  const v = s?.temperatures_c[index];
  return typeof v === "number" ? v : undefined;
}
