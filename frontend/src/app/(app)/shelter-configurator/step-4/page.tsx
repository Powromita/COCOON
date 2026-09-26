"use client";

import ConfiguratorStepper from "@/components/configurator/ConfiguratorStepper";
import WizardFooter from "@/components/configurator/WizardFooter";
import { useWizard } from "@/components/configurator/WizardProvider";
import { Field, RadioCards, SectionCard } from "@/components/configurator/fields";
import { ECONOMIC_ASSUMPTION_SETS, HVAC_MODES, type HvacMode } from "@/lib/configurator/requirements";
import { T } from "@/lib/i18n";
import { CURRENT_USER, canUseEngineeringMode } from "@/lib/session";

// Toggle items for optimization flags
const OPTIMIZATION_FLAGS = [
  {
    id: "minimize_fuel",
    label: "Minimize Fuel Consumption",
    desc: "Prioritize designs that need the least auxiliary heating fuel — critical for air-drop resupply logistics",
    icon: "local_fire_department",
    default: true,
    required: true,
  },
  {
    id: "minimize_weight",
    label: "Minimize Logistics Weight",
    desc: "Prefer lighter structures for easier helicopter transport and deployment",
    icon: "weight",
    default: true,
    required: false,
  },
  {
    id: "maximize_comfort",
    label: "Maximize Thermal Comfort Hours",
    desc: "Maximize the number of hours the interior stays at or above the comfort target",
    icon: "thermostat",
    default: true,
    required: false,
  },
  {
    id: "run_ansys",
    label: "Run ANSYS FEA Validation",
    desc: "High-fidelity finite element analysis on top candidates. Adds validation time but confirms results.",
    icon: "verified",
    default: false,
    required: false,
  },
  {
    id: "solar_analysis",
    label: "Include Solar Energy Analysis",
    desc: "Compute daily solar gain, Trombe wall harvest and GHI/DNI breakdown",
    icon: "solar_power",
    default: true,
    required: false,
  },
  {
    id: "multi_material",
    label: "Multi-Material Comparison",
    desc: "Compare performance across all selected materials — generates a comparative table in the report",
    icon: "compare",
    default: true,
    required: false,
  },
];

