/**
 * Static fixtures lifted from the Stitch screens. Replace with API calls once the
 * solver backend exists — components only depend on these types.
 */

export type CandidateId = "C-8042-4" | "C-8042-19" | "C-8042-28";

export type Candidate = {
  id: CandidateId;
  /** Design name shown in the dossier header. */
  title: string;
  rank: string;
  archetype: string;
  envelope: string;
};

export const CANDIDATES: Candidate[] = [
  { id: "C-8042-4", title: "High-Altitude Stratified Vault V2", rank: "PARETO CHAMPION", archetype: "12-BED ARX DOME", envelope: "Aerogel Composite + Phase Change Core" },
  { id: "C-8042-19", title: "Pneumatic Modular Rib Pod", rank: "RAPID DEPLOY", archetype: "MODULAR RIB POD", envelope: "Pneumatic Double-Walled Inflatable Ribs" },
  { id: "C-8042-28", title: "Bermed Passive Trombe Unit", rank: "ZERO-FUEL PASSIVE", archetype: "BERMED PASSIVE UNIT", envelope: "Triple Trombe Glazing + Heavy Basalt Rockbed" },
];

/** Stable demo link (e.g. `/candidate-telemetry/demo-id`) that resolves to the Pareto champion. */
export const DEMO_CANDIDATE_ID = "demo-id";

export function getCandidate(id: string): Candidate | undefined {
  if (id === DEMO_CANDIDATE_ID) return CANDIDATES[0];
  return CANDIDATES.find((c) => c.id === id);
}

export type Verification = "ansys" | "ml" | "rc";
export type SolverStatus = { kind: "converged" } | { kind: "solving"; iter: number } | { kind: "archived" };

export type SimulationRun = {
  id: string;
  archetype: string;
  envelope: string;
  site: string;
  deltaT: string;
  tempRange: string;
  /** Baseline runs render ΔT in the critical tone. */
  deltaTCritical?: boolean;
  shgc: string;
  irradiance: string;
  verification: Verification;
  status: SolverStatus;
  /**
   * Candidate dossier opened by "Inspect" (placeholder mapping until runs ↔ candidates come from the API).
   * Absent for reference baselines, which open in the Benchmark Library instead.
   */
  candidateId?: CandidateId;
};

export const TOTAL_CACHED_RUNS = 16;

export const RECENT_RUNS: SimulationRun[] = [
  {
    id: "RUN-8821",
    archetype: "HIM-SHELTER-GEN4-V3",
    envelope: "Aerogel Wall + Phase Change Mat",
    site: "Depsang Y-Junction (DBO)",
    deltaT: "+59.6 K",
    tempRange: "(-38.4° / +21.2°)",
    shgc: "0.71",
    irradiance: "(428 W/m²)",
    verification: "ansys",
    status: { kind: "converged" },
    candidateId: "C-8042-4",
  },
  {
    id: "RUN-8822",
    archetype: "EXP-GEO-DOME-H8",
    envelope: "Double-Curved Hexagonal Pneumatic",
    site: "Galwan Valley Pt 4170",
    deltaT: "+52.1 K",
    tempRange: "(-34.1° / +18.0°)",
    shgc: "0.64",
    irradiance: "(380 W/m²)",
    verification: "ml",
    status: { kind: "solving", iter: 440 },
    candidateId: "C-8042-19",
  },
  {
    id: "RUN-8820",
    archetype: "HYBRID-SLAB-TROMBE-B",
    envelope: "South Solar Glaze with Basalt Heat Store",
    site: "Siachen Glacier Ridge IV",
    deltaT: "+48.3 K",
    tempRange: "(-41.0° / +7.3°)",
    shgc: "0.82",
    irradiance: "(510 W/m²)",
    verification: "rc",
    status: { kind: "converged" },
    candidateId: "C-8042-28",
  },
  {
    id: "RUN-8819",
    archetype: "BASE-QUONSET-1984-REF",
    envelope: "Arch Corrugated Galvanized Spec",
    site: "DBO Main Logistics Depot",
    deltaT: "+24.0 K",
    tempRange: "(-38.4° / -14.4°)",
    deltaTCritical: true,
    shgc: "0.22",
    irradiance: "(110 W/m²)",
    verification: "ansys",
    status: { kind: "archived" },
  },
  {
    id: "RUN-8818",
    archetype: "HIM-TENT-MICRO-3P",
    envelope: "Deployable Multi-Layer Air-Drop Shelter",
    site: "Chushul Tactical Observation",
    deltaT: "+39.8 K",
    tempRange: "(-28.0° / +11.8°)",
    shgc: "0.48",
    irradiance: "(290 W/m²)",
    verification: "rc",
    status: { kind: "converged" },
    candidateId: "C-8042-19",
  },
];
