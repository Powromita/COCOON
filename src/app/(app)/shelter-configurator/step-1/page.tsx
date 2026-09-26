"use client";

import ConfiguratorStepper from "@/components/configurator/ConfiguratorStepper";
import DerivedPanel from "@/components/configurator/DerivedPanel";
import WizardFooter from "@/components/configurator/WizardFooter";
import { useWizard } from "@/components/configurator/WizardProvider";
import { DateInput, Field, NumberInput, RadioCards, SectionCard } from "@/components/configurator/fields";
import { TIMEZONE, WEATHER_SOURCES, type WeatherSource } from "@/lib/configurator/requirements";
import { T } from "@/lib/i18n";

function daysBetween(a: string, b: string) {
  const d = (Date.parse(b) - Date.parse(a)) / 86_400_000;
  return Number.isFinite(d) && d > 0 ? Math.round(d) : null;
}

export default function ConfiguratorStep1Page() {
  const { draft, update, errors } = useWizard();
  const s = draft.site;
  const e = errors.site;
  const set = (patch: Partial<typeof s>) => update("site", patch);
  const span = daysBetween(s.analysis_start, s.analysis_end);

  return (
    <div className="flex flex-col w-full">
      <ConfiguratorStepper current={1} title="Location & Deployment Dates" />

      <div className="w-full px-gutter-lg mt-6">
        <div className="max-w-[1720px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 flex flex-col gap-5">
            <SectionCard title="Site location" contractKey="site" icon="location_on">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Latitude" contractKey="latitude_deg" htmlFor="lat" error={e.latitude_deg} hint="Decimal degrees, north positive">
                  <NumberInput id="lat" value={s.latitude_deg} onChange={(v) => set({ latitude_deg: v })} unit="°" min={-90} max={90} invalid={!!e.latitude_deg} />
                </Field>
                <Field label="Longitude" contractKey="longitude_deg" htmlFor="lon" error={e.longitude_deg} hint="Decimal degrees, east positive">
                  <NumberInput id="lon" value={s.longitude_deg} onChange={(v) => set({ longitude_deg: v })} unit="°" min={-180} max={180} invalid={!!e.longitude_deg} />
                </Field>
                <Field label="Elevation" contractKey="elevation_m" htmlFor="elev" error={e.elevation_m} hint="Above mean sea level">
                  <NumberInput id="elev" value={s.elevation_m} onChange={(v) => set({ elevation_m: v })} unit="m" step={1} invalid={!!e.elevation_m} />
                </Field>
              </div>
            </SectionCard>

            <SectionCard title="Deployment season" contractKey="site.analysis_*" icon="date_range">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Analysis start" contractKey="analysis_start" htmlFor="start" error={e.analysis_start}>
                  <DateInput id="start" value={s.analysis_start} onChange={(v) => set({ analysis_start: v })} invalid={!!e.analysis_start} />
                </Field>
                <Field label="Analysis end" contractKey="analysis_end" htmlFor="end" error={e.analysis_end}>
                  <DateInput id="end" value={s.analysis_end} onChange={(v) => set({ analysis_end: v })} min={s.analysis_start} invalid={!!e.analysis_end} />
                </Field>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {span !== null && (
                  <>
                    <span className="font-data text-on-surface">{span}</span> <T>days</T> ·{" "}
                  </>
                )}
                <T>Timezone</T> <span className="font-data text-on-surface">{TIMEZONE}</span>
              </p>
            </SectionCard>

            <SectionCard title="Weather source" contractKey="weather_source" icon="cloud">
              <RadioCards<WeatherSource>
                name="weather_source"
                value={s.weather_source}
                onChange={(v) => set({ weather_source: v, weather_csv_name: v === "CSV" ? s.weather_csv_name : null })}
                options={WEATHER_SOURCES.map((w) => ({ value: w.id, label: w.label, hint: w.hint }))}
              />
              {s.weather_source === "CSV" && (
                <Field label="Hourly weather file" htmlFor="csv" error={e.weather_csv_name} hint="Dry-bulb, GHI, wind and humidity per hour">
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

          <div className="lg:col-span-4">
            <DerivedPanel
              module="M3 · WEATHER"
              items={[
                "Hourly weather snapshot for the selected period, with source and checksum",
                "Solar position for every timestep from your coordinates",
                "Typical and worst-cold analysis windows",
                "Ground temperature assumption for the site",
              ]}
            />
          </div>
        </div>
      </div>

      <WizardFooter step={1} canProceed={Object.keys(e).length === 0} />
    </div>
  );
}
