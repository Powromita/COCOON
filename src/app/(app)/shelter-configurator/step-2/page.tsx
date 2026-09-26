"use client";

import ConfiguratorStepper from "@/components/configurator/ConfiguratorStepper";
import DerivedPanel from "@/components/configurator/DerivedPanel";
import WizardFooter from "@/components/configurator/WizardFooter";
import { useWizard } from "@/components/configurator/WizardProvider";
import { ChipGroup, Field, NumberInput, Select, SectionCard } from "@/components/configurator/fields";
import { MISSION_TYPES, ROOM_TYPES, type MissionType, type RoomType } from "@/lib/configurator/requirements";

export default function ConfiguratorStep2Page() {
  const { draft, update, errors } = useWizard();
  const m = draft.mission;
  const e = errors.mission;
  const set = (patch: Partial<typeof m>) => update("mission", patch);

  return (
    <div className="flex flex-col w-full">
      <ConfiguratorStepper current={2} title="Mission & Occupancy" />

      <div className="w-full px-gutter-lg mt-6">
        <div className="max-w-[1720px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 flex flex-col gap-5">
            <SectionCard title="Mission" contractKey="mission" icon="flag">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Mission type" contractKey="type" htmlFor="mission-type">
                  <Select<MissionType>
                    id="mission-type"
                    value={m.type}
                    onChange={(v) => set({ type: v })}
                    options={MISSION_TYPES.map((t) => ({ value: t.id, label: t.label }))}
                  />
                </Field>
                <Field label="Occupants" contractKey="occupants" htmlFor="occupants" error={e.occupants} hint="Whole number, 1–500">
                  <NumberInput id="occupants" value={m.occupants} onChange={(v) => set({ occupants: v })} min={1} max={500} step={1} unit="pax" invalid={!!e.occupants} />
                </Field>
              </div>
            </SectionCard>

            <SectionCard title="Required rooms" contractKey="required_rooms" icon="meeting_room">
              <Field label="Room types the shelter must contain" error={e.required_rooms} hint="The layout generator sizes and arranges these rooms within your footprint">
                <ChipGroup<RoomType>
                  name="required_rooms"
                  options={ROOM_TYPES}
                  selected={m.required_rooms}
                  onChange={(v) => set({ required_rooms: v })}
                  invalid={!!e.required_rooms}
                />
              </Field>
            </SectionCard>

            <SectionCard title="Comfort target" contractKey="mission.target_*" icon="thermostat">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Target indoor temperature" contractKey="target_temperature_c" htmlFor="target" error={e.target_temperature_c}>
                  <NumberInput id="target" value={m.target_temperature_c} onChange={(v) => set({ target_temperature_c: v })} min={5} max={30} step={0.5} unit="°C" invalid={!!e.target_temperature_c} />
                </Field>
                <Field
                  label="Acceptable hours below target"
                  contractKey="maximum_unmet_hours"
                  htmlFor="unmet"
                  error={e.maximum_unmet_hours}
                  hint="Per week, across occupied rooms"
                >
                  <NumberInput id="unmet" value={m.maximum_unmet_hours} onChange={(v) => set({ maximum_unmet_hours: v })} min={0} max={168} step={1} unit="h/wk" invalid={!!e.maximum_unmet_hours} />
                </Field>
              </div>
            </SectionCard>
          </div>

          <div className="lg:col-span-4">
            <DerivedPanel
              module="M2 · M4"
              items={[
                "Occupancy schedule (continuous by default)",
                "Internal heat gains from occupants × metabolic schedule",
                "Room count, sizes and arrangement",
                "Airlock placement, doors and partitions",
                "Initial indoor temperature (physics warm-up)",
              ]}
            />
          </div>
        </div>
      </div>

      <WizardFooter step={2} canProceed={Object.keys(e).length === 0} />
    </div>
  );
}
