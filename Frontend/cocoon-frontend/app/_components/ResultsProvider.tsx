"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { IS_MOCK, readStashedRequest } from "@/app/_lib/api";
import { MOCK_RESULTS } from "@/app/_lib/fixtures";
import { useRun, type RunPhase } from "@/app/_lib/useRun";
import type { PipelineStatus, RunResults } from "@/app/_lib/types";

interface ResultsContextValue {
  /** always populated — real results once the run finishes, fixtures until then */
  results: RunResults;
  /** true once the numbers are from a real solver run (not fixtures) */
  isReal: boolean;
  phase: RunPhase;
  status: PipelineStatus | null;
  error: string | null;
  retry: () => void;
}

const Ctx = createContext<ResultsContextValue | null>(null);

/**
 * Wrap a results page in this. On mount it picks up the run request the
 * configure page stashed and drives it to completion (mock or live).
 * Until real results land, `results` is the fixture so the layout renders.
 */
export function ResultsProvider({ children }: { children: ReactNode }) {
  const run = useRun();

  useEffect(() => {
    // only drive a run if the configure page actually stashed a request;
    // a direct visit just shows fixtures (mock) or an idle state (live).
    if (readStashedRequest()) void run.resumeStashed();
    // resumeStashed is stable (useCallback); run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: ResultsContextValue = {
    results: run.results ?? MOCK_RESULTS,
    isReal: run.phase === "done" && run.results != null,
    phase: run.phase,
    status: run.status,
    error: run.error,
    retry: () => void run.resumeStashed(),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useResults(): ResultsContextValue {
  const v = useContext(Ctx);
  if (v) return v;
  // rendered outside a provider (e.g. isolated component preview) → fixtures
  return {
    results: MOCK_RESULTS,
    isReal: false,
    phase: IS_MOCK ? "done" : "idle",
    status: null,
    error: null,
    retry: () => {},
  };
}
