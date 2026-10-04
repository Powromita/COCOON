"use client";

import { useMemo } from "react";
import ConfiguratorStepper from "@/components/configurator/ConfiguratorStepper";
import WizardFooter from "@/components/configurator/WizardFooter";
import { useWizard } from "@/components/configurator/WizardProvider";
import { Field, NumberInput, SectionCard, Select } from "@/components/configurator/fields";
import {
  GLAZING_OPTIONS,
  WINDOW_ORIENTATIONS,
  syncWindows,
  type GlazingType,
  type WindowOrientation,
  type WindowSpec,
} from "@/lib/configurator/requirements";
import { T } from "@/lib/i18n";

export default function ConfiguratorStep4Page() {
  const { draft, update, errors } = useWizard();
  const d = draft.design;
  const e = errors.design;
  const set = (patch: Partial<typeof d>) => update("design", patch);

  const windowCountNum = Math.max(0, Math.round(Number(d.window_count || 0)));
  const activeWindows = useMemo(() => {
    return syncWindows(windowCountNum, d.windows);
  }, [windowCountNum, d.windows]);

  const handleWindowCountChange = (v: string) => {
    const nextCount = Math.max(0, Math.min(20, Math.round(Number(v) || 0)));
    const updatedWindows = syncWindows(nextCount, d.windows);
    set({
      window_count: v,
      windows: updatedWindows,
      ...(nextCount === 0 ? { glazing: "none" } : d.glazing === "none" ? { glazing: "double" } : {}),
    });
  };

  const updateWindow = (index: number, patch: Partial<WindowSpec>) => {
    const updated = activeWindows.map((w, i) => (i === index ? { ...w, ...patch } : w));
    set({ windows: updated });
  };

  const applyFirstToAll = () => {
    if (activeWindows.length === 0) return;
    const first = activeWindows[0];
    const updated = activeWindows.map((w) => ({
      ...w,
      width_m: first.width_m,
      height_m: first.height_m,
      orientation: first.orientation,
    }));
    set({ windows: updated });
  };

  const totalWindowArea = useMemo(() => {
    if (windowCountNum === 0 || d.glazing === "none") return 0;
    return activeWindows.reduce((acc, w) => {
      const area = (Number(w.width_m) || 0) * (Number(w.height_m) || 0);
      return acc + area;
    }, 0);
  }, [activeWindows, windowCountNum, d.glazing]);

  return (
    <div className="flex flex-col w-full">
      <ConfiguratorStepper current={4} title="Physical & Envelope Overrides" />

      <div className="w-full px-gutter-lg mt-6">
        <div className="max-w-[1720px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 flex flex-col gap-5">

            {/* 1. Dimensions */}
            <SectionCard title="1. Dimensions" contractKey="design.dimensions" icon="straighten">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Explicit shelter axes and interior ceiling clearance.</T>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field
                  label="Fixed Length (length_m)"
                  contractKey="length_m"
                  htmlFor="len"
                  error={e.length_m}
                  hint="Range: 2.0 to 100.0 m"
                >
                  <NumberInput
                    id="len"
                    value={d.length_m}
                    onChange={(v) => set({ length_m: v })}
                    min={2.0}
                    max={100.0}
                    step={0.1}
                    unit="m"
                    invalid={!!e.length_m}
                  />
                </Field>

                <Field
                  label="Fixed Width (width_m)"
                  contractKey="width_m"
                  htmlFor="wid"
                  error={e.width_m}
                  hint="Range: 2.0 to 100.0 m"
                >
                  <NumberInput
                    id="wid"
                    value={d.width_m}
                    onChange={(v) => set({ width_m: v })}
                    min={2.0}
                    max={100.0}
                    step={0.1}
                    unit="m"
                    invalid={!!e.width_m}
                  />
                </Field>

                <Field
                  label="Ceiling Height (height_m)"
                  contractKey="height_m"
                  htmlFor="hei"
                  error={e.height_m}
                  hint="Range: 2.3 to 3.0 m"
                >
                  <NumberInput
                    id="hei"
                    value={d.height_m}
                    onChange={(v) => set({ height_m: v })}
                    min={2.3}
                    max={3.0}
                    step={0.1}
                    unit="m"
                    invalid={!!e.height_m}
                  />
                </Field>
              </div>
            </SectionCard>

            {/* 2. Envelope Thicknesses */}
            <SectionCard title="2. Envelope Thicknesses" contractKey="design.thicknesses" icon="layers">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Specified construction assembly thicknesses across exterior boundaries.</T>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field
                  label="Wall Thickness (wall_thickness_mm)"
                  contractKey="wall_thickness_mm"
                  htmlFor="wall_th"
                  error={e.wall_thickness_mm}
                  hint="Range: 100 to 1,000 mm (≥ 300 mm if Stone is used)"
                >
                  <NumberInput
                    id="wall_th"
                    value={d.wall_thickness_mm}
                    onChange={(v) => set({ wall_thickness_mm: v })}
                    min={100}
                    max={1000}
                    step={10}
                    unit="mm"
                    invalid={!!e.wall_thickness_mm}
                  />
                </Field>

                <Field
                  label="Roof Thickness (roof_thickness_mm)"
                  contractKey="roof_thickness_mm"
                  htmlFor="roof_th"
                  error={e.roof_thickness_mm}
                  hint="Range: 80 to 1,000 mm"
                >
                  <NumberInput
                    id="roof_th"
                    value={d.roof_thickness_mm}
                    onChange={(v) => set({ roof_thickness_mm: v })}
                    min={80}
                    max={1000}
                    step={10}
                    unit="mm"
                    invalid={!!e.roof_thickness_mm}
                  />
                </Field>

                <Field
                  label="Floor Thickness (floor_thickness_mm)"
                  contractKey="floor_thickness_mm"
                  htmlFor="floor_th"
                  error={e.floor_thickness_mm}
                  hint="Range: 80 to 1,000 mm"
                >
                  <NumberInput
                    id="floor_th"
                    value={d.floor_thickness_mm}
                    onChange={(v) => set({ floor_thickness_mm: v })}
                    min={80}
                    max={1000}
                    step={10}
                    unit="mm"
                    invalid={!!e.floor_thickness_mm}
                  />
                </Field>
              </div>

              {draft.constraints.available_material_ids.includes("mat_stone") && Number(d.wall_thickness_mm) > 0 && Number(d.wall_thickness_mm) < 300 && (
                <div className="mt-3 p-3 rounded-lg bg-warning/10 border border-warning/30 flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-[18px] text-warning shrink-0 mt-0.5">warning</span>
                  <div className="font-body-sm text-xs text-on-surface leading-relaxed">
                    <strong className="text-warning">Stone Wall Thickness Notice:</strong> You selected <strong>Stone / Slate</strong> in Step 3, which physically requires at least <strong>300 mm</strong> thickness (typical 300–450 mm). Please set Wall Thickness to ≥ 300 mm to ensure physical buildability.
                  </div>
                </div>
              )}
            </SectionCard>

            {/* 3. Glazing & Individual Window Overrides */}
            <SectionCard title="3. Glazing &amp; Windows" contractKey="design.openings" icon="window">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Configure total window units, glazing pane spec, and individual dimensions & orientation for each window.</T>
              </p>

              {/* Master Window Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <Field
                  label="Total Window Count (window_count)"
                  contractKey="window_count"
                  htmlFor="win_cnt"
                  error={e.window_count}
                  hint="0 = Opaque envelope; 1–20 units"
                >
                  <NumberInput
                    id="win_cnt"
                    value={d.window_count}
                    onChange={handleWindowCountChange}
                    min={0}
                    max={20}
                    step={1}
                    unit="units"
                    invalid={!!e.window_count}
                  />
                </Field>

                <Field
                  label="Glazing Type (glazing)"
                  contractKey="glazing"
                  htmlFor="glazing"
                  hint="Pane specification & insulation level"
                >
                  <Select
                    id="glazing"
                    value={d.glazing}
                    onChange={(v) => set({ glazing: v as GlazingType })}
                    options={GLAZING_OPTIONS.map((g) => ({ value: g.id, label: `${g.label} (${g.hint})` }))}
                  />
                </Field>
              </div>

              {/* Individual Window Configuration */}
              {windowCountNum === 0 || d.glazing === "none" ? (
                <div className="p-4 rounded-xl bg-surface-container-low border border-dashed border-outline-variant flex items-center gap-3">
                  <span className="material-symbols-outlined text-outline text-[22px]">block</span>
                  <p className="font-body-sm text-on-surface-variant">
                    <T>Envelope configured as opaque with 0 window fenestrations. No aperture heat losses or direct solar gains.</T>
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between pb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-on-surface uppercase tracking-wider">
                        <T>Per-Window Dimensions &amp; Orientation</T>
                      </span>
                      <span className="font-label-mono-xs text-[10px] px-2 py-0.5 rounded-full bg-primary-fixed/20 text-primary font-semibold">
                        {windowCountNum} {windowCountNum === 1 ? "window" : "windows"}
                      </span>
                    </div>

                    {windowCountNum > 1 && (
                      <button
                        type="button"
                        onClick={applyFirstToAll}
                        className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">content_copy</span>
                        <T>Apply Window #1 size &amp; orientation to all</T>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {activeWindows.map((win, idx) => (
                      <div
                        key={win.id}
                        className="p-3.5 rounded-xl border border-outline-variant bg-surface-container-lowest flex flex-col sm:flex-row sm:items-center gap-3 shadow-sm"
                      >
                        <div className="flex items-center gap-2 shrink-0 sm:w-28">
                          <span className="w-6 h-6 rounded-full bg-primary-container text-on-primary font-data text-xs font-bold flex items-center justify-center">
                            #{win.id}
                          </span>
                          <span className="font-body-sm font-semibold text-on-surface">
                            <T>Window</T> {win.id}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                          <Field
                            label="Width"
                            hint="0.4 to 3.0 m"
                            error={e[`window_${idx}_width`]}
                          >
                            <NumberInput
                              id={`win_${idx}_w`}
                              value={win.width_m}
                              onChange={(v) => updateWindow(idx, { width_m: v })}
                              min={0.4}
                              max={3.0}
                              step={0.1}
                              unit="m"
                              invalid={!!e[`window_${idx}_width`]}
                            />
                          </Field>

                          <Field
                            label="Height"
                            hint="0.4 to 3.0 m"
                            error={e[`window_${idx}_height`]}
                          >
                            <NumberInput
                              id={`win_${idx}_h`}
                              value={win.height_m}
                              onChange={(v) => updateWindow(idx, { height_m: v })}
                              min={0.4}
                              max={3.0}
                              step={0.1}
                              unit="m"
                              invalid={!!e[`window_${idx}_height`]}
                            />
                          </Field>

                          <Field label="Orientation" hint="Facade facing">
                            <Select
                              id={`win_${idx}_ori`}
                              value={win.orientation}
                              onChange={(v) => updateWindow(idx, { orientation: v as WindowOrientation })}
                              options={WINDOW_ORIENTATIONS.map((o) => ({ value: o.id, label: o.label }))}
                            />
                          </Field>
                        </div>
                      </div>
                    ))}
                  </div>

                  {totalWindowArea > 0 && (
                    <div className="mt-2 p-3 bg-surface-container-low rounded-xl flex items-center justify-between">
                      <span className="font-body-sm text-xs text-on-surface-variant">
                        <T>Cumulative Glazing Aperture Area:</T>
                      </span>
                      <span className="font-data text-sm font-bold text-primary">
                        {totalWindowArea.toFixed(2)} m²
                      </span>
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            {/* 4. Airtightness */}
            <SectionCard title="4. Airtightness" contractKey="design.airtightness" icon="air">
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                <T>Envelope air infiltration rate in air changes per hour (ACH).</T>
              </p>
              <Field
                label="Air Infiltration Rate (air_changes_per_hour)"
                contractKey="air_changes_per_hour"
                htmlFor="ach"
                error={e.air_changes_per_hour}
                hint="Infiltration rate: 0.0 to 10.0 ACH (standard: 0.8 ACH)"
              >
                <NumberInput
                  id="ach"
                  value={d.air_changes_per_hour}
                  onChange={(v) => set({ air_changes_per_hour: v })}
                  min={0.0}
                  max={10.0}
                  step={0.1}
                  unit="ACH"
                  invalid={!!e.air_changes_per_hour}
                />
              </Field>
            </SectionCard>

          </div>

          {/* Right Summary Info */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">info</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  <T>Phase 04: Overrides</T>
                </h3>
              </div>
              <div className="flex flex-col gap-3">
                {[
                  { icon: "straighten", label: "Fixed Dimensions", sub: "Explicit length, width, and ceiling height" },
                  { icon: "layers", label: "Envelope Thickness", sub: "Wall, roof, and slab thermal insulation depths" },
                  { icon: "window", label: "Per-Window Overrides", sub: "Independent width, height & orientation for each unit" },
                  { icon: "air", label: "Airtightness (ACH)", sub: "Natural infiltration and cold draft modeling" },
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

      <WizardFooter step={4} canProceed={Object.keys(e).length === 0} />
    </div>
  );
}
