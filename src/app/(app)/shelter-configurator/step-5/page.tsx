"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import ConfiguratorStepper from "@/components/configurator/ConfiguratorStepper";
import WizardFooter from "@/components/configurator/WizardFooter";
import { useWizard } from "@/components/configurator/WizardProvider";
import { Field, NumberInput, RadioCards, SectionCard } from "@/components/configurator/fields";
import {
  ECONOMIC_ASSUMPTION_SETS,
  FLOOR_OPTIONS,
  HEATER_FUELS,
  HVAC_MODES,
  MATERIALS,
  MISSION_TYPES,
  ROOM_TYPES,
  WEATHER_SOURCES,
  toRequirements,
  toRunOptions,
  validateRun,
  type HvacMode,
  type StepKey,
} from "@/lib/configurator/requirements";
import { T } from "@/lib/i18n";
import { ROUTES, configuratorStepRoute, type ConfiguratorStep } from "@/lib/routes";
import { CURRENT_USER, canUseEngineeringMode } from "@/lib/session";

const LAST_RUN_KEY = "cocoon.configurator.lastLaunch";
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-surface-container last:border-0">
      <dt className="font-body-sm text-body-sm text-on-surface-variant shrink-0">
        <T>{label}</T>
      </dt>
      <dd className="font-body-sm text-body-sm text-on-surface text-right">{children}</dd>
    </div>
  );
}

function Labels({ ids, from }: { ids: readonly (string | null)[]; from: { id: string; label: string }[] }) {
  return (
    <>
      {ids.map((id, i) => (
        <span key={String(id)}>
          {i > 0 && ", "}
          <T>{from.find((o) => o.id === id)?.label ?? String(id)}</T>
        </span>
      ))}
    </>
  );
}

function SummaryCard({ step, title, issues, children }: { step: ConfiguratorStep; title: string; issues: number; children: ReactNode }) {
  return (
    <section className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-2">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-headline-sm text-headline-sm text-on-surface">
          <span className="font-data text-[11px] w-6 h-6 rounded-full bg-surface-container flex items-center justify-center">{String(step).padStart(2, "0")}</span>
          <T>{title}</T>
        </h2>
        <div className="flex items-center gap-2">
          {issues > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-label-mono-xs text-label-mono-xs">
              <span className="font-data">{issues}</span> <T>to fix</T>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-equilibrium-tint text-equilibrium font-label-mono-xs text-label-mono-xs">
              <span className="material-symbols-outlined text-[14px]">check</span>
              <T>Complete</T>
            </span>
          )}
          <Link href={configuratorStepRoute(step)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-primary-container hover:bg-surface-container-low font-body-sm text-body-sm font-medium">
            <span className="material-symbols-outlined text-[16px]">edit</span>
            <T>Edit</T>
          </Link>
        </div>
      </header>
      <dl>{children}</dl>
    </section>
  );
}

