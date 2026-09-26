"use client";

import Link from "next/link";
import { useState } from "react";
import { CONFIGURATOR_PHASES, ROUTES, STANDARD_STEP_COUNT, configuratorStepRoute, type ConfiguratorStep } from "@/lib/routes";
import { T, useT } from "@/lib/i18n";

type Props = {
  step: ConfiguratorStep;
  /** Label for the primary action; defaults to "Proceed to <next phase>". */
  nextLabel?: string;
  /** Primary action handler. When omitted the button links to the next routed step. */
  onNext?: () => void;
  nextPending?: boolean;
  pendingLabel?: string;
  /** False while the current step has validation errors. */
  canProceed?: boolean;
};

const DRAFT_ID = "#SHT-2025-09-LDK";

function timestamp() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Sticky wizard action bar: step counter, draft status, back / save / proceed. */
export default function WizardFooter({ step, nextLabel, onNext, nextPending = false, pendingLabel, canProceed = true }: Props) {
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const t = useT();
  const nextPhase = CONFIGURATOR_PHASES.find((p) => p.step === step + 1);
  const nextStep = nextPhase?.step;
  const label = nextLabel ?? (nextPhase ? `Proceed to ${nextPhase.label}` : "Finish");
  const primaryClass =
    "hover-lift px-space-lg h-9 bg-primary-container text-on-primary hover:bg-primary transition-all font-body-sm text-body-sm font-semibold rounded-lg shadow-md flex items-center gap-space-xs active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed";

  const content = nextPending ? (
    <>
      <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
      <span>
        <T>{pendingLabel ?? "Working..."}</T>
      </span>
    </>
  ) : (
    <>
      <span className="">
        <T>{label}</T>
      </span>
      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
    </>
  );

  return (
    <div className="sticky bottom-0 z-40 bg-surface-container-lowest/95 backdrop-blur-md shadow-[0_-2px_12px_rgba(0,0,0,0.06)] px-gutter-lg py-space-sm mt-space-xl">
      <div className="max-w-[1720px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-space-sm">
        {/* Step counter & autosave status */}
        <div className="flex items-center gap-space-md">
          <div className="flex items-center gap-space-xs">
            <span className="h-2 w-2 rounded-full bg-secondary" />
            <span className="font-label-mono-xs text-label-mono-xs text-on-surface font-semibold">
              <T>STEP</T> <span className="font-data">{pad(step)}</span> <T>OF</T> <span className="font-data">{pad(STANDARD_STEP_COUNT)}</span>
            </span>
          </div>
          <div className="h-3 w-[1px] bg-outline-variant" />
          <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant" suppressHydrationWarning>
            <T>{savedAt ? "Saved draft:" : "Autosaved to draft:"}</T>{" "}
            <strong className="font-data text-on-surface font-medium">{DRAFT_ID}</strong>
            {savedAt && (
              <>
                {" ("}
                <span className="font-data">{savedAt} UTC</span>)
              </>
            )}
          </span>
        </div>
        {/* Actions */}
        <div className="flex items-center gap-space-sm w-full sm:w-auto justify-end">
          <Link
            href={step === 1 ? ROUTES.dashboard : configuratorStepRoute((step - 1) as ConfiguratorStep)}
            className="px-space-md h-9 text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all font-body-sm text-body-sm font-medium rounded-lg flex items-center gap-space-xs"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <T>{step === 1 ? "Back to Dashboard" : "Back"}</T>
          </Link>
          <button
            type="button"
            onClick={() => setSavedAt(timestamp())}
            className="hover-lift px-space-md h-9 bg-surface-container-lowest text-on-surface hover:bg-surface-container transition-all font-body-sm text-body-sm font-medium rounded-lg shadow-sm"
          >
            <T>Save Draft</T>
          </button>
          {onNext || !nextStep || !canProceed ? (
            <button
              type="button"
              onClick={onNext ?? undefined}
              disabled={nextPending || !canProceed || (!onNext && !nextStep)}
              title={canProceed ? undefined : t("Fix the highlighted fields to continue")}
              className={primaryClass}
            >
              {content}
            </button>
          ) : (
            <Link href={configuratorStepRoute(nextStep)} className={primaryClass}>
              {content}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
