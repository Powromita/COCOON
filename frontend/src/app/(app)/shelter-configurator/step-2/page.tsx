"use client";

import ConfiguratorStepper from "@/components/configurator/ConfiguratorStepper";
import WizardFooter from "@/components/configurator/WizardFooter";
import { useWizard } from "@/components/configurator/WizardProvider";
import { ChipGroup, Field, NumberInput, RadioCards, SectionCard, Select } from "@/components/configurator/fields";
import { FLOOR_OPTIONS, HEATER_FUELS, MATERIALS, type HeaterFuel, type MaterialId, type MaxFloors } from "@/lib/configurator/requirements";
import { T } from "@/lib/i18n";

const SHELTER_SHAPES = [
  { value: "rectangular", label: "Rectangular", hint: "Standard box — easy to build, efficient floor use" },
  { value: "dome", label: "Dome / Igloo", hint: "Best snow load resistance, low surface area" },
  { value: "vaulted", label: "Barrel Vault", hint: "Good aerodynamics in high-wind zones" },
  { value: "hexagonal", label: "Hexagonal Pod", hint: "Modular — clusters well for multi-unit camps" },
];

export default function ConfiguratorStep2Page() {
  const { draft, update, errors } = useWizard();
  const c = draft.constraints;
  const e = errors.constraints;
  const set = (patch: Partial<typeof c>) => update("constraints", patch);

  const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  const capex = Number(c.maximum_capex_inr);
  const noPreference = c.preferred_orientation_deg === null;

  return (
    <div className="flex flex-col w-full">
      <ConfiguratorStepper current={2} title="Shelter Geometry & Spatial Architecture" />

      <div className="w-full px-gutter-lg mt-6">
        <div className="max-w-[1720px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 flex flex-col gap-5">

            {/* 1. Geometry & Spatial Dimensions */}
            <SectionCard title="1. Geometry &amp; Spatial Dimensions" contractKey="constraints" icon="square_foot">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Define primary shelter axes. COCOON computes the thermal volume, aspect ratio, and surface-to-volume ratio in real time.</T>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field
                  label="Length (L, East–West)"
                  contractKey="length_m"
                  htmlFor="length"
                  hint="Typical range: 3.5 m – 7.0 m"
                >
                  <NumberInput
                    id="length"
                    defaultValue="6.0"
                    min={3.5}
                    max={7.0}
                    step={0.1}
                    unit="m"
                  />
                </Field>

                <Field
                  label="Width (W, North–South)"
                  contractKey="width_m"
                  htmlFor="width"
                  hint="Typical range: 2.5 m – 5.0 m"
                >
                  <NumberInput
                    id="width"
                    defaultValue="4.0"
                    min={2.5}
                    max={5.0}
                    step={0.1}
                    unit="m"
                  />
                </Field>

                <Field
                  label="Height (H, Apex Ceiling)"
                  contractKey="height_m"
                  htmlFor="height"
                  hint="Typical range: 2.3 m – 3.0 m"
                >
                  <NumberInput
                    id="height"
                    defaultValue="2.8"
                    min={2.3}
                    max={3.0}
                    step={0.1}
                    unit="m"
                  />
                </Field>
              </div>

              {/* Derived Spatial Properties Box */}
              <div className="mt-4 p-4 rounded-xl bg-primary-fixed/20 border border-primary/20 flex flex-col gap-2">
                <span className="text-[11px] font-bold text-navy uppercase tracking-wider">
                  <T>Derived Spatial Properties (Physics Engine)</T>
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-on-surface-variant">Floor Area (A = L × W)</span>
                    <span className="text-sm font-bold text-navy font-data">24.0 m²</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-on-surface-variant">Enclosed Volume (V = L × W × H)</span>
                    <span className="text-sm font-bold text-navy font-data">67.2 m³</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-on-surface-variant">Aspect Ratio (L / W)</span>
                    <span className="text-sm font-bold text-navy font-data">1.50</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-on-surface-variant">Area-to-Volume (A/V Ratio)</span>
                    <span className="text-sm font-bold text-teal font-data">1.19 m⁻¹</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <Field
                  label="Maximum Ground Footprint"
                  contractKey="maximum_footprint_m2"
                  htmlFor="footprint"
                  error={e.maximum_footprint_m2}
                  hint="Maximum site boundary allocation"
                >
                  <NumberInput
                    id="footprint"
                    value={c.maximum_footprint_m2}
                    onChange={(v) => set({ maximum_footprint_m2: v })}
                    min={1}
                    unit="m²"
                    invalid={!!e.maximum_footprint_m2}
                  />
                </Field>
                <Field
                  label="Capital Budget"
                  contractKey="maximum_capex_inr"
                  htmlFor="capex"
                  error={c.maximum_capex_inr.trim() === "" ? undefined : e.maximum_capex_inr}
                  hint="Max construction budget per unit"
                >
                  <NumberInput
                    id="capex"
                    value={c.maximum_capex_inr}
                    onChange={(v) => set({ maximum_capex_inr: v })}
                    min={1}
                    step={1000}
                    unit="INR"
                    placeholder="2500000"
                    invalid={c.maximum_capex_inr.trim() !== "" && !!e.maximum_capex_inr}
                  />
                  {capex > 0 && <span className="font-data text-[11px] text-on-surface-variant">{inr.format(capex)}</span>}
                </Field>
              </div>

              <div className="mt-4">
                <Field label="Number of Floors / Storeys" contractKey="maximum_floors">
                  <RadioCards<MaxFloors>
                    name="maximum_floors"
                    value={c.maximum_floors}
                    onChange={(v) => set({ maximum_floors: v })}
                    options={FLOOR_OPTIONS.map((f) => ({ value: f.value, label: f.label }))}
                  />
                </Field>
              </div>
            </SectionCard>

            {/* Shelter Shape / Form */}
            <SectionCard title="Shelter Shape" contractKey="shape" icon="category">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Choose the geometric form. Each shape has different thermal mass, aerodynamic, and construction implications for cold-arid environments.</T>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {SHELTER_SHAPES.map((shape) => (
                  <button
                    key={shape.value}
                    type="button"
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-outline-variant hover:border-primary hover:bg-primary-fixed/10 transition-all text-center group"
                  >
                    <span className="material-symbols-outlined text-[32px] text-on-surface-variant group-hover:text-primary transition-colors">
                      {shape.value === "rectangular" ? "crop_square" :
                       shape.value === "dome" ? "sports_soccer" :
                       shape.value === "vaulted" ? "garage" : "hexagon"}
                    </span>
                    <span className="font-headline-sm text-headline-sm text-on-surface font-semibold text-sm">{shape.label}</span>
                    <span className="font-body-sm text-[11px] text-on-surface-variant leading-tight">{shape.hint}</span>
                  </button>
                ))}
              </div>
            </SectionCard>

            {/* Facade Orientation */}
            <SectionCard title="Main Facade Orientation" contractKey="preferred_orientation_deg" icon="explore">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>The direction the main entrance faces affects solar gain and wind exposure. South-facing (180°) maximizes passive solar heating in northern latitudes.</T>
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <label className="inline-flex items-center gap-2 font-body-sm text-body-sm text-on-surface cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={noPreference}
                    onChange={(ev) => set({ preferred_orientation_deg: ev.target.checked ? null : "180" })}
                    className="w-4 h-4 accent-primary-container"
                  />
                  <T>Let the optimizer choose the best orientation</T>
                </label>
                {!noPreference && (
                  <div className="sm:w-48">
                    <NumberInput
                      id="orientation"
                      value={c.preferred_orientation_deg ?? ""}
                      onChange={(v) => set({ preferred_orientation_deg: v })}
                      min={0}
                      max={360}
                      step={1}
                      unit="°"
                      invalid={!!e.preferred_orientation_deg}
                    />
                    <p className="text-[11px] text-on-surface-variant mt-1">0° = North · 90° = East · 180° = South · 270° = West</p>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Materials Selection & Layer Thickness */}
            <SectionCard title="Construction Envelope &amp; Multi-Layer Assemblies" contractKey="available_material_ids" icon="layers">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Select materials and specify layer thicknesses for Walls, Roof, and Floor (from outside to inside). The optimizer builds assemblies and computes thermal transmittance (U-value) and thermal mass (Cp, density).</T>
              </p>
              <div className="mb-3">
                <span className="text-xs font-bold text-navy uppercase tracking-wider block mb-2">Available Structural &amp; Insulation Materials:</span>
                <ChipGroup<MaterialId>
                  name="available_material_ids"
                  options={MATERIALS}
                  selected={c.available_material_ids}
                  onChange={(v) => set({ available_material_ids: v })}
                  invalid={!!e.available_material_ids}
                />
              </div>
              {e.available_material_ids && (
                <p className="text-error font-body-sm text-body-sm mt-2">{e.available_material_ids}</p>
              )}

              {/* Layer Thickness Inputs */}
              <div className="mt-4 pt-4 border-t border-surface-container flex flex-col gap-3">
                <span className="text-xs font-bold text-navy uppercase tracking-wider">Multi-Layer Assembly Thickness:</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field label="Wall Assembly Thickness" hint="Typical range: 250 – 650 mm">
                    <NumberInput id="wall_thick" defaultValue="350" min={250} max={650} step={10} unit="mm" />
                  </Field>
                  <Field label="Roof Assembly Thickness" hint="Typical range: 180 – 450 mm">
                    <NumberInput id="roof_thick" defaultValue="280" min={180} max={450} step={10} unit="mm" />
                  </Field>
                  <Field label="Floor / Plinth Thickness" hint="Typical range: 150 – 400 mm">
                    <NumberInput id="floor_thick" defaultValue="220" min={150} max={400} step={10} unit="mm" />
                  </Field>
                </div>
              </div>
            </SectionCard>

            {/* Heating Source */}
            <SectionCard title="Heating Energy Source" contractKey="heater_fuels" icon="local_fire_department">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Available fuel determines auxiliary heating options. Kerosene is common in high-altitude posts. Choose "None" for a fully passive (no heater) shelter design.</T>
              </p>
              <ChipGroup<HeaterFuel>
                name="heater_fuels"
                options={HEATER_FUELS}
                selected={c.heater_fuels}
                onChange={(v) => set({ heater_fuels: v })}
                exclusive="none"
                invalid={!!e.heater_fuels}
              />
              {e.heater_fuels && (
                <p className="text-error font-body-sm text-body-sm mt-2">{e.heater_fuels}</p>
              )}
            </SectionCard>

          </div>

          {/* Right Info Panel */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">architecture</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  <T>What gets generated</T>
                </h3>
              </div>
              <div className="flex flex-col gap-3">
                {[
                  { icon: "grid_view", label: "Room layout & sizing", sub: "Arranged within your footprint limits" },
                  { icon: "layers", label: "Wall, roof & floor assemblies", sub: "Built from your selected materials" },
                  { icon: "window", label: "Window placement & glazing", sub: "Optimized per orientation" },
                  { icon: "door_front", label: "Airlock & entry geometry", sub: "Thermal break at entry points" },
                  { icon: "air", label: "Airtightness & infiltration rate", sub: "Derived from construction type" },
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

            <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-thermal text-[20px]">tips_and_updates</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  <T>Ladakh cold-climate tips</T>
                </h3>
              </div>
              <div className="flex flex-col gap-2">
                {[
                  "PUF panels give the best insulation per kg — critical for air-drop logistics",
                  "South-facing (180°) entry maximizes passive solar heating in winter",
                  "Dome shapes shed snow loads better than flat or pitched roofs",
                  "Airlock entry is essential below −20°C to prevent cold drafts",
                ].map((tip, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="font-data text-[11px] text-primary font-bold shrink-0 mt-0.5">{i + 1}.</span>
                    <span className="font-body-sm text-[11px] text-on-surface-variant">{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <WizardFooter step={2} canProceed={Object.keys(e).length === 0} />
    </div>
  );
}