export default function ConfiguratorStep5Page() {
  const router = useRouter();
  const { draft, update, errors } = useWizard();
  const [launching, setLaunching] = useState(false);
  const engineering = canUseEngineeringMode(CURRENT_USER.role);
  const runErrors = validateRun(draft.run, engineering);

  const count = (k: StepKey) => Object.keys(errors[k]).length;
  const allValid = (["site", "mission", "constraints", "economics"] as StepKey[]).every((k) => count(k) === 0) && Object.keys(runErrors).length === 0;

  const payload = { requirements: toRequirements(draft), run_options: toRunOptions(draft, engineering) };
  const json = JSON.stringify(payload, null, 2);

  function download() {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "requirements.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function launch() {
    if (!allValid) return;
    setLaunching(true);
    try {
      localStorage.setItem(LAST_RUN_KEY, json);
    } catch {
      // storage unavailable — launch continues
    }
    // No backend yet: hand off to the generative solver view.
    setTimeout(() => router.push(ROUTES.candidateTelemetry), 800);
  }

  const s = draft.site;
  const m = draft.mission;
  const c = draft.constraints;
  const floors = FLOOR_OPTIONS.find((f) => f.value === c.maximum_floors)?.label ?? "";

  return (
    <div className="flex flex-col w-full">
      <ConfiguratorStepper current={5} title="Review & Launch" />

      <div className="w-full px-gutter-lg mt-6">
        <div className="max-w-[1720px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 grid grid-cols-1 xl:grid-cols-2 gap-5 content-start">
            <SummaryCard step={1} title="Location & Dates" issues={count("site")}>
              <Row label="Coordinates">
                <span className="font-data">
                  {s.latitude_deg}°, {s.longitude_deg}°
                </span>
              </Row>
              <Row label="Elevation">
                <span className="font-data">{s.elevation_m} m</span>
              </Row>
              <Row label="Analysis period">
                <span className="font-data">
                  {s.analysis_start} → {s.analysis_end}
                </span>
              </Row>
              <Row label="Weather source">
                <Labels ids={[s.weather_source]} from={WEATHER_SOURCES} />
                {s.weather_csv_name && <span className="block font-data text-[11px] text-on-surface-variant">{s.weather_csv_name}</span>}
              </Row>
            </SummaryCard>

            <SummaryCard step={2} title="Mission & Occupancy" issues={count("mission")}>
              <Row label="Mission type">
                <Labels ids={[m.type]} from={MISSION_TYPES} />
              </Row>
              <Row label="Occupants">
                <span className="font-data">{m.occupants}</span>
              </Row>
              <Row label="Required rooms">
                <Labels ids={m.required_rooms} from={ROOM_TYPES} />
              </Row>
              <Row label="Comfort target">
                <span className="font-data">{m.target_temperature_c} °C</span> · <span className="font-data">≤ {m.maximum_unmet_hours} h/wk</span>{" "}
                <T>below target</T>
              </Row>
            </SummaryCard>

            <SummaryCard step={3} title="Constraints & Materials" issues={count("constraints")}>
              <Row label="Maximum footprint">
                <span className="font-data">{c.maximum_footprint_m2} m²</span>
              </Row>
              <Row label="Maximum floors">
                <T>{floors}</T>
              </Row>
              <Row label="Capital budget">
                <span className="font-data">{Number(c.maximum_capex_inr) > 0 ? inr.format(Number(c.maximum_capex_inr)) : "—"}</span>
              </Row>
              <Row label="Materials">
                <Labels ids={c.available_material_ids} from={MATERIALS} />
              </Row>
              <Row label="Heater fuels">
                <Labels ids={c.heater_fuels} from={HEATER_FUELS} />
              </Row>
              <Row label="Preferred orientation">
                {c.preferred_orientation_deg === null ? <T>No preference</T> : <span className="font-data">{c.preferred_orientation_deg}°</span>}
              </Row>
            </SummaryCard>

            <SummaryCard step={4} title="Economics" issues={count("economics")}>
              <Row label="Assumption set">
                <Labels ids={[draft.economic_assumption_set_id]} from={ECONOMIC_ASSUMPTION_SETS} />
                <span className="block font-data text-[11px] text-on-surface-variant">{draft.economic_assumption_set_id}</span>
              </Row>
            </SummaryCard>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-5">
            <SectionCard title="Solver settings" contractKey="run_options" icon="tune">
              <Field label="Simulation mode" contractKey="hvac_mode">
                <div className="grid grid-cols-1 gap-2">
                  <RadioCards<HvacMode>
                    name="hvac_mode"
                    columns={2}
                    value={draft.run.hvac_mode}
                    onChange={(v) => update("run", { hvac_mode: v })}
                    options={HVAC_MODES.map((h) => ({ value: h.id, label: h.label, hint: h.hint }))}
                  />
                </div>
              </Field>

              <label className="flex items-start justify-between gap-4 p-3 rounded-xl border border-outline-variant cursor-pointer">
                <span className="flex flex-col">
                  <span className="font-headline-sm text-[13px] text-on-surface">
                    <T>Heater benchmark run</T>
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    <T>Also simulate each candidate against a reference heater for comparison</T>
                  </span>
                </span>
                <span className="relative inline-flex shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={draft.run.heater_benchmark}
                    onChange={(ev) => update("run", { heater_benchmark: ev.target.checked })}
                    className="peer sr-only"
                  />
                  <span className="w-9 h-5 rounded-full bg-surface-container-high peer-checked:bg-primary-container transition-colors" />
                  <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-surface-container-lowest shadow transition-transform peer-checked:translate-x-4" />
                </span>
              </label>

              {engineering && (
                <Field
                  label="Candidate count"
                  contractKey="candidate_count"
                  htmlFor="candidates"
                  error={runErrors.candidate_count}
                  hint="Engineer/Admin · Mode C. More candidates widen the Pareto search but take longer."
                >
                  <NumberInput
                    id="candidates"
                    value={draft.run.candidate_count}
                    onChange={(v) => update("run", { candidate_count: v })}
                    min={1}
                    max={200}
                    step={1}
                    invalid={!!runErrors.candidate_count}
                  />
                </Field>
              )}
            </SectionCard>

            <details className="bg-surface-container-lowest rounded-xl shadow-card group">
              <summary className="flex items-center justify-between gap-2 p-5 cursor-pointer list-none">
                <span className="flex items-center gap-2 font-headline-sm text-headline-sm text-on-surface">
                  <span className="material-symbols-outlined text-[18px] text-secondary">data_object</span>
                  <T>Requirements JSON</T>
                  <span className="font-data text-[10px] px-2 py-0.5 rounded-full bg-surface-container-low text-on-surface-variant">schema 4.0</span>
                </span>
                <span className="material-symbols-outlined text-[20px] text-on-surface-variant transition-transform group-open:rotate-180">expand_more</span>
              </summary>
              <div className="px-5 pb-5 flex flex-col gap-3">
                <pre className="mono-scope max-h-80 overflow-auto rounded-xl bg-inverse-surface text-inverse-on-surface p-4 text-[11px] leading-relaxed">{json}</pre>
                <button
                  type="button"
                  onClick={download}
                  className="hover-lift self-start inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  <T>Download requirements.json</T>
                </button>
              </div>
            </details>

            {!allValid && (
              <p role="status" className="flex items-start gap-2 p-3 rounded-xl bg-error-container/50 text-on-error-container font-body-sm text-body-sm">
                <span className="material-symbols-outlined text-[16px]">error</span>
                <T>Complete the steps marked “to fix” before launching.</T>
              </p>
            )}
          </div>
        </div>
      </div>

      <WizardFooter
        step={5}
        nextLabel="Launch Generative Run"
        onNext={launch}
        nextPending={launching}
        pendingLabel="Queuing Pareto Solver..."
        canProceed={allValid}
      />
    </div>
  );
}
