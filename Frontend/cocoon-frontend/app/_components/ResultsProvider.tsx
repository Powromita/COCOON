"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { IS_MOCK, readStashedRequest } from "@/app/_lib/api";
import { MOCK_RESULTS } from "@/app/_lib/fixtures";
import { demoRequest } from "@/app/_lib/demoRequest";
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
  /** submit the canned demo request for this mode (results pages with no stashed form) */
  runDemo: (mode: "single" | "optimize") => void;
  /** true when live and nothing has been submitted yet */
  needsInput: boolean;
}

const Ctx = createContext<ResultsContextValue | null>(null);

/**
 * Wrap a results page in this. On mount it picks up the run request the
 * configure page stashed and drives it to completion (mock or live).
 * Until real results land, `results` is the fixture so the layout renders.
 */
export function ResultsProvider({
  children,
  demoMode = "single",
}: {
  children: ReactNode;
  demoMode?: "single" | "optimize";
}) {
  const run = useRun();

  useEffect(() => {
    const p = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
    // 1. ?run_id=X → attach to an existing run (no new submit)
    if (!IS_MOCK && p.get("run_id")) {
      void run.attach(p.get("run_id")!);
      return;
    }
    // 2. a stashed request from the configure form → drive it
    if (readStashedRequest()) {
      void run.resumeStashed();
      return;
    }
    // 3. ?demo=1 on a direct visit (live mode) → run the canned request
    if (!IS_MOCK && p.get("demo") === "1") {
      void run.submit(demoRequest(demoMode));
    }
    // callbacks are stable (useCallback); run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: ResultsContextValue = {
    results: run.results ?? MOCK_RESULTS,
    isReal: run.phase === "done" && run.results != null,
    phase: run.phase,
    status: run.status,
    error: run.error,
    retry: () => void run.resumeStashed(),
    runDemo: (mode) => void run.submit(demoRequest(mode)),
    needsInput: !IS_MOCK && run.phase === "idle" && run.results == null,
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
    runDemo: () => {},
    needsInput: false,
  };
}
