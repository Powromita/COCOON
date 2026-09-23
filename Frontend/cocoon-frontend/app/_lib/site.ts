/**
 * site.ts — the analysis site.
 *
 * The pipeline's weather archive is a single NASA POWER export for Leh
 * (`leh_weather_merged.xlsx`, 2016–2026), so every run is at this location and
 * no latitude/longitude is carried in the API response yet.
 *
 * BACKEND: emit `results.location` ({ name, latitude, longitude, timezone }).
 * Once it does, `deriveLocation()` in simulation.ts prefers the response value
 * and this constant is only the fallback.
 */

import type { SimLocation } from "./types";

export const SITE_LEH: SimLocation & { weather_source: string } = {
  name: "Leh, Ladakh",
  latitude: 34.1526,
  longitude: 77.5771,
  timezone: "Asia/Kolkata",
  weather_source: "NASA POWER hourly archive (2016–2026)",
};
