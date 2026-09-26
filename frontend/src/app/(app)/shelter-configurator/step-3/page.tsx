"use client";

import ConfiguratorStepper from "@/components/configurator/ConfiguratorStepper";
import WizardFooter from "@/components/configurator/WizardFooter";
import { useWizard } from "@/components/configurator/WizardProvider";
import { ChipGroup, Field, NumberInput, RadioCards, SectionCard } from "@/components/configurator/fields";
import { MISSION_TYPES, ROOM_TYPES, type MissionType, type RoomType } from "@/lib/configurator/requirements";
import { T } from "@/lib/i18n";

// Glazing options
const GLAZING_TYPES = [
  { id: "single", label: "Single Pane", hint: "U=5.8 W/m²K — lightest, least insulating" },
  { id: "double", label: "Double Glazed", hint: "U=2.8 W/m²K — standard choice" },
  { id: "triple", label: "Triple Glazed", hint: "U=1.0 W/m²K — best for extreme cold" },
  { id: "none", label: "No Windows", hint: "Fully opaque envelope — maximum insulation" },
];

export default function ConfiguratorStep3Page() {
  const { draft, update, errors } = useWizard();
  const m = draft.mission;
  const e = errors.mission;
  const set = (patch: Partial<typeof m>) => update("mission", patch);

  return (
    <div className="flex flex-col w-full">
      <ConfiguratorStepper current={3} title="Glazing, Troops & Operational Loads" />

      <div className="w-full px-gutter-lg mt-6">
        <div className="max-w-[1720px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 flex flex-col gap-5">

            {/* 2. Windows, Doors & Apertures */}
            <SectionCard title="2. Windows, Doors &amp; Apertures" contractKey="glazing" icon="window">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Configure glazing units, window orientation, and door airlocks. Solar transposition calculates direct and diffuse radiation harvest.</T>
              </p>

              {/* Number of Windows & Dimensions */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
                <Field label="Number of Windows (count)" hint="1 – 8 (up to 20 in full spec)">
                  <NumberInput id="win_count" defaultValue="4" min={0} max={20} step={1} unit="units" />
                </Field>
                <Field label="Window Width (W, m)" hint="e.g. 1.2 m">
                  <NumberInput id="win_w" defaultValue="1.2" min={0.4} max={3.0} step={0.1} unit="m" />
                </Field>
                <Field label="Window Height (H, m)" hint="e.g. 1.5 m">
                  <NumberInput id="win_h" defaultValue="1.5" min={0.4} max={3.0} step={0.1} unit="m" />
                </Field>
                <Field label="Window Orientation" hint="Azimuth / solar priority">
                  <select className="w-full h-9 px-3 bg-surface-container-low border border-line rounded-lg text-xs text-on-surface font-medium" defaultValue="south">
                    <option value="south">south (Azimuth 0°, Tilt 90°)</option>
                    <option value="east">east (Azimuth -90°, Tilt 90°)</option>
                    <option value="west">west (Azimuth +90°, Tilt 90°)</option>
                    <option value="north">north (Azimuth 180°, Tilt 90°)</option>
                    <option value="horizontal">horizontal (Tilt 0°, Skylight)</option>
                  </select>
                </Field>
              </div>

              {/* Derived Glazing Area & WWR % */}
              <div className="p-3 bg-surface-container-low rounded-xl border border-line grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                <div>
                  <span className="text-[10px] text-on-surface-variant uppercase font-medium">Total Glazing Area (A_win)</span>
                  <p className="text-sm font-bold text-navy font-data mt-0.5">7.20 m²</p>
                </div>
                <div>
                  <span className="text-[10px] text-on-surface-variant uppercase font-medium">Window-to-Wall Ratio (WWR)</span>
                  <p className="text-sm font-bold text-teal font-data mt-0.5">14.5%</p>
                </div>
                <div>
                  <span className="text-[10px] text-on-surface-variant uppercase font-medium">Solar Direct Transmittance</span>
                  <p className="text-sm font-bold text-equilibrium font-data mt-0.5">914 W/m² (Ladakh Peak)</p>
                </div>
              </div>

              {/* Glazing Quality Selection */}
              <span className="text-xs font-bold text-navy uppercase tracking-wider block mb-2">Glazing Type / Quality:</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {GLAZING_TYPES.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-outline-variant hover:border-primary hover:bg-primary-fixed/10 transition-all text-center group"
                  >
                    <span className="material-symbols-outlined text-[32px] text-on-surface-variant group-hover:text-primary transition-colors">
                      {g.id === "none" ? "block" : "window"}
                    </span>
                    <span className="font-headline-sm text-headline-sm text-on-surface font-semibold text-sm">{g.label}</span>
                    <span className="font-body-sm text-[11px] text-on-surface-variant leading-tight">{g.hint}</span>
                  </button>
                ))}
              </div>

              {/* Doors & Vents */}
              <div className="mt-4 pt-4 border-t border-surface-container grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Door Count &amp; Type" hint="1 – 3 entrance doors">
                  <div className="flex gap-2">
                    <NumberInput id="door_count" defaultValue="1" min={1} max={3} step={1} unit="doors" />
                    <select className="w-full h-9 px-3 bg-surface-container-low border border-line rounded-lg text-xs text-on-surface font-medium" defaultValue="insulated">
                      <option value="insulated">Insulated Thermal Door (U=1.1)</option>
                      <option value="single">Single Leaf Standard Door</option>
                    </select>
                  </div>
                </Field>
                <div className="flex flex-col gap-2 p-3 bg-surface-container-low rounded-xl">
                  <span className="text-xs font-bold text-navy flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-secondary">door_front</span>
                    Entry Vestibule / Airlock
                  </span>
                  <label className="inline-flex items-center gap-2 text-xs text-on-surface cursor-pointer">
                    <input type="checkbox" defaultChecked className="w-4 h-4 accent-primary" />
                    Include Thermal Airlock Vestibule
                  </label>
                </div>
              </div>
            </SectionCard>

            {/* 3. Internal Thermal Loads & Operating Scenario */}
            <SectionCard title="3. Internal Thermal Loads &amp; Operating Scenario" contractKey="mission" icon="groups">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Configure troop occupancy, metabolic heat output (80–120 W/soldier), infiltration rate (ACH), initial temperature, and internal thermal capacitance.</T>
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <Field label="Occupancy Count" contractKey="occupants" htmlFor="occupants" error={e.occupants} hint="Personnel in shelter">
                  <NumberInput id="occupants" value={m.occupants} onChange={(v) => set({ occupants: v })} min={1} max={500} step={1} unit="persons" invalid={!!e.occupants} />
                </Field>

                <Field label="Metabolic Load per Person" hint="Typical: 80 W (sleep) to 120 W (active)">
                  <select className="w-full h-9 px-3 bg-surface-container-low border border-line rounded-lg text-xs text-on-surface font-medium" defaultValue="120">
                    <option value="80">80 W / person (Rest / Sleeping)</option>
                    <option value="100">100 W / person (Light Activity)</option>
                    <option value="120">120 W / person (Active Occupancy)</option>
                  </select>
                </Field>

                <Field label="Initial Indoor Temp (T_initial)" hint="Range: -10°C to +22°C">
                  <NumberInput id="t_init" defaultValue="5.0" min={-10} max={22} step={0.5} unit="°C" />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 pt-3 border-t border-surface-container">
                <Field label="Infiltration Rate (ACH)" hint="Air Changes/Hour (0.5 – 2.0 ACH)">
                  <NumberInput id="ach" defaultValue="0.8" min={0.5} max={2.0} step={0.1} unit="ACH" />
                </Field>

                <Field label="Contents Mass (kg)" hint="Bunks, gear, equipment">
                  <NumberInput id="contents_mass" defaultValue="1200" min={100} max={10000} step={50} unit="kg" />
                </Field>

                <Field label="Specific Heat (Cp, J/kg·K)" hint="Thermal capacitance">
                  <NumberInput id="contents_cp" defaultValue="1400" min={500} max={3000} step={50} unit="J/kg·K" />
                </Field>
              </div>

              {m.occupants && Number(m.occupants) > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-primary-fixed/20 rounded-lg">
                  <span className="material-symbols-outlined text-[16px] text-thermal">thermostat</span>
                  <span className="font-body-sm text-[11px] text-on-surface">
                    Continuous internal biological heat load: <span className="font-data font-semibold text-thermal">{(Number(m.occupants) * 120).toFixed(0)} W</span>
                    <span className="text-on-surface-variant"> (@ 120 W/soldier metabolic output)</span>
                  </span>
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-surface-container">
                <Field label="Required Room Sub-Divisions" error={e.required_rooms} hint="Select all functional spaces">
                  <ChipGroup<RoomType>
                    name="required_rooms"
                    options={ROOM_TYPES}
                    selected={m.required_rooms}
                    onChange={(v) => set({ required_rooms: v })}
                    invalid={!!e.required_rooms}
                  />
                </Field>
              </div>
            </SectionCard>

            {/* Comfort / Thermal Target */}
            <SectionCard title="Comfort Target & Thermal Limits" contractKey="mission.target_*" icon="thermostat">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>The simulation will check if the shelter can maintain the target temperature. Standard DRDO requirement is 18–22°C for sleeping quarters.</T>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Target Indoor Temperature" contractKey="target_temperature_c" htmlFor="target" error={e.target_temperature_c} hint="Minimum acceptable interior temperature">
                  <NumberInput
                    id="target"
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
                  label="Allowable Hours Below Target"
                  contractKey="maximum_unmet_hours"
                  htmlFor="unmet"
                  error={e.maximum_unmet_hours}
                  hint="Per week — 0 means always above target"
                >
                  <NumberInput
                    id="unmet"
                    value={m.maximum_unmet_hours}
                    onChange={(v) => set({ maximum_unmet_hours: v })}
                    min={0}
                    max={168}
                    step={1}
                    unit="hr/week"
                    invalid={!!e.maximum_unmet_hours}
                  />
                </Field>
              </div>
              {m.target_temperature_c && (
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    { label: "ΔT from outside (Ladakh winter)", value: `+${(Number(m.target_temperature_c) - (-38)).toFixed(0)}°C`, color: "text-thermal" },
                    { label: "Thermal comfort zone", value: `${m.target_temperature_c}–${(Number(m.target_temperature_c) + 4).toFixed(0)}°C`, color: "text-equilibrium" },
                    { label: "Hypothermia risk below", value: "15°C", color: "text-primary" },
                  ].map((stat) => (
                    <div key={stat.label} className="p-3 bg-surface-container-low rounded-xl flex flex-col gap-1">
                      <span className={`font-data text-lg font-bold ${stat.color}`}>{stat.value}</span>
                      <span className="font-body-sm text-[10px] text-on-surface-variant leading-tight">{stat.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

          </div>

          {/* Right info panel */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">info</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  <T>What gets calculated</T>
                </h3>
              </div>
              <div className="flex flex-col gap-3">
                {[
                  { icon: "schedule", label: "Occupancy schedule", sub: "Continuous occupancy by default" },
                  { icon: "thermostat", label: "Internal heat gains", sub: "Metabolic load from occupants" },
                  { icon: "wb_sunny", label: "Window solar gain", sub: "Daily solar radiation through glazing" },
                  { icon: "air", label: "Infiltration & ventilation", sub: "Air changes per hour from openings" },
                  { icon: "sensors", label: "Thermal comfort hours", sub: "Hours at or above target temperature" },
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

            {/* DRDO thermal spec reminder */}
            <div className="bg-[#FEF3C7] border border-[#D97706]/30 rounded-xl p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#D97706] text-[18px]">info</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold text-sm">DRDO PS 26051 Requirement</span>
              </div>
              <p className="font-body-sm text-[11px] text-on-surface leading-relaxed">
                The shelter must maintain interior temperature <span className="font-semibold">≥ 15°C</span> when outside temperature is <span className="font-semibold">−40°C</span> in Eastern Ladakh winter conditions.
              </p>
              <p className="font-body-sm text-[11px] text-on-surface-variant">
                Set target to 18°C with ≤ 4 unmet hours/week as a starting point.
              </p>
            </div>
          </div>
        </div>
      </div>

      <WizardFooter step={3} canProceed={Object.keys(e).length === 0} />
    </div>
  );
}
