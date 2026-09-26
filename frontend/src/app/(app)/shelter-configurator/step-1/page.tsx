"use client";

import ConfiguratorStepper from "@/components/configurator/ConfiguratorStepper";
import WizardFooter from "@/components/configurator/WizardFooter";
import { useWizard } from "@/components/configurator/WizardProvider";
import { DateInput, Field, NumberInput, RadioCards, SectionCard } from "@/components/configurator/fields";
import { TIMEZONE, WEATHER_SOURCES, type WeatherSource } from "@/lib/configurator/requirements";
import { T } from "@/lib/i18n";

function daysBetween(a: string, b: string) {
  const d = (Date.parse(b) - Date.parse(a)) / 86_400_000;
  return Number.isFinite(d) && d > 0 ? Math.round(d) : null;
}

const LOCATION_PRESETS = [
  { label: "Ladakh – DBO (Winter)", lat: "35.234", lon: "77.892", elev: "5065", start: "2026-12-07", end: "2027-01-04" },
  { label: "Siachen – Base (Summer)", lat: "35.471", lon: "77.102", elev: "5400", start: "2026-06-01", end: "2026-07-15" },
  { label: "Kargil – Forward Post", lat: "34.560", lon: "76.130", elev: "2680", start: "2026-01-01", end: "2026-03-31" },
];

