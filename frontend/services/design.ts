import type { DesignForm, SimulationResult } from "@/types/design";

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const buildSimulationResult = (form: DesignForm): SimulationResult => {
  const altitude = Number(form.altitude || 3500);
  const outdoorTemp = Number(form.outdoorTemp || -18);
  const length = Number(form.length || 6);
  const width = Number(form.width || 4);
  const height = Number(form.height || 2.8);
  const occupancy = Number(form.occupancy || 4);
  const heaterFactor = form.heater === "High" ? 1.4 : form.heater === "Low" ? 0.7 : form.heater === "Off" ? 0.2 : 1;

  const indoorTemp = clamp(20 + altitude / 9000 + heaterFactor * 2.1 + (Math.abs(outdoorTemp) / 30) * 0.5, 15, 27);
  const comfortScore = clamp(100 - Math.abs(indoorTemp - 20.5) * 8 - Math.abs(outdoorTemp + 18) * 0.4, 72, 99);
  const energyLoad = clamp(5.8 + (Math.abs(outdoorTemp) / 12) * 1.8 + (length * width * 0.12), 4.2, 14.5);

  const forecast = Array.from({ length: 12 }, (_, index) => {
    const hour = index * 2;
    const baseWave = Math.sin((index / 11) * Math.PI * 1.6) * 3.2;
    const indoor = Number((indoorTemp + baseWave - (index % 3) * 0.35).toFixed(1));
    const outdoor = Number((outdoorTemp + Math.sin((index / 11) * Math.PI * 1.2) * 5.5).toFixed(1));

    return { hour, indoor, outdoor };
  });

  return {
    id: `${form.region.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
    projectName: `${form.shape} concept`,
    location: `${form.region} • ${form.terrain}`,
    climate: `${form.climatePattern} / ${form.season}`,
    geometry: `${form.shape} • ${length}m × ${width}m × ${height}m`,
    materials: `${form.wall} / ${form.roof}`,
    metrics: {
      indoorTemp: Number(indoorTemp.toFixed(1)),
      comfortScore: Math.round(comfortScore),
      energyLoad: Number(energyLoad.toFixed(1)),
      occupancy,
    },
    comfortBand: { min: 16, max: 22 },
    forecast,
    recommendations: [
      "Add a low-e interior layer to reduce nighttime heat loss through the glazing plane.",
      "Use the selected wall stack to maintain a steadier indoor gradient across the 48-hour cycle.",
      `Maintain the ${form.heater.toLowerCase()} heater profile to keep the shelter within the habitability band for ${occupancy} occupants.`,
    ],
  };
};

export const getSavedDesign = (): DesignForm | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem("cocoon-last-design");
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as DesignForm;
  } catch {
    return null;
  }
};

export const saveDesign = (form: DesignForm): SimulationResult => {
  const result = buildSimulationResult(form);

  if (typeof window !== "undefined") {
    window.localStorage.setItem("cocoon-last-design", JSON.stringify(form));
    window.localStorage.setItem("cocoon-last-simulation", JSON.stringify(result));
  }

  return result;
};

export const getSavedSimulation = (): SimulationResult | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem("cocoon-last-simulation");
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as SimulationResult;
  } catch {
    return null;
  }
};
