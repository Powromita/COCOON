"use client";

import ConfiguratorStepper from "@/components/configurator/ConfiguratorStepper";
import WizardFooter from "@/components/configurator/WizardFooter";
import { useWizard } from "@/components/configurator/WizardProvider";
import { DateInput, Field, NumberInput, SectionCard, Select } from "@/components/configurator/fields";
import { TIMEZONE_OPTIONS } from "@/lib/configurator/requirements";
import { T } from "@/lib/i18n";

function daysBetween(a: string, b: string) {
  const d = (Date.parse(b) - Date.parse(a)) / 86_400_000;
  return Number.isFinite(d) && d > 0 ? Math.round(d) : null;
}

const LOCATION_PRESETS = [
  { label: "Ladakh – DBO (Winter)", lat: "35.234", lon: "77.892", elev: "5065", start: "2026-01-01", end: "2026-01-08" },
  { label: "Siachen – Base Camp", lat: "35.471", lon: "77.102", elev: "5400", start: "2026-01-01", end: "2026-01-08" },
  { label: "Leh – High Altitude Post", lat: "34.1526", lon: "77.5771", elev: "3500", start: "2026-01-01", end: "2026-01-08" },
  { label: "Kargil – Drass Sector", lat: "34.428", lon: "75.761", elev: "3280", start: "2026-01-01", end: "2026-01-08" },
];

