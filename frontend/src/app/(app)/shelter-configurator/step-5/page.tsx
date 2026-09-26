"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import ConfiguratorStepper from "@/components/configurator/ConfiguratorStepper";
import WizardFooter from "@/components/configurator/WizardFooter";
import { useWizard } from "@/components/configurator/WizardProvider";
import { SectionCard } from "@/components/configurator/fields";
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
  type StepKey,
} from "@/lib/configurator/requirements";
import { T } from "@/lib/i18n";
import { ROUTES, configuratorStepRoute, type ConfiguratorStep } from "@/lib/routes";
import { CURRENT_USER, canUseEngineeringMode } from "@/lib/session";

const LAST_RUN_KEY = "cocoon.configurator.lastLaunch";
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

// One-click presets for common deployments
const QUICK_PRESETS = [
  {
    id: "ladakh_winter_standard",
    label: "Ladakh Standard – Winter Post",
    sub: "DBO sector · 12-man · −38°C",
    icon: "ac_unit",
    color: "#1E3A8A",
    bg: "#EFF6FF",
  },
  {
    id: "siachen_summer",
    label: "Siachen Base – Summer",
    sub: "Base camp · 8-man · High UV",
    icon: "wb_sunny",
    color: "#D97706",
    bg: "#FFFBEB",
  },
  {
    id: "kargil_medical",
    label: "Kargil Medical Post",
    sub: "Medical mission · 20°C target",
    icon: "medical_services",
    color: "#059669",
    bg: "#ECFDF5",
  },
];

