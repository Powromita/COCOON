import type { WeatherProfile } from "@/types/catalog";

export const weatherProfiles: WeatherProfile[] = [
  {
    id: "leh-winter",
    region: "Leh, India",
    climate: "Cold desert",
    designTemperature: -18,
    altitude: 3500,
    seasonalNote: "Dry winter with strong diurnal temperature swings.",
  },
  {
    id: "ladakh-field-lab",
    region: "Ladakh Field Lab",
    climate: "High alpine",
    designTemperature: -22,
    altitude: 4100,
    seasonalNote: "High-altitude winter profile for field research shelters.",
  },
  {
    id: "siachen-basin",
    region: "Siachen Basin",
    climate: "Polar fringe",
    designTemperature: -30,
    altitude: 5400,
    seasonalNote: "Extreme cold profile with limited solar recovery.",
  },
];
