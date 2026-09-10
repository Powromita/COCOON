"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getResults,
  getStatus,
  readStashedRequest,
  startRun,
} from "./api";
import type { PipelineStatus, RunRequest, RunResults } from "./types";

export type RunPhase = "idle" | "submitting" | "running" | "done" | "error";

interface RunState {
  phase: RunPhase;
  runId: string | null;
  status: PipelineStatus | null;
  results: RunResults | null;
  error: string | null;
  /** submit a new run */
  submit: (req: RunRequest) => Promise<void>;
  /** resume the run whose request was stashed by the configure page */
  resumeStashed: () => Promise<void>;
  /** attach to an existing run by id */
  attach: (id: string) => Promise<void>;
}

const POLL_MS = 1500;
const MAX_POLLS = 800; // ~20 min ceiling for an ANSYS run

/**
 * Drives one pipeline run: startRun → poll status → getResults.
 * In mock mode the whole thing completes in a few seconds off fixtures;
 * in live mode it polls the real backend.
 */
export function useRun(): RunState {
  const [phase, setPhase] = useState<RunPhase>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [results, setResults] = useState<RunResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const drive = useCallback(async (id: string) => {
    setPhase("running");
    for (let i = 0; i < MAX_POLLS; i++) {
      if (cancelled.current) return;
      let st: PipelineStatus;
      try {
        st = await getStatus(id, i);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
        return;
      }
      if (cancelled.current) return;
      setStatus(st);
      if (st.failed) {
        setError("Pipeline reported a failed stage.");
        setPhase("error");
        return;
      }
      if (st.done) {
        try {
          const r = await getResults(id);
          if (cancelled.current) return;
          setResults(r);
          setPhase("done");
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
          setPhase("error");
        }
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    setError("Timed out waiting for the run to finish.");
    setPhase("error");
  }, []);

  const submit = useCallback(
    async (req: RunRequest) => {
      setPhase("submitting");
      setError(null);
      setResults(null);
      try {
        const { run_id } = await startRun(req);
        setRunId(run_id);
        await drive(run_id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    },
    [drive],
  );

  const resumeStashed = useCallback(async () => {
    const req = readStashedRequest();
    if (!req) {
      setError("No run request found — start from the configuration page.");
      setPhase("error");
      return;
    }
    await submit(req);
  }, [submit]);

  /** attach to an already-running / finished run by id (no new submit) */
  const attach = useCallback(async (id: string) => {
    setRunId(id);
    setError(null);
    await drive(id);
  }, [drive]);

  return { phase, runId, status, results, error, submit, resumeStashed, attach };
}