function Row({ label, value, icon }: { label: string; value: ReactNode; icon?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-surface-container last:border-0">
      <dt className="flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant shrink-0">
        {icon && <span className="material-symbols-outlined text-[14px]">{icon}</span>}
        <T>{label}</T>
      </dt>
      <dd className="font-body-sm text-body-sm text-on-surface text-right">{value}</dd>
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
          <Link href={configuratorStepRoute(step)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-primary-container hover:bg-surface-container-low font-body-sm text-body-sm font-medium">
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
  const engineering = canUseEngineeringMode(CURRENT_USER.role);
  const runErrors = validateRun(draft.run, engineering);

  const count = (k: StepKey) => Object.keys(errors[k]).length;
  const allValid = (["site", "mission", "constraints", "economics"] as StepKey[]).every((k) => count(k) === 0) && Object.keys(runErrors).length === 0;

  const payload = { requirements: toRequirements(draft), run_options: toRunOptions(draft, engineering) };
  const json = JSON.stringify(payload, null, 2);

  function downloadJson() {
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
    try { localStorage.setItem(LAST_RUN_KEY, json); } catch { /* storage unavailable */ }
    setTimeout(() => router.push(ROUTES.candidateTelemetry), 800);
  }

  const s = draft.site;
  const m = draft.mission;
  const c = draft.constraints;
  const floors = FLOOR_OPTIONS.find((f) => f.value === c.maximum_floors)?.label ?? "";
  const hvacLabel = HVAC_MODES.find((h) => h.id === draft.run.hvac_mode)?.label ?? draft.run.hvac_mode;

  return (
    <div className="flex flex-col w-full">
      <ConfiguratorStepper current={5} title="Review & Launch Simulation" />

      <div className="w-full px-gutter-lg mt-6">
        <div className="max-w-[1720px] mx-auto flex flex-col gap-6">

          {/* Quick-start preset buttons (alternative to manual input) */}
          <div className="bg-gradient-to-r from-primary-fixed/30 to-surface-container-low border border-primary/20 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">rocket_launch</span>
              <div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  <T>One-Click Deployment Presets</T>
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  <T>Load a pre-configured template for a common DRDO scenario and launch immediately.</T>
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {QUICK_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={launch}
                  disabled={launching}
                  className="flex items-start gap-3 p-4 rounded-xl border border-outline-variant hover:border-primary hover-lift transition-all text-left group"
                  style={{ backgroundColor: preset.bg }}
                >
                  <span className="material-symbols-outlined text-[28px] mt-0.5" style={{ color: preset.color }}>{preset.icon}</span>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-headline-sm text-headline-sm text-on-surface font-bold text-sm leading-snug group-hover:underline">
                      {preset.label}
                    </span>
                    <span className="font-body-sm text-[11px] text-on-surface-variant">{preset.sub}</span>
                    <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: preset.color }}>
                      <span className="material-symbols-outlined text-[12px]">play_circle</span>
                      Launch with defaults
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Summary cards grid */}
            <div className="lg:col-span-7 grid grid-cols-1 xl:grid-cols-2 gap-5 content-start">

              <SummaryCard step={1} title="1. Site & Environmental Boundaries" icon="location_on" issues={count("site")}>
                <Row label="Coordinates" icon="my_location" value={<span className="font-data">{s.latitude_deg}°N, {s.longitude_deg}°E</span>} />
                <Row label="Site Elevation" icon="terrain" value={<span className="font-data">{s.elevation_m} m AMSL</span>} />
                <Row label="Ground Temp Mode" icon="landscape" value={<span className="font-data">Kusuda Permafrost Profile</span>} />
                <Row label="Film Coefficients (hi / ho)" icon="air" value={<span className="font-data">7.7 / 11.4 W/m²K</span>} />
                <Row label="Analysis Period" icon="date_range" value={<span className="font-data">{s.analysis_start} → {s.analysis_end}</span>} />
                <Row label="Weather Source" icon="cloud" value={<Labels ids={[s.weather_source]} from={WEATHER_SOURCES} />} />
              </SummaryCard>

              <SummaryCard step={2} title="2. Geometry & Spatial Dimensions" icon="architecture" issues={count("constraints")}>
                <Row label="Dimensions (L × W × H)" icon="square_foot" value={<span className="font-data">6.0m × 4.0m × 2.8m</span>} />
                <Row label="Floor Area & Volume" icon="deployed_code" value={<span className="font-data">24.0 m² · 67.2 m³ (A/V: 1.19)</span>} />
                <Row label="Number of Floors" icon="layers" value={<T>{floors}</T>} />
                <Row label="Capital Budget Limit" icon="payments" value={<span className="font-data">{Number(c.maximum_capex_inr) > 0 ? inr.format(Number(c.maximum_capex_inr)) : "—"}</span>} />
                <Row label="Envelope Thickness" icon="straighten" value={<span className="font-data">Wall 350mm · Roof 280mm</span>} />
                <Row label="Selected Materials" icon="category" value={<span className="text-right"><Labels ids={c.available_material_ids} from={MATERIALS} /></span>} />
              </SummaryCard>

              <SummaryCard step={3} title="3. Windows, Doors & Apertures" icon="window" issues={0}>
                <Row label="Window Count & Size" icon="grid_view" value={<span className="font-data">4 Units · 1.2m × 1.5m</span>} />
                <Row label="Glazing Area & WWR" icon="aspect_ratio" value={<span className="font-data">7.20 m² · WWR 14.5%</span>} />
                <Row label="Glazing Quality & Tilt" icon="solar_power" value={<span className="font-data">Triple Argon · South (0°)</span>} />
                <Row label="Entrance Doors & Airlock" icon="door_front" value={<span className="font-data">1 Insulated Door + Vestibule</span>} />
              </SummaryCard>

              <SummaryCard step={3} title="4. Internal Loads & Operating Scenario" icon="groups" issues={count("mission")}>
                <Row label="Mission / Use Type" icon="flag" value={<Labels ids={[m.type]} from={MISSION_TYPES} />} />
                <Row label="Occupancy & Metabolic Load" icon="person" value={<span className="font-data">{m.occupants} Troops · 120 W/soldier</span>} />
                <Row label="Initial Temp (T_initial)" icon="thermostat" value={<span className="font-data">+5.0°C</span>} />
                <Row label="Infiltration Rate (ACH)" icon="air" value={<span className="font-data">0.8 ACH</span>} />
                <Row label="Comfort Target" icon="thermostat_auto" value={<span className="font-data">{m.target_temperature_c}°C (Max {m.maximum_unmet_hours} hr/wk unmet)</span>} />
              </SummaryCard>

              <SummaryCard step={4} title="5. Auxiliary Heating & Optimization" icon="tune" issues={count("economics")}>
                <Row label="Auxiliary Heating Power" icon="local_fire_department" value={<span className="font-data">Medium (2,500 W) · Kerosene</span>} />
                <Row label="Simulation Mode" icon="settings" value={<T>{hvacLabel}</T>} />
                <Row label="Lifecycle Price Scenario" icon="payments" value={<Labels ids={[draft.economic_assumption_set_id]} from={ECONOMIC_ASSUMPTION_SETS} />} />
                {engineering && <Row label="Candidate Count" icon="data_array" value={<span className="font-data">{draft.run.candidate_count}</span>} />}
              </SummaryCard>

            </div>

            {/* Right column: launch actions */}
            <div className="lg:col-span-5 flex flex-col gap-5">

              {/* Launch card */}
              <div className="bg-gradient-to-br from-primary-container via-[#172554] to-primary rounded-xl p-6 shadow-feature flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-white text-[24px]">rocket_launch</span>
                  <h3 className="font-headline-md text-headline-md text-white font-bold">
                    <T>Launch Simulation</T>
                  </h3>
                </div>
                <p className="font-body-sm text-body-sm text-white/80">
                  <T>COCOON will run thermal analysis, solar energy modeling, heat flow calculations and ANSYS validation. Estimated time: 4–12 minutes.</T>
                </p>
                <div className="grid grid-cols-2 gap-2 text-white/80 text-xs">
                  {[
                    { icon: "settings", label: "3,200+ configurations evaluated" },
                    { icon: "filter_alt", label: "Top 120 candidates shortlisted" },
                    { icon: "verified", label: "ANSYS FEA on top picks" },
                    { icon: "summarize", label: "Full DRDO report generated" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[14px] text-white/60">{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
                {!allValid && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-error-container/80 text-on-error-container font-body-sm text-body-sm">
                    <span className="material-symbols-outlined text-[16px] shrink-0">error</span>
                    <T>Complete all steps marked "to fix" before launching.</T>
                  </div>
                )}
                <button
                  type="button"
                  disabled={!allValid || launching}
                  onClick={launch}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-primary font-bold text-sm hover:bg-slate-100 transition-all shadow-md hover-lift disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[20px]">{launching ? "hourglass_top" : "play_circle"}</span>
                  <T>{launching ? "Queuing Pareto Solver..." : "Launch Simulation"}</T>
                </button>
              </div>

              {/* Requirements JSON (for engineers) */}
              <details className="bg-surface-container-lowest rounded-xl shadow-card group">
                <summary className="flex items-center justify-between gap-2 p-5 cursor-pointer list-none">
                  <span className="flex items-center gap-2 font-headline-sm text-headline-sm text-on-surface font-semibold">
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
                    onClick={downloadJson}
                    className="hover-lift self-start inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium"
                  >
                    <span className="material-symbols-outlined text-[16px]">download</span>
                    <T>Download requirements.json</T>
                  </button>
                </div>
              </details>

            </div>
          </div>
        </div>
      </div>

      <WizardFooter
        step={5}
        nextLabel="Launch Simulation"
        onNext={launch}
        nextPending={launching}
        pendingLabel="Queuing Pareto Solver..."
        canProceed={allValid}
      />
    </div>
  );
}
