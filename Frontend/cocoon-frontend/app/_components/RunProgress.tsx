"use client";

import { useResults } from "@/app/_components/ResultsProvider";
import { IS_MOCK } from "@/app/_lib/api";
import { useT } from "@/app/_lib/i18n";

const STAGE_LABEL: Record<string, string> = {
  "1_weather": "Weather archive",
  "2_config": "Configuration",
  "4_features": "Feature reports",
  "5_pool": "Design pool",
  "6_rank": "RC ranking",
  "7_reliability": "Reliability",
  "8_ansys": "ANSYS FEM",
  "9_recommend": "Recommendation",
  "10_report": "Report",
};

/**
 * Live run status strip for the results pages. In mock mode it shows a
 * short "using preview data" note; in live mode it shows the pipeline
 * stages as they complete.
 */
export default function RunProgress({ mode = "single" }: { mode?: "single" | "optimize" }) {
  const { phase, status, error, isReal, retry, runDemo, needsInput } = useResults();
  const t = useT();

  if (phase === "done" && isReal) return null;

  const isBusy = phase === "submitting" || phase === "running";

  if (needsInput) {
    return (
      <div className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-space-md shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <div>
            <span className="font-headline-sm text-on-surface">No run submitted</span>
            <p className="font-body-sm text-on-surface-variant">
              Fill the configuration form, or run a canned demo against the connected solver.
            </p>
          </div>
          <button
            type="button"
            onClick={() => runDemo(mode)}
            className="rounded bg-primary px-space-md py-space-xs font-body-sm font-semibold text-on-primary hover:bg-primary-container"
          >
            Run demo analysis
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-space-md shadow-sm ${
        phase === "error"
          ? "border-error/40 bg-error/5"
          : "border-surface-container-high bg-surface-container-lowest"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-xs">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              phase === "error"
                ? "bg-error"
                : isBusy
                  ? "animate-pulse bg-secondary-container"
                  : "bg-tertiary-container"
            }`}
          />
          <span className="font-headline-sm text-on-surface">
            {phase === "error"
              ? "Run failed"
              : isBusy
                ? "Running the pipeline…"
                : IS_MOCK
                  ? "Preview mode — showing fixture data"
                  : "Idle"}
          </span>
        </div>
        {phase === "error" ? (
          <button
            type="button"
            onClick={retry}
            className="rounded bg-primary px-space-sm py-space-2xs font-body-sm text-on-primary hover:bg-primary-container"
          >
            {t("common.runSim")}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-space-xs font-body-sm text-error">{error}</p>
      ) : null}

      {status?.stages?.length ? (
        <ol className="mt-space-sm flex flex-wrap gap-space-xs">
          {status.stages.map((s) => (
            <li
              key={s.stage}
              className={`flex items-center gap-space-2xs rounded px-space-xs py-space-2xs font-mono-metric-sm ${
                s.phase === "ok"
                  ? "bg-tertiary-container/15 text-tertiary-container"
                  : s.phase === "failed"
                    ? "bg-error/10 text-error"
                    : s.phase === "running"
                      ? "bg-secondary-fixed text-secondary"
                      : "bg-surface-container text-on-surface-variant"
              }`}
            >
              <span aria-hidden>
                {s.phase === "ok" ? "✓" : s.phase === "failed" ? "✕" : s.phase === "running" ? "▸" : "•"}
              </span>
              {STAGE_LABEL[s.stage] ?? s.stage}
            </li>
          ))}
        </ol>
      ) : null}

      {IS_MOCK && phase !== "error" ? (
        <p className="mt-space-xs font-body-sm text-on-surface-variant">
          {t("common.mockNote")} Set <code className="font-mono-metric-sm">NEXT_PUBLIC_API_MODE=live</code> to
          connect the solver.
        </p>
      ) : null}
    </div>
  );
}
