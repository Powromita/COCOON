export type WeatherProfile = {
  id: string;
  region: string;
  climate: string;
  designTemperature: number;
  altitude: number;
  seasonalNote: string;
};

export type MaterialOption = {
  id: string;
  category: "wall" | "roof";
  name: string;
  description: string;
  rValue: number;
};

export type ProjectSummary = {
  id: string;
  name: string;
  region: string;
  status: "draft" | "ready" | "simulated";
  updatedAt: string;
};
