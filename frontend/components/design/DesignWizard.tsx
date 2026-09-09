"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { defaultDesignForm } from "@/mock/design";
import { saveDesign } from "@/services/design";
import { getMaterials } from "@/services/materials";
import { getWeatherProfiles } from "@/services/weather";
import type { DesignForm } from "@/types/design";

const stepMeta = [
  {
    id: "location",
    label: "Location",
    accent: "from-cyan-500 to-blue-600",
    title: "Site & altitude",
    hint: "Choose the project footprint and elevation context.",
  },
  {
    id: "climate",
    label: "Climate",
    accent: "from-sky-500 to-indigo-600",
    title: "Weather profile",
    hint: "Set the expected thermal conditions and seasonal extremes.",
  },
  {
    id: "geometry",
    label: "Geometry",
    accent: "from-violet-500 to-fuchsia-600",
    title: "Envelope proportions",
    hint: "Define the shelter footprint and height for the energy model.",
  },
  {
    id: "materials",
    label: "Materials",
    accent: "from-emerald-500 to-teal-600",
    title: "Wall & roof stack",
    hint: "Choose the thermal mass and insulation strategy.",
  },
  {
    id: "review",
    label: "Review",
    accent: "from-amber-500 to-orange-600",
    title: "Design summary",
    hint: "Validate the setup before moving to simulation.",
  },
] as const;

const fieldOptions = {
  location: {
    region: getWeatherProfiles().map((profile) => profile.region),
    terrain: ["Valley basin", "Exposed ridge", "Slope terrace", "Dry plain"],
  },
  climate: {
    pattern: ["Cold desert", "High alpine", "Temperate valley", "Polar fringe"],
    season: ["Winter peak", "Transition season", "Monsoon shoulder", "Dry summer"],
  },
  geometry: {
    shape: ["Rectangular shell", "A-frame cabin", "Dome vault", "Low-profile pod"],
    glazing: ["Low glazing", "Balanced glazing", "High daylight", "Sun-facing glazing"],
  },
  materials: {
    wall: getMaterials("wall").map((material) => material.name),
    roof: getMaterials("roof").map((material) => material.name),
  },
} as const;