export default function ConfiguratorStep1Page() {
  const { draft, update, errors } = useWizard();
  const s = draft.site;
  const e = errors.site;
  const set = (patch: Partial<typeof s>) => update("site", patch);
  const span = daysBetween(s.analysis_start, s.analysis_end);

  return (
    <div className="flex flex-col w-full">
      <ConfiguratorStepper current={1} title="Site & Atmospheric Conditions" />

      <div className="w-full px-gutter-lg mt-6">
        <div className="max-w-[1720px] mx-auto flex flex-col gap-6">

          {/* Presets banner */}
          <div className="bg-primary-fixed/30 border border-primary/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-2 shrink-0">
              <span className="material-symbols-outlined text-primary text-[20px]">bolt</span>
              <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                <T>Quick-start preset</T>
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                — <T>or fill in coordinates manually below</T>
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {LOCATION_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => set({
                    latitude_deg: p.lat,
                    longitude_deg: p.lon,
                    elevation_m: p.elev,
                    analysis_start: p.start,
                    analysis_end: p.end,
                  })}
                  className="px-3 py-1.5 rounded-lg bg-surface-container-lowest border border-outline-variant hover:bg-primary-container hover:border-primary hover:text-on-primary font-body-sm text-body-sm font-medium transition-colors hover-lift"
                >
                  <T>{p.label}</T>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 flex flex-col gap-5">

              {/* Geographic Location */}
              <SectionCard title="Geographic Location" contractKey="site" icon="location_on">
                <div className="mb-3">
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    <T>Enter the coordinates of the deployment site. Positive latitude = North; positive longitude = East.</T>
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="Latitude" contractKey="latitude_deg" htmlFor="lat" error={e.latitude_deg} hint="e.g. 35.234 (North India)">
                    <NumberInput id="lat" value={s.latitude_deg} onChange={(v) => set({ latitude_deg: v })} unit="°" min={-90} max={90} invalid={!!e.latitude_deg} />
                  </Field>
                  <Field label="Longitude" contractKey="longitude_deg" htmlFor="lon" error={e.longitude_deg} hint="e.g. 77.892 (Ladakh)">
                    <NumberInput id="lon" value={s.longitude_deg} onChange={(v) => set({ longitude_deg: v })} unit="°" min={-180} max={180} invalid={!!e.longitude_deg} />
                  </Field>
                  <Field label="Site Elevation" contractKey="elevation_m" htmlFor="elev" error={e.elevation_m} hint="Height above sea level">
                    <NumberInput id="elev" value={s.elevation_m} onChange={(v) => set({ elevation_m: v })} unit="m" step={1} invalid={!!e.elevation_m} />
                  </Field>
                </div>
                {s.latitude_deg && s.longitude_deg && s.elevation_m && (
                  <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-primary-fixed/20 rounded-lg">
                    <span className="material-symbols-outlined text-[16px] text-primary">check_circle</span>
                    <span className="font-body-sm text-body-sm text-on-surface">
                      <T>Site set to</T>{" "}
                      <span className="font-data font-semibold">{s.latitude_deg}°N, {s.longitude_deg}°E</span>{" "}
                      <T>at</T>{" "}
                      <span className="font-data font-semibold">{s.elevation_m} m</span>{" "}
                      <T>above sea level</T>
                    </span>
                  </div>
                )}
              </SectionCard>

              {/* Analysis Period (Season) */}
              <SectionCard title="Deployment Season / Analysis Window" contractKey="site.analysis_*" icon="date_range">
                <div className="mb-3">
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    <T>The simulation runs for this date range. Choose winter dates for cold-weather survival analysis.</T>
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Analysis Start Date" contractKey="analysis_start" htmlFor="start" error={e.analysis_start}>
                    <DateInput id="start" value={s.analysis_start} onChange={(v) => set({ analysis_start: v })} invalid={!!e.analysis_start} />
                  </Field>
                  <Field label="Analysis End Date" contractKey="analysis_end" htmlFor="end" error={e.analysis_end}>
                    <DateInput id="end" value={s.analysis_end} onChange={(v) => set({ analysis_end: v })} min={s.analysis_start} invalid={!!e.analysis_end} />
                  </Field>
                </div>
                {span !== null && (
                  <div className="mt-3 flex flex-wrap items-center gap-4 px-3 py-2 bg-surface-container-low rounded-lg">
                    <span className="flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface">
                      <span className="material-symbols-outlined text-[14px] text-secondary">calendar_today</span>
                      <span className="font-data font-semibold">{span}</span> <T>days of simulation</T>
                    </span>
                    <span className="flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
                      <span className="material-symbols-outlined text-[14px]">schedule</span>
                      <T>Timezone:</T> <span className="font-data">{TIMEZONE}</span>
                    </span>
                  </div>
                )}
              </SectionCard>

              {/* Ground & Environmental Boundary Conditions */}
              <SectionCard title="Ground & Environmental Boundary Conditions" contractKey="ground" icon="terrain">
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-3">
                  <T>Configure permafrost ground heat sink boundaries and surface convection film coefficients.</T>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="Ground Temperature Mode" hint="manual or Kusuda profile">
                    <select
                      className="w-full h-9 px-3 bg-surface-container-low border border-line rounded-lg text-xs text-on-surface font-medium"
                      defaultValue="kusuda"
                    >
                      <option value="kusuda">annual_mean / Kusuda depth profile</option>
                      <option value="manual">manual (°C)</option>
                    </select>
                  </Field>
                  <Field label="Inside Film Coefficient (h_i)" hint="Standard 2.5 – 8.3 W/m²K">
                    <NumberInput
                      id="hi"
                      defaultValue="7.7"
                      unit="W/m²K"
                      step={0.1}
                      min={2.5}
                      max={8.3}
                    />
                  </Field>
                  <Field label="Outside Film Coefficient (h_o)" hint="Standard 10.0 – 12.0 W/m²K">
                    <NumberInput
                      id="ho"
                      defaultValue="11.4"
                      unit="W/m²K"
                      step={0.1}
                      min={10.0}
                      max={12.0}
                    />
                  </Field>
                </div>
              </SectionCard>

              {/* Atmospheric / Weather Data */}
              <SectionCard title="Atmospheric & Weather Data Source" contractKey="weather_source" icon="cloud">
                <div className="mb-3">
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    <T>COCOON fetches hourly temperature, solar radiation, wind speed and humidity for the selected site and period.</T>
                  </p>
                </div>
                <RadioCards<WeatherSource>
                  name="weather_source"
                  value={s.weather_source}
                  onChange={(v) => set({ weather_source: v, weather_csv_name: v === "CSV" ? s.weather_csv_name : null })}
                  options={WEATHER_SOURCES.map((w) => ({ value: w.id, label: w.label, hint: w.hint }))}
                />
                {s.weather_source === "CSV" && (
                  <Field label="Upload custom hourly weather file" htmlFor="csv" error={e.weather_csv_name} hint="CSV with columns: dry-bulb temp, GHI, wind speed, humidity — one row per hour">
                    <input
                      id="csv"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(ev) => set({ weather_csv_name: ev.target.files?.[0]?.name ?? null })}
                      className="font-body-sm text-body-sm text-on-surface-variant file:mr-3 file:h-9 file:px-4 file:rounded-lg file:border-0 file:bg-surface-container file:text-on-surface file:font-medium hover:file:bg-surface-container-high"
                    />
                    {s.weather_csv_name && <span className="font-data text-[11px] text-on-surface">{s.weather_csv_name}</span>}
                  </Field>
                )}
              </SectionCard>

            </div>

            {/* Right Info Panel */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-[20px]">info</span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                    <T>What this step does</T>
                  </h3>
                </div>
                <div className="flex flex-col gap-3">
                  {[
                    { icon: "thermostat", label: "Fetches hourly outside temperature for your site", sub: "Diurnal freeze-thaw cycles used in all charts" },
                    { icon: "solar_power", label: "Calculates solar position for every hour", sub: "Drives solar gain & Trombe wall calculations" },
                    { icon: "air", label: "Retrieves wind speed and humidity", sub: "Used in convection & infiltration modeling" },
                    { icon: "terrain", label: "Sets ground temperature for the site", sub: "Permafrost / soil heat exchange boundary" },
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
                <div className="pt-3 border-t border-surface-container">
                  <div className="flex items-center gap-2 px-3 py-2 bg-equilibrium-tint rounded-lg">
                    <span className="material-symbols-outlined text-equilibrium text-[16px]">check_circle</span>
                    <span className="font-body-sm text-[11px] text-on-surface">
                      <T>Smart defaults loaded for Eastern Ladakh winter. Change coordinates if needed.</T>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <WizardFooter step={1} canProceed={Object.keys(e).length === 0} />
    </div>
  );
}
