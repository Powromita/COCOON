export type DesignForm = {
  region: string;
  terrain: string;
  altitude: string;
  climatePattern: string;
  season: string;
  outdoorTemp: string;
  shape: string;
  length: string;
  width: string;
  height: string;
  glazing: string;
  wall: string;
  roof: string;
  occupancy: string;
  heater: string;
};

export type SimulationPoint = {
  hour: number;
  indoor: number;
  outdoor: number;
};

export type SimulationResult = {
  id: string;
  projectName: string;
  location: string;
  climate: string;
  geometry: string;
  materials: string;
  metrics: {
    indoorTemp: number;
    comfortScore: number;
    energyLoad: number;
    occupancy: number;
  };
  comfortBand: {
    min: number;
    max: number;
  };
  forecast: SimulationPoint[];
  recommendations: string[];
};