export default function ConfiguratorStep4Page() {
  const { draft, update, errors } = useWizard();
  const e = errors.economics;
  const engineering = canUseEngineeringMode(CURRENT_USER.role);

  return (
    <div className="flex flex-col w-full">
      <ConfiguratorStepper current={4} title="Optimization & Simulation Settings" />

      <div className="w-full px-gutter-lg mt-6">
        <div className="max-w-[1720px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 flex flex-col gap-5">

            {/* Optimization Objectives */}
            <SectionCard title="What should COCOON optimize for?" contractKey="optimization" icon="tune">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-5">
                <T>COCOON runs thousands of shelter configurations and finds the best trade-offs between these goals. Turn on all that matter for your mission.</T>
              </p>
              <div className="flex flex-col gap-3">
                {OPTIMIZATION_FLAGS.map((flag) => (
                  <label
                    key={flag.id}
                    className={`flex items-start justify-between gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${flag.required ? "border-primary/40 bg-primary-fixed/10" : "border-outline-variant hover:border-primary-container hover:bg-surface-container-low"}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`material-symbols-outlined text-[22px] mt-0.5 ${flag.required ? "text-primary" : "text-on-surface-variant"}`}>
                        {flag.icon}
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-2 font-headline-sm text-headline-sm text-on-surface font-semibold text-[13px]">
                          <T>{flag.label}</T>
                          {flag.required && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary text-on-primary uppercase tracking-wide">DRDO Required</span>
                          )}
                        </span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant">
                          <T>{flag.desc}</T>
                        </span>
                      </div>
                    </div>
                    <span className="relative inline-flex shrink-0 mt-0.5">
                      <input
                        type="checkbox"
                        role="switch"
                        defaultChecked={flag.default}
                        disabled={flag.required}
                        className="peer sr-only"
                      />
                      <span className="w-9 h-5 rounded-full bg-surface-container-high peer-checked:bg-primary-container transition-colors" />
                      <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-surface-container-lowest shadow transition-transform peer-checked:translate-x-4" />
                    </span>
                  </label>
                ))}
              </div>
            </SectionCard>

            {/* Auxiliary Heating Power & Fuel */}
            <SectionCard title="Auxiliary Heating &amp; Thermal Power" contractKey="auxiliary_heating" icon="local_fire_department">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Configure auxiliary heater power rating (Watts) and fuel selection for extreme sub-zero night survival.</T>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Auxiliary Heating Power (W)" hint="Preset levels or custom wattage">
                  <select className="w-full h-9 px-3 bg-surface-container-low border border-line rounded-lg text-xs text-on-surface font-medium" defaultValue="medium">
                    <option value="off">Off (0 W — 100% Passive Solar)</option>
                    <option value="low">Low (1,000 W / 1.0 kW)</option>
                    <option value="medium">Medium (2,500 W / 2.5 kW — Recommended)</option>
                    <option value="high">High (5,000 W / 5.0 kW — Extreme Cold)</option>
                  </select>
                </Field>

                <Field label="Heater Fuel Type" hint="Fuel supply logistics">
                  <select className="w-full h-9 px-3 bg-surface-container-low border border-line rounded-lg text-xs text-on-surface font-medium" defaultValue="kerosene">
                    <option value="kerosene">Kerosene / Bukkhari (Military Grade SKO)</option>
                    <option value="electric">Electric Heat Pump / Thermal Coil</option>
                    <option value="none">None (Passive Only)</option>
                  </select>
                </Field>
              </div>
            </SectionCard>

            {/* Simulation Mode */}
            <SectionCard title="Thermal Simulation Mode" contractKey="hvac_mode" icon="settings">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Choose how COCOON models the heating system. "Free-floating" measures passive performance only. "Conditioned" computes how much fuel a heater would need.</T>
              </p>
              <RadioCards<HvacMode>
                name="hvac_mode"
                columns={3}
                value={draft.run.hvac_mode}
                onChange={(v) => update("run", { hvac_mode: v })}
                options={HVAC_MODES.map((h) => ({ value: h.id, label: h.label, hint: h.hint }))}
              />
            </SectionCard>

            {/* Economic Assumption Set */}
            <SectionCard title="Cost & Lifecycle Economics" contractKey="economic_assumption_set_id" icon="payments">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Select the price scenario for calculating kerosene logistics cost, fuel savings, and total lifecycle cost vs. the legacy baseline shelter.</T>
              </p>
              <Field
                label="Price scenario for lifecycle costing"
                error={e.economic_assumption_set_id}
                hint="Each scenario is a versioned set of fuel, airlift and material price assumptions"
              >
                <RadioCards<string>
                  name="economic_assumption_set_id"
                  value={draft.economic_assumption_set_id}
                  onChange={(v) => update("economic_assumption_set_id", v)}
                  options={ECONOMIC_ASSUMPTION_SETS.map((s) => ({ value: s.id, label: s.label, hint: s.hint }))}
                />
              </Field>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: "Kerosene fuel price", value: "₹ 95/L", sub: "Expected scenario" },
                  { label: "Airlift logistics", value: "₹ 800/kg", sub: "Per sortic to DBO" },
                  { label: "Legacy baseline shelter", value: "GS-10 tent", sub: "Current DRDO reference" },
                ].map((item) => (
                  <div key={item.label} className="p-3 bg-surface-container-low rounded-xl flex flex-col gap-0.5">
                    <span className="font-body-sm text-[10px] text-on-surface-variant uppercase tracking-wide">{item.label}</span>
                    <span className="font-data text-base font-bold text-on-surface">{item.value}</span>
                    <span className="font-body-sm text-[11px] text-on-surface-variant">{item.sub}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

          </div>

          {/* Right Info Panel */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">info</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  <T>What happens next</T>
                </h3>
              </div>
              <div className="flex flex-col gap-3">
                {[
                  { icon: "settings", label: "RC Network Solver runs", sub: "3,200+ configurations evaluated in seconds" },
                  { icon: "filter_alt", label: "ML Surrogate filters results", sub: "Top 120 candidates shortlisted" },
                  { icon: "verified", label: "ANSYS FEA validates top picks", sub: "High-fidelity multi-physics solve" },
                  { icon: "balance", label: "Pareto frontier computed", sub: "Best trade-offs between all objectives" },
                  { icon: "summarize", label: "Full report generated", sub: "Technical dossier with all DRDO outputs" },
                ].map((item) => (
                  <div key={item.label} className="flex gap-3">
                    <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">{item.icon}</span>
                    <div className="flex flex-col">
                      <span className="font-body-sm text-body-sm text-on-surface font-medium">{item.label}</span>
                      <span className="font-body-sm text-[11px] text-on-surface-variant">{item.sub}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* DRDO outputs checklist */}
            <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-equilibrium text-[20px]">checklist</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  <T>DRDO PS 26051 Outputs</T>
                </h3>
              </div>
              <div className="flex flex-col gap-2">
                {[
                  "Task 1: Inside temperature prediction (24h chart)",
                  "Task 2: Solar thermal energy generated (daily)",
                  "Task 3: Heat flow vs ambient ΔT",
                  "Fossil fuel minimization & logistics savings",
                  "ANSYS FEA structural + thermal validation",
                  "Multi-material comparative analysis table",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-equilibrium text-[16px] mt-0.5">check_circle</span>
                    <span className="font-body-sm text-[11px] text-on-surface">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <WizardFooter step={4} canProceed={Object.keys(e).length === 0} />
    </div>
  );
}
