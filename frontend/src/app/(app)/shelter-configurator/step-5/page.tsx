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
  EXTENDED_MATERIAL_IDS,
  HEATER_FUELS,
  MATERIALS,
  MISSION_TYPES,
  ROOM_TYPES,
  toDesignOptions,
  toRequirements,
  type StepKey,
} from "@/lib/configurator/requirements";
import { T } from "@/lib/i18n";
import { ROUTES, configuratorStepRoute, type ConfiguratorStep } from "@/lib/routes";
import { ApiError, LATEST_OPTIMIZATION_STORAGE_KEY, startOptimization, type OptimizationRequest } from "@/lib/api";

const LAST_RUN_KEY = "cocoon.configurator.lastLaunch";
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function Row({ label, value, icon }: { label: string; value: ReactNode; icon?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-surface-container last:border-0">
      <dt className="flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant shrink-0">
        {icon && <span className="material-symbols-outlined text-[14px]">{icon}</span>}
        <T>{label}</T>
      </dt>
      <dd className="font-body-sm text-body-sm text-on-surface text-right font-medium">{value}</dd>
    </div>
  );
}

function SummaryCard({ step, title, icon, issues, children }: { step: ConfiguratorStep; title: string; icon: string; issues: number; children: ReactNode }) {
  return (
    <section className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-2">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-headline-sm text-headline-sm text-on-surface font-semibold">
          <span className="material-symbols-outlined text-[18px] text-primary">{icon}</span>
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
              <T>Ready</T>
            </span>
          )}
          <Link href={configuratorStepRoute(step)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-primary hover:bg-surface-container-low font-body-sm text-body-sm font-medium">
            <span className="material-symbols-outlined text-[14px]">edit</span>
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
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchSuggestions, setLaunchSuggestions] = useState<string[]>([]);

  const count = (k: StepKey) => Object.keys(errors[k] || {}).length;
  const allValid = (["site", "mission", "constraints", "design", "run"] as StepKey[]).every((k) => count(k) === 0);

  const payload = {
    requirements: toRequirements(draft),
    design_options: toDesignOptions(draft),
    solver: {
      count: Number(draft.run.candidate_count || 20),
      validate_with_ansys: draft.run.run_ansys,
      economic_assumption_set_id: draft.economic_assumption_set_id,
    },
  };
  const json = JSON.stringify(payload, null, 2);

  function downloadJson() {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "cocoon_requirements.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function launch() {
    if (!allValid) return;
    setLaunching(true);
    setLaunchError(null);
    setLaunchSuggestions([]);
    try { localStorage.setItem(LAST_RUN_KEY, json); } catch { /* ignore */ }
    try {
      const requirements = {
        ...payload.requirements,
        project_id: `prj_${Date.now().toString(36)}`,
      };
      const hasExtendedMaterials = draft.constraints.available_material_ids.some((id) =>
        EXTENDED_MATERIAL_IDS.has(id)
      );

      const request: OptimizationRequest = {
        name: draft.name?.trim() || undefined,
        requirements,
        count: Math.max(1, Math.min(200, Number(draft.run.candidate_count || 20))),
        validate_with_ansys: draft.run.run_ansys,
        design_options: payload.design_options,
        materials_snapshot_id: hasExtendedMaterials ? "mat_snap_himalayan_v2" : null,
      };

      const res = await startOptimization(request);
      try { localStorage.setItem(LATEST_OPTIMIZATION_STORAGE_KEY, res.optimization_id); } catch { /* ignore */ }
      router.push(ROUTES.candidateDetail(res.optimization_id));
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : "Failed to launch pipeline");
      setLaunchSuggestions(err instanceof ApiError && Array.isArray(err.details.suggestions)
        ? err.details.suggestions.filter((item): item is string => typeof item === "string")
        : []);
      setLaunching(false);
    }
  }

  return (
    <div className="flex flex-col w-full">
      <ConfiguratorStepper current={5} title="Review & Solver Controls" />

      <div className="w-full px-gutter-lg mt-6">
        <div className="max-w-[1720px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Column: Solver Controls & Launch */}
          <div className="lg:col-span-6 flex flex-col gap-5">

            {/* 3. Solver & Simulation Controls */}
            <SectionCard title="Solver &amp; Simulation Controls" contractKey="solver" icon="tune">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Configure candidate generation density, FEM validation, and cost model assumptions.</T>
              </p>

              {/* Candidate Pool Count */}
              <div className="mb-4">
                <Field
                  label="Candidate Pool Count (count)"
                  contractKey="count"
                  htmlFor="candidate_count"
                  error={errors.run?.candidate_count}
                  hint="Number of generative designs to synthesize and evaluate (default 20, range 1..200)"
                >
                  <NumberInput
                    id="candidate_count"
                    value={draft.run.candidate_count}
                    onChange={(v) => update("run", { candidate_count: v })}
                    min={1}
                    max={200}
                    step={1}
                    unit="designs"
                    invalid={!!errors.run?.candidate_count}
                  />
                </Field>
              </div>

              {/* ANSYS Validation Toggle */}
              <div className="mb-4 p-4 rounded-xl border border-outline-variant bg-surface-container-lowest flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[24px] text-primary mt-0.5">verified</span>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                      <T>ANSYS Validation (validate_with_ansys)</T>
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      <T>Request full ANSYS FEA thermal cross-validation for the top recommended design.</T>
                    </span>
                  </div>
                </div>
                <label className="relative inline-flex shrink-0 mt-0.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.run.run_ansys}
                    onChange={(e) => update("run", { run_ansys: e.target.checked })}
                    className="peer sr-only"
                  />
                  <span className="w-11 h-6 rounded-full bg-surface-container-high peer-checked:bg-primary transition-colors" />
                  <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-surface-container-lowest shadow transition-transform peer-checked:translate-x-5" />
                </label>
              </div>

              {/* Economic Assumption Set */}
              <div className="mt-4">
                <Field
                  label="Economic Assumption Set (economic_assumption_set_id)"
                  contractKey="economic_assumption_set_id"
                  error={errors.run?.economic_assumption_set_id}
                  hint="Lifecycle cost baseline profile"
                >
                  <RadioCards<string>
                    name="economic_assumption_set_id"
                    value={draft.economic_assumption_set_id}
                    onChange={(v) => update("economic_assumption_set_id", v)}
                    options={ECONOMIC_ASSUMPTION_SETS.map((s) => ({ value: s.id, label: s.label, hint: s.hint }))}
                  />
                </Field>
              </div>
            </SectionCard>

            {/* Launch Action Card */}
            <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4 border-2 border-primary/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[22px]">rocket_launch</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                    <T>Launch Generative Optimization</T>
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    <T>Executes M3 weather freeze, M2 geometry synthesis, M4 RC verification, M7 economics and M6 Pareto ranking.</T>
                  </p>
                </div>
              </div>

              {launchError && (
                <div className="p-3 rounded-lg bg-error-container text-on-error-container font-body-sm text-body-sm flex items-start gap-2">
                  <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
                  <div className="flex flex-col gap-1.5">
                    <span>{launchError}</span>
                    {launchSuggestions.length > 0 && (
                      <ul className="list-disc pl-4 text-xs space-y-1">
                        {launchSuggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={launch}
                  disabled={!allValid || launching}
                  className="flex-1 h-11 px-5 rounded-xl bg-primary hover:bg-primary-hover active:bg-primary text-on-primary font-body-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {launching ? (
                    <>
                      <span className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
                      <T>Synthesizing & Solving...</T>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[20px]">play_arrow</span>
                      <T>Run Solver & Optimization</T>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={downloadJson}
                  className="h-11 px-4 rounded-xl border border-outline-variant hover:bg-surface-container-low font-body-sm font-medium text-on-surface flex items-center justify-center gap-2 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">download</span>
                  <T>JSON</T>
                </button>
              </div>
            </div>

          </div>

          {/* Right Column: Complete Input Review */}
          <div className="lg:col-span-6 flex flex-col gap-4">

            {/* 1. Geographic & Weather Window */}
            <SummaryCard step={1} title="Geographic & Weather Window" icon="location_on" issues={count("site")}>
              <Row label="Coordinates" value={`${draft.site.latitude_deg}°N, ${draft.site.longitude_deg}°E`} icon="my_location" />
              <Row label="Elevation" value={`${draft.site.elevation_m} m`} icon="altitude" />
              <Row label="Analysis Window" value={`${draft.site.analysis_start} → ${draft.site.analysis_end}`} icon="date_range" />
              <Row label="Timezone" value={draft.site.timezone} icon="schedule" />
            </SummaryCard>

            {/* 2. Mission & Occupancy */}
            <SummaryCard step={2} title="Mission & Occupancy" icon="groups" issues={count("mission")}>
              <Row
                label="Mission Type"
                value={MISSION_TYPES.find((t) => t.id === draft.mission.type)?.label ?? draft.mission.type}
                icon="military_tech"
              />
              <Row label="Troop Count" value={`${draft.mission.occupants} personnel`} icon="person" />
              <Row
                label="Required Rooms"
                value={draft.mission.required_rooms.map((r) => ROOM_TYPES.find((x) => x.id === r)?.label ?? r).join(", ")}
                icon="meeting_room"
              />
              <Row label="Target Temperature" value={`${draft.mission.target_temperature_c} °C`} icon="thermostat" />
              <Row label="Max Unmet Hours" value={`${draft.mission.maximum_unmet_hours} h`} icon="timer" />
            </SummaryCard>

            {/* 3. Site Limits & Constraints */}
            <SummaryCard step={3} title="Site Limits & Constraints" icon="rule" issues={count("constraints")}>
              <Row label="Max Footprint" value={`${draft.constraints.maximum_footprint_m2} m²`} icon="crop_free" />
              <Row label="Max Floors" value={`${draft.constraints.maximum_floors} floor(s)`} icon="layers" />
              <Row
                label="Budget Ceiling"
                value={inr.format(Number(draft.constraints.maximum_capex_inr || 0))}
                icon="currency_rupee"
              />
              <Row
                label="Approved Materials"
                value={draft.constraints.available_material_ids.map((id) => MATERIALS.find((m) => m.id === id)?.label ?? id).join(", ")}
                icon="category"
              />
              <Row
                label="Heater Fuels"
                value={draft.constraints.heater_fuels.map((f) => HEATER_FUELS.find((x) => x.id === f)?.label ?? f).join(", ")}
                icon="local_fire_department"
              />
              {draft.constraints.maximum_mass_kg && (
                <Row label="Max Total Weight" value={`${draft.constraints.maximum_mass_kg} kg`} icon="weight" />
              )}
              {draft.constraints.max_assembly_time_hours && (
                <Row label="Max Assembly Time" value={`${draft.constraints.max_assembly_time_hours} hours`} icon="timer" />
              )}
            </SummaryCard>

            {/* 4. Physical & Envelope Overrides */}
            <SummaryCard step={4} title="Physical & Envelope Overrides" icon="architecture" issues={count("design")}>
              <Row
                label="Fixed Dimensions"
                value={`${draft.design.length_m}m (L) × ${draft.design.width_m}m (W) × ${draft.design.height_m}m (H)`}
                icon="straighten"
              />
              <Row
                label="Thicknesses"
                value={`Wall: ${draft.design.wall_thickness_mm}mm | Roof: ${draft.design.roof_thickness_mm}mm | Floor: ${draft.design.floor_thickness_mm}mm`}
                icon="layers"
              />
              <Row
                label="Windows & Glazing"
                value={
                  draft.design.glazing === "none" || Number(draft.design.window_count || 0) === 0
                    ? "None (Opaque building envelope)"
                    : Number(draft.design.window_count) === 1
                    ? `1 window (${draft.design.windows?.[0]?.width_m ?? draft.design.window_width_m}m × ${draft.design.windows?.[0]?.height_m ?? draft.design.window_height_m}m, ${draft.design.windows?.[0]?.orientation ?? draft.design.window_orientation}, ${draft.design.glazing})`
                    : `${draft.design.window_count} windows configured individually (${draft.design.glazing})`
                }
                icon="window"
              />
              <Row label="Airtightness" value={`${draft.design.air_changes_per_hour} ACH`} icon="air" />
            </SummaryCard>

          </div>

        </div>
      </div>

      <WizardFooter step={5} canProceed={allValid} />
    </div>
  );
}
