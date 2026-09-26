"use client";

import ConfiguratorStepper from "@/components/configurator/ConfiguratorStepper";
import DerivedPanel from "@/components/configurator/DerivedPanel";
import WizardFooter from "@/components/configurator/WizardFooter";
import { useWizard } from "@/components/configurator/WizardProvider";
import { ChipGroup, Field, NumberInput, RadioCards, SectionCard } from "@/components/configurator/fields";
import { FLOOR_OPTIONS, HEATER_FUELS, MATERIALS, type HeaterFuel, type MaterialId, type MaxFloors } from "@/lib/configurator/requirements";
import { T } from "@/lib/i18n";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default function ConfiguratorStep3Page() {
  const { draft, update, errors } = useWizard();
  const c = draft.constraints;
  const e = errors.constraints;
  const set = (patch: Partial<typeof c>) => update("constraints", patch);
  const capex = Number(c.maximum_capex_inr);
  const noPreference = c.preferred_orientation_deg === null;

  return (
    <div className="flex flex-col w-full">
      <ConfiguratorStepper current={3} title="Constraints & Materials" />

      <div className="w-full px-gutter-lg mt-6">
        <div className="max-w-[1720px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 flex flex-col gap-5">
            <SectionCard title="Site & budget limits" contractKey="constraints" icon="square_foot">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Maximum footprint" contractKey="maximum_footprint_m2" htmlFor="footprint" error={e.maximum_footprint_m2}>
                  <NumberInput id="footprint" value={c.maximum_footprint_m2} onChange={(v) => set({ maximum_footprint_m2: v })} min={1} unit="m²" invalid={!!e.maximum_footprint_m2} />
                </Field>
                <Field
                  label="Capital budget"
                  contractKey="maximum_capex_inr"
                  htmlFor="capex"
                  // Required, but don't flag an untouched empty field — the hint explains it and Proceed stays disabled.
                  error={c.maximum_capex_inr.trim() === "" ? undefined : e.maximum_capex_inr}
                  hint={capex > 0 ? undefined : "Total capital cost ceiling for one shelter"}
                >
                  <NumberInput id="capex" value={c.maximum_capex_inr} onChange={(v) => set({ maximum_capex_inr: v })} min={1} step={1000} unit="INR" placeholder="2500000" invalid={c.maximum_capex_inr.trim() !== "" && !!e.maximum_capex_inr} />
                  {capex > 0 && <span className="font-data text-[11px] text-on-surface-variant">{inr.format(capex)}</span>}
                </Field>
              </div>
              <Field label="Maximum floors" contractKey="maximum_floors">
                <RadioCards<MaxFloors>
                  name="maximum_floors"
                  value={c.maximum_floors}
                  onChange={(v) => set({ maximum_floors: v })}
                  options={FLOOR_OPTIONS.map((f) => ({ value: f.value, label: f.label }))}
                />
              </Field>
            </SectionCard>

            <SectionCard title="Available materials" contractKey="available_material_ids" icon="layers">
              <Field
                label="Materials you can source for this deployment"
                error={e.available_material_ids}
                hint="The candidate generator builds wall, roof and floor assemblies only from these"
              >
                <ChipGroup<MaterialId>
                  name="available_material_ids"
                  options={MATERIALS}
                  selected={c.available_material_ids}
                  onChange={(v) => set({ available_material_ids: v })}
                  invalid={!!e.available_material_ids}
                />
              </Field>
            </SectionCard>

            <SectionCard title="Heating & orientation" contractKey="constraints" icon="local_fire_department">
              <Field label="Heater fuel availability" contractKey="heater_fuels" error={e.heater_fuels} hint="Choose “None” for a passive-only shelter">
                <ChipGroup<HeaterFuel>
                  name="heater_fuels"
                  options={HEATER_FUELS}
                  selected={c.heater_fuels}
                  onChange={(v) => set({ heater_fuels: v })}
                  exclusive="none"
                  invalid={!!e.heater_fuels}
                />
              </Field>
              <Field
                label="Preferred orientation"
                contractKey="preferred_orientation_deg"
                htmlFor="orientation"
                error={e.preferred_orientation_deg}
                hint="Azimuth of the main façade: 0° north, 90° east, 180° south, 270° west"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <label className="inline-flex items-center gap-2 font-body-sm text-body-sm text-on-surface cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={noPreference}
                      onChange={(ev) => set({ preferred_orientation_deg: ev.target.checked ? null : "180" })}
                      className="w-4 h-4 accent-primary-container"
                    />
                    <T>No preference — let the optimizer choose</T>
                  </label>
                  {!noPreference && (
                    <div className="sm:w-40">
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
                    </div>
                  )}
                </div>
              </Field>
            </SectionCard>
          </div>

          <div className="lg:col-span-4">
            <DerivedPanel
              module="M2 · M6"
              items={[
                "Wall, roof, floor, glazing and insulation assemblies from your materials",
                "Window count, area, glazing and placement per candidate",
                "Floor count when “System decides” is selected",
                "Heater capacity and control strategy",
                "Airtightness and infiltration from the construction",
              ]}
            />
          </div>
        </div>
      </div>

      <WizardFooter step={3} canProceed={Object.keys(e).length === 0} />
    </div>
  );
}
