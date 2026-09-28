/**
 * DataTruthState — where a piece of data on screen came from. Every screen
 * that renders scientific data can answer this, so the demo / cached /
 * live messaging is consistent everywhere.
 */
export type DataTruthState = "fixture" | "api" | "cache" | "local";

export interface Sourced<T> {
  data: T;
  source: DataTruthState;
  /** When the data was fetched (for cache: when it was originally fetched). */
  fetchedAt: string;
}

export interface DataTruthCopy {
  label: string;
  message: string;
}

const COPY: Record<DataTruthState, DataTruthCopy> = {
  fixture: {
    label: "DEMO DATA",
    message: "Recorded COCOON backend optimization run. Results are replayed for demonstration — no new optimization has run.",
  },
  api: {
    label: "Live",
    message: "Result from the connected COCOON backend.",
  },
  cache: {
    label: "Cached",
    message: "Saved copy of an earlier backend response, shown because the server could not be reached.",
  },
  local: {
    label: "On this device",
    message: "Saved on this device only — not yet submitted.",
  },
};

export function getDataTruthCopy(state: DataTruthState): DataTruthCopy {
  return COPY[state];
}

export function isFixtureData(state: DataTruthState): boolean {
  return state === "fixture";
}
