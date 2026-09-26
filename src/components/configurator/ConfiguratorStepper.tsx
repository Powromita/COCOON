import Link from "next/link";
import type { ReactNode } from "react";
import { CONFIGURATOR_PHASES, ROUTES, configuratorStepRoute, type ConfiguratorStep } from "@/lib/routes";
import { T } from "@/lib/i18n";

type Props = {
  current: ConfiguratorStep;
  title: string;
};

/** Wizard header: phase badge, title, solver status and the six-phase engineering stepper. */
export default function ConfiguratorStepper({ current, title }: Props) {
  return (
    <div className="w-full bg-surface-container-lowest px-gutter-lg py-space-md shadow-sm">
      <div className="max-w-[1720px] mx-auto flex flex-col gap-space-md">
        {/* Title & Context Breadcrumb */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm">
          <div className="flex items-center gap-space-sm">
            <span className="px-space-xs py-0.5 rounded-full font-label-mono-xs text-label-mono-xs font-semibold tracking-wider uppercase shrink-0" style={{ color: "#0F7A8C", backgroundColor: "#ECFBFC" }}>
              <T>WIZARD PHASE</T> {current}
            </span>
            <h1 className="font-headline-md text-headline-md text-on-surface font-semibold tracking-tight">
              <T>{title}</T>
            </h1>
          </div>
          <div className="flex items-center gap-space-md">
            <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]" style={{ color: "#0F7A8C" }}>memory</span>
              {" "}<T>SOLVER CORE: ANSYS MAPDL T-STEADY</T>
            </span>
            <div className="h-3 w-[1px] bg-outline-variant" />
            <span className="font-label-mono-xs text-label-mono-xs flex items-center gap-1 font-medium" style={{ color: "#059669" }}>
              <span className="material-symbols-outlined text-[14px]" style={{ color: "#059669" }}>cloud_done</span>
              {" "}<T>REAL-TIME PARAMETRIC SYNC</T>
            </span>
          </div>
        </div>
        {/* Horizontal Engineering Stepper */}
        <nav aria-label="Configurator steps" className="w-full overflow-x-auto">
          <ol className="min-w-[980px] flex items-center justify-between relative py-2">
            {/* Continuous Track Behind */}
            <li className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-[2px] bg-surface-container-high z-0" aria-hidden />
            {CONFIGURATOR_PHASES.map((phase) => {
              const active = phase.step === current;
              const done = phase.step !== undefined && phase.step < current;

              let dot: ReactNode;
              let labelClass = "font-headline-sm text-headline-sm leading-none ";
              let detailClass = "font-label-mono-xs text-label-mono-xs ";
              if (phase.locked) {
                dot = (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-label-mono-sm text-label-mono-sm" style={{ backgroundColor: "rgb(243, 238, 250)", color: "rgb(107, 76, 154)" }}>
                    <span className="material-symbols-outlined text-[16px]">lock</span>
                  </div>
                );
                labelClass += "font-medium text-ink-muted";
                detailClass += "text-ink-disabled";
              } else if (active) {
                dot = (
                  <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-label-mono-sm text-label-mono-sm font-semibold shadow-sm">
                    {phase.code}
                  </div>
                );
                labelClass += "text-primary font-bold";
                detailClass += "text-on-surface-variant";
              } else if (done) {
                dot = (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
                    <span className="material-symbols-outlined text-[18px]">check</span>
                  </div>
                );
                labelClass += "text-on-surface font-semibold";
                detailClass += "text-on-surface-variant";
              } else {
                dot = (
                  <div className="w-8 h-8 rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center font-label-mono-sm text-label-mono-sm font-medium">
                    {phase.code}
                  </div>
                );
                labelClass += "text-on-surface-variant font-medium";
                detailClass += "text-outline";
              }

              const body = (
                <>
                  {dot}
                  <div className="flex flex-col">
                    <span className={labelClass}><T>{phase.label}</T></span>
                    <span className={detailClass}><T>{phase.detail}</T></span>
                  </div>
                </>
              );
              const itemClass = `relative z-10 flex items-center gap-space-sm bg-surface-container-lowest rounded-full border py-1 pl-1 pr-space-lg ${
                active ? "border-primary-container/30 shadow-card" : "border-surface-container"
              }`;

              return (
                <li key={phase.code} className={itemClass} aria-current={active ? "step" : undefined}>
                  {phase.step && !active ? (
                    <Link href={configuratorStepRoute(phase.step)} className="flex items-center gap-space-sm rounded-full hover:opacity-80 transition-opacity">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );
}
