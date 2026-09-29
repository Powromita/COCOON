"use client";

import ConfiguratorStepper from "@/components/configurator/ConfiguratorStepper";
import WizardFooter from "@/components/configurator/WizardFooter";
import { useWizard } from "@/components/configurator/WizardProvider";
import { Field, NumberInput, SectionCard, Select } from "@/components/configurator/fields";
import {
  HEATER_FUELS,
  MATERIALS,
  type HeaterFuel,
  type MaterialId,
} from "@/lib/configurator/requirements";
import { T } from "@/lib/i18n";

const FLOOR_CHOICES = [
  { value: "1", label: "1 Floor" },
  { value: "2", label: "Up to 2 Floors" },
  { value: "3", label: "Up to 3 Floors" },
  { value: "4", label: "Up to 4 Floors" },
  { value: "5", label: "Up to 5 Floors" },
];

export default function ConfiguratorStep3Page() {
  const { draft, update, errors } = useWizard();
  const c = draft.constraints;
  const e = errors.constraints;
  const set = (patch: Partial<typeof c>) => update("constraints", patch);

  const selectCoreOnly = () => {
    set({ available_material_ids: ["mat_stone", "mat_puf", "mat_plywood", "mat_concrete"] });
  };

  const selectAllMaterials = () => {
    set({ available_material_ids: MATERIALS.map((m) => m.id) });
  };

  return (
    <div className="flex flex-col w-full">
      <ConfiguratorStepper current={3} title="Site Limits & Constraints" />

      <div className="w-full px-gutter-lg mt-6">
        <div className="max-w-[1720px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 flex flex-col gap-5">

            {/* Footprint, Floors & Capital Budget */}
            <SectionCard title="Physical &amp; Financial Boundaries" contractKey="constraints" icon="rule">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Enforce site ground footprint, vertical elevation limit, and capital budget cap.</T>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field
                  label="Maximum Footprint (maximum_footprint_m2)"
                  contractKey="maximum_footprint_m2"
                  htmlFor="footprint"
                  error={e.maximum_footprint_m2}
                  hint="Upper ground area limit in m²"
                >
                  <NumberInput
                    id="footprint"
                    value={c.maximum_footprint_m2}
                    onChange={(v) => set({ maximum_footprint_m2: v })}
                    min={1}
                    max={5000}
                    step={1}
                    unit="m²"
                    invalid={!!e.maximum_footprint_m2}
                  />
                </Field>

                <Field
                  label="Maximum Floors (maximum_floors)"
                  contractKey="maximum_floors"
                  htmlFor="floors"
                  error={e.maximum_floors}
                  hint="Max vertical levels (1 to 5)"
                >
                  <Select
                    id="floors"
                    value={String(c.maximum_floors)}
                    onChange={(v) => set({ maximum_floors: Number(v) })}
                    options={FLOOR_CHOICES}
                    invalid={!!e.maximum_floors}
                  />
                </Field>

                <Field
                  label="Budget Ceiling (maximum_capex_inr)"
                  contractKey="maximum_capex_inr"
                  htmlFor="capex"
                  error={e.maximum_capex_inr}
                  hint="Upper capital expenditure bound"
                >
                  <NumberInput
                    id="capex"
                    value={c.maximum_capex_inr}
                    onChange={(v) => set({ maximum_capex_inr: v })}
                    min={10000}
                    step={50000}
                    unit="₹"
                    invalid={!!e.maximum_capex_inr}
                  />
                </Field>
              </div>
            </SectionCard>

            {/* Approved Envelope Materials (All 10 Materials) */}
            <SectionCard title="Approved Material IDs (available_material_ids)" contractKey="constraints.materials" icon="category">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  <T>Materials permitted for structural framing, masonry walls, roof decking, and insulation layers (10 available).</T>
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={selectCoreOnly}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    <T>Core 4 Only</T>
                  </button>
                  <span className="text-outline-variant">·</span>
                  <button
                    type="button"
                    onClick={selectAllMaterials}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    <T>Select All (10)</T>
                  </button>
                </div>
              </div>

              <Field
                label="Available Materials Catalog"
                error={e.available_material_ids}
                hint="Must include at least one structural and one roof-capable material"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {MATERIALS.map((mat) => {
                    const isSelected = c.available_material_ids.includes(mat.id);
                    return (
                      <button
                        key={mat.id}
                        type="button"
                        onClick={() => {
                          const next = isSelected
                            ? c.available_material_ids.filter((id) => id !== mat.id)
                            : [...c.available_material_ids, mat.id];
                          set({ available_material_ids: next });
                        }}
                        className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-colors ${
                          isSelected
                            ? "border-primary bg-primary-fixed/15 shadow-sm"
                            : "border-outline-variant bg-surface-container-lowest hover:border-primary/50"
                        }`}
                      >
                        <span className={`material-symbols-outlined text-[20px] mt-0.5 ${isSelected ? "text-primary" : "text-outline"}`}>
                          {isSelected ? "check_box" : "check_box_outline_blank"}
                        </span>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-body-sm font-semibold text-on-surface">{mat.label}</span>
                            <span className="font-label-mono-xs text-[9px] px-1.5 py-0.2 bg-surface-container text-on-surface-variant rounded">
                              {mat.category}
                            </span>
                          </div>
                          <span className="font-body-sm text-[11px] text-on-surface-variant mt-0.5">{mat.hint}</span>
                          <span className="font-label-mono-xs text-[10px] text-outline mt-1">{mat.id}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {!c.available_material_ids.some((id) => id === "mat_concrete" || id === "mat_plywood" || id === "mat_wood_timber" || id === "mat_reinforced_concrete") && c.available_material_ids.length > 0 && (
                  <div className="mt-3 p-3 rounded-lg bg-warning/10 border border-warning/30 flex items-start gap-2.5">
                    <span className="material-symbols-outlined text-[18px] text-warning shrink-0 mt-0.5">warning</span>
                    <div className="font-body-sm text-xs text-on-surface leading-relaxed">
                      <strong className="text-warning">Roof &amp; Partition Material Required:</strong> Shelter roofs and interior room partitions cannot be built from raw stone or rammed earth alone. Please enable at least one structural framing/slab material: <strong>Concrete</strong>, <strong>Plywood</strong>, or <strong>Timber</strong>.
                    </div>
                  </div>
                )}
              </Field>
            </SectionCard>

            {/* Allowed Heating Fuels (with No Fuel Needed / Passive Solar) */}
            <SectionCard title="Allowed Heating Fuels (heater_fuels)" contractKey="constraints.heater_fuels" icon="local_fire_department">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Permitted fuels for auxiliary thermal support systems, or select "None" for 100% passive solar design.</T>
              </p>
              <Field
                label="Heating Energy Options"
                error={e.heater_fuels}
                hint="Select heating sources available at the post"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {HEATER_FUELS.map((fuel) => {
                    const isSelected = c.heater_fuels.includes(fuel.id);
                    return (
                      <button
                        key={fuel.id}
                        type="button"
                        onClick={() => {
                          const next = isSelected
                            ? c.heater_fuels.filter((f) => f !== fuel.id)
                            : [...c.heater_fuels, fuel.id];
                          set({ heater_fuels: next });
                        }}
                        className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-colors ${
                          isSelected
                            ? "border-primary bg-primary-fixed/15 shadow-sm"
                            : "border-outline-variant bg-surface-container-lowest hover:border-primary/50"
                        }`}
                      >
                        <span className={`material-symbols-outlined text-[20px] mt-0.5 ${isSelected ? "text-primary" : "text-outline"}`}>
                          {isSelected ? "check_box" : "check_box_outline_blank"}
                        </span>
                        <div className="flex flex-col">
                          <span className="font-body-sm font-semibold text-on-surface">{fuel.label}</span>
                          <span className="font-body-sm text-[11px] text-on-surface-variant mt-0.5">{fuel.hint}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Field>
            </SectionCard>

            {/* Logistics Constraints: Mass & Assembly Time */}
            <SectionCard title="Logistics &amp; Field Assembly Targets" contractKey="constraints.logistics" icon="local_shipping">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Operational constraints for air-lift logistics and rapid field erection.</T>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Max Total Weight (maximum_mass_kg)"
                  contractKey="maximum_mass_kg"
                  htmlFor="mass"
                  error={e.maximum_mass_kg}
                  hint="Logistical airlift/transport weight limit in kg"
                >
                  <NumberInput
                    id="mass"
                    value={c.maximum_mass_kg}
                    onChange={(v) => set({ maximum_mass_kg: v })}
                    min={100}
                    step={250}
                    unit="kg"
                    invalid={!!e.maximum_mass_kg}
                  />
                  {c.maximum_mass_kg.trim() !== "" &&
                    Number(c.maximum_mass_kg) < 35000 &&
                    c.available_material_ids.some((id) =>
                      ["mat_stone", "mat_concrete", "mat_adobe", "mat_rammed_earth", "mat_reinforced_concrete"].includes(id)
                    ) && (
                      <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-start gap-1.5 leading-tight">
                        <span className="leading-normal">
                          Caution: Stone, concrete, and earth envelopes typically weigh 40,000–80,000 kg. A {c.maximum_mass_kg} kg limit may cause the solver to reject all candidates. Leave blank if mass is unconstrained.
                        </span>
                      </div>
                    )}
                </Field>
                <Field
                  label="Max Assembly Time (max_assembly_time_hours)"
                  contractKey="max_assembly_time_hours"
                  htmlFor="assembly"
                  error={e.max_assembly_time_hours}
                  hint="Field erection time target in hours"
                >
                  <NumberInput
                    id="assembly"
                    value={c.max_assembly_time_hours}
                    onChange={(v) => set({ max_assembly_time_hours: v })}
                    min={1}
                    step={1}
                    unit="hours"
                    invalid={!!e.max_assembly_time_hours}
                  />
                </Field>
              </div>
            </SectionCard>

          </div>

          {/* Right Summary Info */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">info</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  <T>Phase 03: Constraints</T>
                </h3>
              </div>
              <div className="flex flex-col gap-3">
                {[
                  { icon: "crop_free", label: "Footprint Bound", sub: "Constrains envelope plan layout" },
                  { icon: "layers", label: "Max Floors", sub: "Restricts vertical levels (1 to 5)" },
                  { icon: "attach_money", label: "CapEx Ceiling", sub: "Filters out uneconomical envelopes" },
                  { icon: "category", label: "10 Materials Available", sub: "Core + extended traditional & RCC options" },
                  { icon: "local_fire_department", label: "Heating & Passive Mode", sub: "Kerosene, electric or passive solar (no fuel)" },
                  { icon: "local_shipping", label: "Logistics Ceiling", sub: "Helicopter payload and airlift mass cap" },
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
          </div>

        </div>
      </div>

      <WizardFooter step={3} canProceed={Object.keys(e).length === 0} />
    </div>
  );
}
