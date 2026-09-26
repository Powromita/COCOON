/**
 * Single source of truth for every route in the app.
 * Never hard-code a path string in a component — import from here.
 */
export const ROUTES = {
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  dashboard: "/dashboard",
  projects: "/projects",
  shelterConfigurator: {
    step1: "/shelter-configurator/step-1",
    step2: "/shelter-configurator/step-2",
    step3: "/shelter-configurator/step-3",
    step4: "/shelter-configurator/step-4",
    step5: "/shelter-configurator/step-5",
  },
  candidateTelemetry: "/candidate-telemetry",
  candidateDetail: (id: string) => `/candidate-telemetry/${encodeURIComponent(id)}`,
  benchmarkLibrary: "/benchmark-library",
  reports: "/reports",
} as const;

export type ConfiguratorStep = 1 | 2 | 3 | 4 | 5;

/** Route for a numbered wizard step, for code that iterates over steps. */
export function configuratorStepRoute(step: ConfiguratorStep): string {
  return ROUTES.shelterConfigurator[`step${step}`];
}

export type ConfiguratorPhase = {
  code: string;
  label: string;
  detail: string;
  /** Routed wizard step; phases without one are not built yet. */
  step?: ConfiguratorStep;
  /** Restricted to Eng/Admin clearance. */
  locked?: boolean;
};

/**
 * Standard Mode A wizard (PRD v4 §3.1 / §7.1): five routed steps. The Advanced step (Mode C,
 * Engineering Optimization) is Engineer/Admin-only and not part of the standard flow.
 */
export const CONFIGURATOR_PHASES: ConfiguratorPhase[] = [
  { code: "01", label: "Location & Dates", detail: "Site, season & weather source", step: 1 },
  { code: "02", label: "Mission & Occupancy", detail: "Mission, rooms & comfort target", step: 2 },
  { code: "03", label: "Constraints & Materials", detail: "Footprint, budget, materials & fuel", step: 3 },
  { code: "04", label: "Economics", detail: "Lifecycle assumption set", step: 4 },
  { code: "05", label: "Review & Launch", detail: "Summary & solver settings", step: 5 },
  { code: "06", label: "Advanced", detail: "Eng/Admin only", locked: true },
];

/** Number of steps in the standard flow (excludes the locked Advanced step). */
export const STANDARD_STEP_COUNT = CONFIGURATOR_PHASES.filter((p) => p.step !== undefined).length;

export type NavItem = {
  label: string;
  href: string;
  /** Path prefix that marks this item active (covers nested routes). */
  match: string;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: ROUTES.dashboard, match: "/dashboard" },
  { label: "Projects", href: ROUTES.projects, match: "/projects" },
  { label: "Shelter Configurator", href: ROUTES.shelterConfigurator.step1, match: "/shelter-configurator" },
  { label: "Candidate Telemetry", href: ROUTES.candidateTelemetry, match: "/candidate-telemetry" },
  { label: "Benchmark Library", href: ROUTES.benchmarkLibrary, match: "/benchmark-library" },
  { label: "Reports & History", href: ROUTES.reports, match: "/reports" },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return pathname === item.match || pathname.startsWith(`${item.match}/`);
}
