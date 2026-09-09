import type { DesignForm } from "@/types/design";

export const defaultDesignForm: DesignForm = {
  region: "Leh, India",
  terrain: "Valley basin",
  altitude: "3500",
  climatePattern: "Cold desert",
  season: "Winter peak",
  outdoorTemp: "-18",
  shape: "Rectangular shell",
  length: "6.0",
  width: "4.0",
  height: "2.8",
  glazing: "Balanced glazing",
  wall: "Adobe + insulation",
  roof: "Insulated panel",
  occupancy: "4",
  heater: "Medium",
};

export const designFieldHints = {
  location: "Choose the project footprint and elevation context.",
  climate: "Set the expected thermal conditions and seasonal extremes.",
  geometry: "Define the shelter footprint and height for the energy model.",
  materials: "Choose the thermal mass and insulation strategy.",
  review: "Validate the setup before moving to simulation.",
} as const;