export default function DesignWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState<DesignForm>(defaultDesignForm);

  const currentMeta = stepMeta[currentStep];

  const summary = useMemo(() => ({
    site: `${form.region} • ${form.altitude}m`,
    climate: `${form.climatePattern} • ${form.outdoorTemp}°C`,
    geometry: `${form.shape} • ${form.length}m × ${form.width}m × ${form.height}m`,
    envelope: `${form.wall} / ${form.roof}`,
  }), [form]);

  const updateField = (name: keyof DesignForm, value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveDesign = () => {
    saveDesign(form);
    router.push("/individual/results");
  };

  const isLastStep = currentStep === stepMeta.length - 1;
  const canGoBack = currentStep > 0;

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Region</label>
              <select
                value={form.region}
                onChange={(event) => updateField("region", event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-medium text-white outline-none ring-0 transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
              >
                {fieldOptions.location.region.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Terrain</label>
              <select
                value={form.terrain}
                onChange={(event) => updateField("terrain", event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-medium text-white outline-none ring-0 transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
              >
                {fieldOptions.location.terrain.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 md:col-span-2">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Altitude</label>
              <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 px-3 py-3">
                <input
                  type="number"
                  value={form.altitude}
                  onChange={(event) => updateField("altitude", event.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-white outline-none"
                />
                <span className="text-sm font-semibold text-slate-500">m</span>
              </div>
            </div>
          </div>
        );
      case 1:
        return (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Climate pattern</label>
              <select
                value={form.climatePattern}
                onChange={(event) => updateField("climatePattern", event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-medium text-white outline-none ring-0 transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
              >
                {fieldOptions.climate.pattern.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Season</label>
              <select
                value={form.season}
                onChange={(event) => updateField("season", event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-800 outline-none ring-0 transition focus:border-cyan-400"
              >
                {fieldOptions.climate.season.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Outdoor design temperature</label>
                <span className="text-sm font-semibold text-cyan-700">{form.outdoorTemp}°C</span>
              </div>
              <input
                type="range"
                min={-35}
                max={10}
                step={1}
                value={form.outdoorTemp}
                onChange={(event) => updateField("outdoorTemp", event.target.value)}
                className="h-2 w-full cursor-pointer accent-cyan-600"
              />
              <div className="mt-2 flex justify-between text-[11px] font-medium text-slate-500">
                <span>-35°C</span>
                <span>10°C</span>
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Shelter shape</label>
              <select
                value={form.shape}
                onChange={(event) => updateField("shape", event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-800 outline-none ring-0 transition focus:border-cyan-400"
              >
                {fieldOptions.geometry.shape.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Glazing strategy</label>
              <select
                value={form.glazing}
                onChange={(event) => updateField("glazing", event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-800 outline-none ring-0 transition focus:border-cyan-400"
              >
                {fieldOptions.geometry.glazing.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            {[
              ["length", "Length (m)"],
              ["width", "Width (m)"],
              ["height", "Height (m)"],
            ].map(([key, label]) => (
              <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{label}</label>
                <input
                  type="number"
                  step="0.1"
                  value={form[key as keyof DesignForm]}
                  onChange={(event) => updateField(key as keyof DesignForm, event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-800 outline-none ring-0 transition focus:border-cyan-400"
                />
              </div>
            ))}
          </div>
        );
      case 3:
        return (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Wall assembly</label>
              <select
                value={form.wall}
                onChange={(event) => updateField("wall", event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-800 outline-none ring-0 transition focus:border-cyan-400"
              >
                {fieldOptions.materials.wall.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Roof assembly</label>
              <select
                value={form.roof}
                onChange={(event) => updateField("roof", event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-800 outline-none ring-0 transition focus:border-cyan-400"
              >
                {fieldOptions.materials.roof.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Occupancy</label>
              <input
                type="number"
                min={1}
                max={12}
                value={form.occupancy}
                onChange={(event) => updateField("occupancy", event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-800 outline-none ring-0 transition focus:border-cyan-400"
              />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Heater setting</label>
              <select
                value={form.heater}
                onChange={(event) => updateField("heater", event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-800 outline-none ring-0 transition focus:border-cyan-400"
              >
                {["Off", "Low", "Medium", "High"].map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 md:col-span-2">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">Design snapshot</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {Object.entries(summary).map(([key, value]) => (
                  <div key={key} className="rounded-xl bg-white/80 p-3 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{key}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-800">{value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Projected comfort</p>
              <div className="mt-3 flex items-end gap-2">
                <span className="font-mono text-3xl font-bold text-emerald-600">19.4</span>
                <span className="pb-1 text-sm font-semibold text-slate-500">°C</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">Within the target habitability band for the selected seasonal window.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Estimated load</p>
              <div className="mt-3 flex items-end gap-2">
                <span className="font-mono text-3xl font-bold text-violet-600">8.7</span>
                <span className="pb-1 text-sm font-semibold text-slate-500">kWh/day</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">Energy demand is moderate and compatible with the requested heater profile.</p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div data-design-wizard className="relative overflow-hidden rounded-[28px] border border-cyan-400/30 bg-[#080d19]/95 p-4 shadow-[0_0_0_1px_rgba(34,211,238,0.05),0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.035)_1px,transparent_1px)] bg-[size:28px_28px]" />
      <div className="relative">
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">Interface preview</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Create your shelter concept</h2>
        </div>

        <div className="grid grid-cols-5 gap-2 text-center text-[10px] font-bold uppercase tracking-[0.14em]">
          {stepMeta.map((step, index) => {
            const active = index === currentStep;
            const complete = index < currentStep;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setCurrentStep(index)}
                className={`rounded-xl border px-2 py-3 transition ${
                  active
                    ? "border-cyan-500 bg-cyan-600 text-white shadow-md"
                    : complete
                      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                      : "border-slate-700 bg-slate-900/80 text-slate-400 hover:border-cyan-400/50 hover:text-cyan-200"
                }`}
              >
                {step.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-6 overflow-hidden rounded-[24px] bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-900 p-5 text-white">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-200">Stage 7</p>
            <h3 className="mt-2 text-2xl font-bold">{currentMeta.title}</h3>
          </div>
          <div className={`rounded-full bg-gradient-to-r ${currentMeta.accent} px-3 py-1.5 text-xs font-semibold text-white shadow-lg`}>
            {currentMeta.label}
          </div>
        </div>
        <p className="mt-3 max-w-[42rem] text-sm text-slate-200">{currentMeta.hint}</p>
      </div>

      {renderStepContent()}

      <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-400">
          Step {currentStep + 1} of {stepMeta.length}
        </div>

        <div className="flex items-center gap-3">
          {canGoBack ? (
            <button
              type="button"
              onClick={() => setCurrentStep((value) => Math.max(0, value - 1))}
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/60 hover:bg-slate-800"
            >
              Back
            </button>
          ) : null}

          {isLastStep ? (
            <button
              type="button"
              onClick={handleSaveDesign}
              className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:brightness-110"
            >
              Save & simulate
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCurrentStep((value) => Math.min(stepMeta.length - 1, value + 1))}
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-cyan-600/20 transition hover:brightness-110"
            >
              Continue
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
