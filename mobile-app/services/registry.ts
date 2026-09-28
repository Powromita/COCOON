/**
 * Service registry — the single place that picks the fixture or API
 * provider for every service. Screens and hooks import services from here
 * only, so switching EXPO_PUBLIC_DATA_PROVIDER changes every data source
 * without touching a screen.
 *
 * Migration to the real backend can also happen one service at a time: flip
 * a single line below from the Fixture* class to the Api* class.
 */
import { readAccessToken } from "../auth/tokenStore";
import { API_URL, DATA_PROVIDER } from "../constants/env";
import {
  ApiAnsysService,
  ApiCandidateService,
  ApiCapabilitiesService,
  ApiEconomicsService,
  ApiGenerationService,
  ApiAuthService,
  ApiMaterialsService,
  ApiOptimizationHistoryService,
  ApiProjectService,
  ApiSimulationService,
  ApiVisualizationService,
} from "./api/ApiServices";
import { ApiClient } from "./api/client";
import {
  FixtureAnsysService,
  FixtureCandidateService,
  FixtureCapabilitiesService,
  FixtureEconomicsService,
  FixtureGenerationService,
  FixtureAuthService,
  FixtureMaterialsService,
  FixtureOptimizationHistoryService,
  FixtureProjectService,
  FixtureSimulationService,
  FixtureVisualizationService,
} from "./fixture/FixtureServices";
import type { AnsysService } from "./interfaces/AnsysService";
import type { CandidateService } from "./interfaces/CandidateService";
import type { CapabilitiesService } from "./interfaces/CapabilitiesService";
import type { EconomicsService } from "./interfaces/EconomicsService";
import type { GenerationService } from "./interfaces/GenerationService";
import type { MaterialsService } from "./interfaces/MaterialsService";
import type { AuthService } from "./interfaces/AuthService";
import type { OptimizationHistoryService } from "./interfaces/OptimizationHistoryService";
import type { ProjectService } from "./interfaces/ProjectService";
import type { SimulationService } from "./interfaces/SimulationService";
import type { VisualizationService } from "./interfaces/VisualizationService";

export const apiClient = new ApiClient(API_URL, readAccessToken);

const useApi = DATA_PROVIDER === "api";

export const capabilitiesService: CapabilitiesService = useApi
  ? new ApiCapabilitiesService(apiClient)
  : new FixtureCapabilitiesService();
export const generationService: GenerationService = useApi
  ? new ApiGenerationService(apiClient)
  : new FixtureGenerationService();
export const candidateService: CandidateService = useApi
  ? new ApiCandidateService(apiClient)
  : new FixtureCandidateService();
export const simulationService: SimulationService = useApi
  ? new ApiSimulationService(apiClient)
  : new FixtureSimulationService();
export const economicsService: EconomicsService = useApi
  ? new ApiEconomicsService(apiClient)
  : new FixtureEconomicsService();
export const visualizationService: VisualizationService = useApi
  ? new ApiVisualizationService(apiClient)
  : new FixtureVisualizationService();
export const ansysService: AnsysService = useApi ? new ApiAnsysService(apiClient) : new FixtureAnsysService();
export const materialsService: MaterialsService = useApi
  ? new ApiMaterialsService(apiClient)
  : new FixtureMaterialsService();
export const historyService: OptimizationHistoryService = useApi
  ? new ApiOptimizationHistoryService(apiClient)
  : new FixtureOptimizationHistoryService();
export const projectService: ProjectService = useApi ? new ApiProjectService(apiClient) : new FixtureProjectService();
export const authService: AuthService = useApi ? new ApiAuthService(apiClient, capabilitiesService) : new FixtureAuthService();
