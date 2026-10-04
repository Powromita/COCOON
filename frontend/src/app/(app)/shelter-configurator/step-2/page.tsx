"use client";

import ConfiguratorStepper from "@/components/configurator/ConfiguratorStepper";
import WizardFooter from "@/components/configurator/WizardFooter";
import { useWizard } from "@/components/configurator/WizardProvider";
import { ChipGroup, Field, NumberInput, RadioCards, SectionCard } from "@/components/configurator/fields";
import { MISSION_TYPES, ROOM_TYPES, type MissionType, type RoomType } from "@/lib/configurator/requirements";
import { T } from "@/lib/i18n";

export default function ConfiguratorStep2Page() {
  const { draft, update, errors } = useWizard();
  const m = draft.mission;
  const e = errors.mission;
  const set = (patch: Partial<typeof m>) => update("mission", patch);

  return (
    <div className="flex flex-col w-full">
      <ConfiguratorStepper current={2} title="Mission & Occupancy Requirements" />

      <div className="w-full px-gutter-lg mt-6">
        <div className="max-w-[1720px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 flex flex-col gap-5">

            {/* Mission Type */}
            <SectionCard title="Mission Type (type)" contractKey="mission.type" icon="military_tech">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Select the operational mission category for the high-altitude post.</T>
              </p>
              <RadioCards<MissionType>
                name="mission_type"
                value={m.type}
                onChange={(v) => set({ type: v })}
                options={MISSION_TYPES.map((t) => ({ value: t.id, label: t.label, hint: t.hint }))}
              />
            </SectionCard>

            {/* Troop Count / Occupants */}
            <SectionCard title="Troop Count / Occupancy (occupants)" contractKey="mission.occupants" icon="groups">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Nominal number of soldiers/personnel accommodated in the shelter.</T>
              </p>
              <Field
                label="Occupants Count (occupants)"
                contractKey="occupants"
                htmlFor="occupants"
                error={e.occupants}
                hint="Total troops stationed (≥ 0)"
              >
                <NumberInput
                  id="occupants"
                  value={m.occupants}
                  onChange={(v) => set({ occupants: v })}
                  min={0}
                  max={500}
                  step={1}
                  unit="personnel"
                  invalid={!!e.occupants}
                />
              </Field>
            </SectionCard>

            {/* Required Rooms */}
            <SectionCard title="Required Rooms (required_rooms)" contractKey="mission.required_rooms" icon="meeting_room">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Select all functional room and zone subdivisions required within the shelter envelope.</T>
              </p>
              <Field
                label="Functional Rooms"
                error={e.required_rooms}
                hint="Select all rooms that must be accommodated"
              >
                <ChipGroup<RoomType>
                  name="required_rooms"
                  options={ROOM_TYPES}
                  selected={m.required_rooms}
                  onChange={(v) => set({ required_rooms: v })}
                  invalid={!!e.required_rooms}
                />
              </Field>
            </SectionCard>

            {/* Thermal Comfort Target & Limits */}
            <SectionCard title="Thermal Comfort &amp; Limits" contractKey="mission.target_*" icon="thermostat">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Indoor thermal setpoint and allowable cold excursion thresholds.</T>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Target Indoor Temperature (target_temperature_c)"
                  contractKey="target_temperature_c"
                  htmlFor="target_temp"
                  error={e.target_temperature_c}
                  hint="Desired baseline setpoint (typically 15.0 °C to 21.0 °C)"
                >
                  <NumberInput
                    id="target_temp"
                    value={m.target_temperature_c}
                    onChange={(v) => set({ target_temperature_c: v })}
                    min={5}
                    max={30}
                    step={0.5}
                    unit="°C"
                    invalid={!!e.target_temperature_c}
                  />
                </Field>
                <Field
                  label="Maximum Unmet Hours (maximum_unmet_hours)"
                  contractKey="maximum_unmet_hours"
                  htmlFor="unmet"
                  error={e.maximum_unmet_hours}
                  hint="Allowable cumulative hours below target threshold"
                >
                  <NumberInput
                    id="unmet"
                    value={m.maximum_unmet_hours}
                    onChange={(v) => set({ maximum_unmet_hours: v })}
                    min={0}
                    max={168}
                    step={1}
                    unit="hours"
                    invalid={!!e.maximum_unmet_hours}
                  />
                </Field>
              </div>
            </SectionCard>

          </div>

          {/* Right Info Panel */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">info</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  <T>Phase 02: Operational Profile</T>
                </h3>
              </div>
              <div className="flex flex-col gap-3">
                {[
                  { icon: "badge", label: "Mission Designation", sub: "Establishes interior spatial workflow and partition rules" },
                  { icon: "groups", label: "Occupancy Heat Generation", sub: "Engine models ~75W sensible heat per soldier" },
                  { icon: "thermostat", label: "Thermal Envelope Evaluation", sub: "Tests against target temperature and unmet hour limits" },
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

      <WizardFooter step={2} canProceed={Object.keys(e).length === 0} />
    </div>
  );
}
