import { buildSimulationResult } from "@/services/design";
import type { DesignForm, SimulationResult } from "@/types/design";

export type SimulationService = {
  run: (form: DesignForm) => Promise<SimulationResult>;
};

export const simulationService: SimulationService = {
  async run(form) {
    await Promise.resolve();
    return buildSimulationResult(form);
  },
};
