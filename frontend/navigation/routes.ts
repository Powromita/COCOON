/**
 * Central route definitions for the App Router.
 *
 * Keeping route names here prevents screen components from duplicating paths
 * and gives the future auth service one place to identify protected routes.
 */
export const routes = {
  auth: {
    login: "/login",
  },
  guide: "/guide",
  main: {
    home: "/",
    individual: {
      configure: "/individual/configure",
      results: "/individual/results",
    },
    organization: {
      home: "/organization",
      configure: "/organization/configure",
      results: "/organization/results",
    },
  },
} as const;

export const designFlow = [
  { label: "Home", href: routes.main.home },
  { label: "Configure", href: routes.main.individual.configure },
  { label: "Results", href: routes.main.individual.results },
] as const;

export type AppRoute =
  | typeof routes.auth.login
  | typeof routes.guide
  | typeof routes.main.home
  | typeof routes.main.individual.configure
  | typeof routes.main.individual.results
  | typeof routes.main.organization.home
  | typeof routes.main.organization.configure
  | typeof routes.main.organization.results;