export default function ConfiguratorStep1Page() {
  const { draft, update, errors } = useWizard();
  const s = draft.site;
  const e = errors.site;
  const set = (patch: Partial<typeof s>) => update("site", patch);
  const span = daysBetween(s.analysis_start, s.analysis_end);

  return (
    <div className="flex flex-col w-full">
      <ConfiguratorStepper current={1} title="Geographic & Weather Window" />

      <div className="w-full px-gutter-lg mt-6">
        <div className="max-w-[1720px] mx-auto flex flex-col gap-6">

          {/* Quick-start Location Presets */}
          <div className="bg-primary-fixed/30 border border-primary/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-2 shrink-0">
              <span className="material-symbols-outlined text-primary text-[20px]">bolt</span>
              <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                <T>Quick-start preset</T>
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                — <T>or fill coordinates & dates manually</T>
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {LOCATION_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    set({
                      latitude_deg: p.lat,
                      longitude_deg: p.lon,
                      elevation_m: p.elev,
                      analysis_start: p.start,
                      analysis_end: p.end,
                    });
                    if (!draft.name || draft.name.includes("Habitat") || draft.name.includes("Shelter") || draft.name.includes("–")) {
                      update("name", `${p.label} Shelter`);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-surface-container-lowest border border-outline-variant hover:bg-primary-container hover:border-primary hover:text-on-primary font-body-sm text-body-sm font-medium transition-colors hover-lift"
                >
                  <T>{p.label}</T>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 flex flex-col gap-5">

              {/* Project & Shelter Identification */}
              <SectionCard title="Project &amp; Shelter Identification" contractKey="project" icon="badge">
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                  <T>Give this shelter configuration a custom name to identify it in project lists, dashboards, and export reports.</T>
                </p>
                <div>
                  <Field
                    label="Shelter / Project Name"
                    contractKey="name"
                    htmlFor="project_name"
                    hint="Custom name for this shelter design (e.g. Siachen High-Altitude Post, DBO 24-Troop Shelter)"
                  >
                    <input
                      id="project_name"
                      type="text"
                      value={draft.name ?? ""}
                      onChange={(e) => update("name", e.target.value)}
                      placeholder="e.g. Siachen High-Altitude Post, DBO 24-Troop Barracks"
                      className="w-full h-10 px-3.5 rounded-xl border border-line bg-surface-container-lowest text-sm text-on-surface outline-none transition-all focus:border-navy focus:ring-2 focus:ring-navy/10 font-medium"
                    />
                  </Field>
                </div>
              </SectionCard>

              {/* Geographic Coordinates & Elevation */}
              <SectionCard title="Geographic Coordinates &amp; Elevation" contractKey="site" icon="location_on">
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                  <T>Decimal coordinates and altitude of the deployment sector. Positive latitude = North, positive longitude = East.</T>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="Latitude (latitude_deg)" contractKey="latitude_deg" htmlFor="lat" error={e.latitude_deg} hint="e.g. 34.1526 (North)">
                    <NumberInput id="lat" value={s.latitude_deg} onChange={(v) => set({ latitude_deg: v })} unit="°" min={-90} max={90} step={0.0001} invalid={!!e.latitude_deg} />
                  </Field>
                  <Field label="Longitude (longitude_deg)" contractKey="longitude_deg" htmlFor="lon" error={e.longitude_deg} hint="e.g. 77.5771 (East)">
                    <NumberInput id="lon" value={s.longitude_deg} onChange={(v) => set({ longitude_deg: v })} unit="°" min={-180} max={180} step={0.0001} invalid={!!e.longitude_deg} />
                  </Field>
                  <Field label="Elevation (elevation_m)" contractKey="elevation_m" htmlFor="elev" error={e.elevation_m} hint="Meters above sea level">
                    <NumberInput id="elev" value={s.elevation_m} onChange={(v) => set({ elevation_m: v })} unit="m" min={-500} max={9000} step={1} invalid={!!e.elevation_m} />
                  </Field>
                </div>
                {s.latitude_deg && s.longitude_deg && s.elevation_m && (
                  <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-primary-fixed/20 rounded-lg">
                    <span className="material-symbols-outlined text-[16px] text-primary">check_circle</span>
                    <span className="font-body-sm text-body-sm text-on-surface">
                      <T>Selected Site:</T>{" "}
                      <span className="font-data font-semibold">{s.latitude_deg}°N, {s.longitude_deg}°E</span>{" "}
                      <T>at</T>{" "}
                      <span className="font-data font-semibold">{s.elevation_m} m</span>{" "}
                      <T>altitude</T>
                    </span>
                  </div>
                )}
              </SectionCard>

              {/* Analysis Date Range & Timezone */}
              <SectionCard title="Analysis Date Range &amp; Timezone" contractKey="site.analysis_*" icon="date_range">
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                  <T>Start and end timestamps for the thermal simulation window. End date must be strictly after the start date.</T>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Analysis Start (analysis_start)" contractKey="analysis_start" htmlFor="start" error={e.analysis_start} hint="Simulation window start">
                    <DateInput id="start" value={s.analysis_start} onChange={(v) => set({ analysis_start: v })} invalid={!!e.analysis_start} />
                  </Field>
                  <Field label="Analysis End (analysis_end)" contractKey="analysis_end" htmlFor="end" error={e.analysis_end} hint="Simulation window end">
                    <DateInput id="end" value={s.analysis_end} onChange={(v) => set({ analysis_end: v })} min={s.analysis_start} invalid={!!e.analysis_end} />
                  </Field>
                </div>

                <div className="mt-4">
                  <Field label="Timezone (timezone)" contractKey="timezone" htmlFor="timezone" error={e.timezone} hint="Regional IANA timezone identifier">
                    <Select
                      id="timezone"
                      value={s.timezone}
                      onChange={(v) => set({ timezone: v })}
                      options={TIMEZONE_OPTIONS}
                      invalid={!!e.timezone}
                    />
                  </Field>
                </div>

                {span !== null && (
                  <div className="mt-4 flex flex-wrap items-center gap-4 px-3 py-2 bg-surface-container-low rounded-lg">
                    <span className="flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface">
                      <span className="material-symbols-outlined text-[14px] text-secondary">calendar_today</span>
                      <span className="font-data font-semibold">{span}</span> <T>days of weather simulation</T>
                    </span>
                    <span className="flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
                      <span className="material-symbols-outlined text-[14px]">schedule</span>
                      <T>Timezone:</T> <span className="font-data">{s.timezone}</span>
                    </span>
                  </div>
                )}
              </SectionCard>

            </div>

            {/* Right Summary Info */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-[20px]">info</span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                    <T>Phase 01: Weather Window</T>
                  </h3>
                </div>
                <div className="flex flex-col gap-3">
                  {[
                    { icon: "location_on", label: "Site Coordinates", sub: "Matches closest high-altitude weather archive" },
                    { icon: "altitude", label: "Elevation Adjustments", sub: "Pressure and atmospheric density modeling" },
                    { icon: "schedule", label: "Simulation Horizon", sub: "Hour-by-hour dynamic thermal simulation" },
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
      </div>

      <WizardFooter step={1} canProceed={Object.keys(e).length === 0} />
    </div>
  );
}
