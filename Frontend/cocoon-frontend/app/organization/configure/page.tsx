"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteHeader from "@/app/_components/SiteHeader";
import LayerBuilder from "@/app/_components/LayerBuilder";
import SiteComfortEnvFields from "@/app/_components/SiteComfortEnvFields";
import OptimizerFields from "@/app/_components/OptimizerFields";
import SectionCard from "@/app/_components/SectionCard";
import { buildRunRequest } from "@/app/_lib/buildRequest";
import { stashRequest } from "@/app/_lib/api";
import { useT } from "@/app/_lib/i18n";

const inputCls =
  "w-full bg-transparent px-space-sm py-space-xs font-mono-metric-md text-on-surface outline-none";

export default function OrganizationConfigurePage() {
  const t = useT();
  const router = useRouter();
  const [mode, setMode] = useState<"evaluate" | "optimize">("evaluate");

  const [L, setL] = useState(6);
  const [W, setW] = useState(4);
  const [H, setH] = useState(2.8);
  const [contentsMass, setContentsMass] = useState(2400);
  const [contentsCp, setContentsCp] = useState(1020);

  const envelopeArea = useMemo(() => 2 * (L * H + W * H) + L * W, [L, W, H]);
  const volume = useMemo(() => L * W * H, [L, W, H]);
  const av = useMemo(() => (volume ? envelopeArea / volume : 0), [envelopeArea, volume]);
  // rough τ = C_total / (UA); C ≈ contents + ~10 MJ/K envelope proxy, UA ≈ 0.3·A_env
  const tau = useMemo(() => {
    const C = contentsMass * contentsCp + 10e6;
    const UA = 0.35 * envelopeArea;
    return C / Math.max(1, UA) / 3600;
  }, [contentsMass, contentsCp, envelopeArea]);

  const showEnvelope = mode === "evaluate";

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const runMode = mode === "optimize" ? "optimize" : "single";
    stashRequest(buildRunRequest(new FormData(e.currentTarget), runMode));
    router.push("/organization/results");
  };

  const dims: { key: string; unit: string; name: string; v: number; set: (n: number) => void }[] = [
    { key: "ocfg.len", unit: "m", name: "geom.length_m", v: L, set: setL },
    { key: "ocfg.wid", unit: "m", name: "geom.width_m", v: W, set: setW },
    { key: "ocfg.hgt", unit: "m", name: "geom.height_m", v: H, set: setH },
  ];

  return (
    <main className="min-h-screen bg-background text-on-surface antialiased">
      <SiteHeader mode="Organization" active="configure" />

      <main className="w-full bg-surface pt-16">
        <section className="w-full border-b border-surface-container bg-surface-container-low px-space-lg py-space-xs">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-space-md gap-y-space-2xs font-mono-metric-sm text-on-surface-variant">
            <span className="rounded bg-surface-variant px-space-2xs py-[1px] text-[10px] text-on-surface">{t("ocfg.tier")}</span>
            <span>{t("ocfg.taskforce")}</span>
            <span className="text-outline-variant">•</span>
            <span className="flex items-center gap-space-2xs">
              <span className="h-2 w-2 rounded-full bg-tertiary-container" />
              {t("ocfg.solverSync")}
            </span>
          </div>
        </section>

        <section className="w-full px-space-lg py-space-xl">
          <form onSubmit={handleSubmit} className="mx-auto flex max-w-7xl flex-col gap-space-xl">
            <div className="w-full min-w-0 max-w-2xl">
              <div className="flex items-center gap-space-xs">
                <span className="font-label-caps uppercase tracking-wider text-secondary">{t("ocfg.module")}</span>
              </div>
              <h1 className="mt-space-xs font-display-xl tracking-tight text-on-surface">{t("ocfg.title")}</h1>
              <p className="mt-space-xs font-body-lg text-on-surface-variant">{t("ocfg.sub")}</p>
            </div>

            <SectionCard title={t("opt.mode.title")}>
              <div className="grid gap-space-md sm:grid-cols-2">
                {([
                  ["evaluate", "opt.mode.evaluate", "opt.mode.evaluateDesc"],
                  ["optimize", "opt.mode.optimize", "opt.mode.optimizeDesc"],
                ] as const).map(([val, titleKey, descKey]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setMode(val)}
                    className={`rounded-lg border p-space-md text-left transition-colors ${
                      mode === val
                        ? "border-primary bg-primary-container/10"
                        : "border-surface-container-high bg-surface-container-low"
                    }`}
                  >
                    <span className="flex items-center gap-space-xs font-headline-sm text-on-surface">
                      <span className={`h-3 w-3 rounded-full ${mode === val ? "bg-primary" : "bg-outline-variant"}`} />
                      {t(titleKey)}
                    </span>
                    <span className="mt-space-2xs block font-body-sm text-on-surface-variant">{t(descKey)}</span>
                  </button>
                ))}
              </div>
              {!showEnvelope ? (
                <p className="mt-space-md rounded bg-surface-container-low p-space-sm font-body-sm text-on-surface-variant">
                  {t("opt.envHidden")}
                </p>
              ) : null}
            </SectionCard>

            {showEnvelope ? (
              <>
                {/* GEOMETRY */}
                <div className="rounded-lg bg-surface-container-lowest p-card-padding shadow-sm">
                  <div className="mb-space-lg flex items-center justify-between pb-space-sm">
                    <div className="flex items-center gap-space-xs">
                      <span className="h-4 w-2 rounded-sm bg-primary" />
                      <h2 className="font-headline-md text-on-surface">{t("ocfg.s1")}</h2>
                    </div>
                    <span className="rounded bg-surface-container px-space-xs py-space-2xs font-mono-metric-sm text-on-surface-variant">{t("ocfg.s1tag")}</span>
                  </div>

                  <div className="flex flex-col gap-space-md lg:max-w-2xl">
                    <div className="grid grid-cols-3 gap-space-sm">
                      {dims.map((f) => (
                        <div key={f.key} className="flex flex-col gap-space-2xs">
                          <label className="font-label-caps uppercase tracking-wider text-on-surface-variant">{t(f.key)}</label>
                          <div className="flex items-center rounded bg-surface-container-low shadow-sm">
                            <input name={f.name} value={f.v} onChange={(e) => f.set(+e.target.value)} className={inputCls} type="number" step={0.1} min={1} />
                            <span className="bg-surface-container px-space-xs py-space-xs font-mono-metric-sm text-on-surface-variant">{f.unit}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-space-sm pt-space-xs">
                      {[
                        [t("ocfg.encVol"), volume.toFixed(1), "m³"],
                        [t("ocfg.extSurf"), envelopeArea.toFixed(1), "m²"],
                        [t("ocfg.formFactor"), av.toFixed(2), "m⁻¹"],
                      ].map(([k, v, u]) => (
                        <div key={k} className="rounded bg-surface-container-low p-space-sm">
                          <span className="block font-label-caps uppercase tracking-wider text-on-surface-variant">{k}</span>
                          <span className="font-mono-metric-lg font-bold text-primary">{v}</span>
                          <span className="font-mono-metric-sm text-on-surface-variant"> {u}</span>
                        </div>
                      ))}
                    </div>
                    <p className="font-body-sm text-on-surface-variant">{t("ocfg.aspectNote")}</p>
                  </div>
                </div>

                {/* ENVELOPE LAYERS */}
                <SectionCard title={t("cfg.layers.title")} tag={t("cfg.layers.tag")}>
                  <LayerBuilder />
                </SectionCard>

                {/* ADVANCED */}
                <div className="rounded-lg bg-surface-container-lowest p-card-padding shadow-sm">
                  <div className="mb-space-lg flex items-center justify-between pb-space-sm">
                    <div className="flex items-center gap-space-xs">
                      <span className="h-4 w-2 rounded-sm bg-secondary-container" />
                      <h2 className="font-headline-md text-on-surface">{t("ocfg.s3")}</h2>
                      <span className="rounded bg-secondary-fixed px-space-xs py-space-2xs font-mono-metric-sm text-secondary">{t("ocfg.orgAccess")}</span>
                    </div>
                    <span className="font-label-caps uppercase tracking-wider text-outline-variant">{t("ocfg.s3tag")}</span>
                  </div>

                  <div className="grid gap-space-lg md:grid-cols-2">
                    <div className="rounded bg-surface-container-low p-space-md">
                      <div className="flex items-center gap-space-xs">
                        <span className="text-primary">◫</span>
                        <span className="font-headline-sm text-on-surface">{t("ocfg.intCap")}</span>
                      </div>
                      <div className="mt-space-md grid gap-space-sm sm:grid-cols-2">
                        <div className="flex flex-col gap-space-2xs">
                          <label className="font-label-caps uppercase tracking-wider text-on-surface-variant">{t("ocfg.contentsMass")}</label>
                          <div className="flex items-center rounded bg-surface-container-lowest shadow-sm">
                            <input name="adv.contents_mass_kg" value={contentsMass} onChange={(e) => setContentsMass(+e.target.value)} className={inputCls} type="number" />
                            <span className="bg-surface-container px-space-xs py-space-xs font-mono-metric-sm text-on-surface-variant">kg</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-space-2xs">
                          <label className="font-label-caps uppercase tracking-wider text-on-surface-variant">{t("ocfg.specHeat")}</label>
                          <div className="flex items-center rounded bg-surface-container-lowest shadow-sm">
                            <input name="adv.contents_cp" value={contentsCp} onChange={(e) => setContentsCp(+e.target.value)} className={inputCls} type="number" />
                            <span className="bg-surface-container px-space-xs py-space-xs font-mono-metric-sm text-on-surface-variant">J/kg·K</span>
                          </div>
                        </div>
                      </div>
                      <p className="mt-space-md font-mono-metric-sm text-on-surface-variant">
                        {t("ocfg.timeConst")}: <strong className="text-on-surface">{tau.toFixed(1)} h</strong>
                      </p>
                    </div>

                    <div className="rounded bg-surface-container-low p-space-md">
                      <div className="flex items-center gap-space-xs">
                        <span className="text-primary">◌</span>
                        <span className="font-headline-sm text-on-surface">{t("ocfg.boundaryCoef")}</span>
                      </div>
                      <div className="mt-space-md grid gap-space-sm sm:grid-cols-2">
                        <div className="flex flex-col gap-space-2xs">
                          <label className="font-label-caps uppercase tracking-wider text-on-surface-variant">{t("ocfg.insideConv")}</label>
                          <div className="flex items-center rounded bg-surface-container-lowest shadow-sm">
                            <input name="adv.h_inside" defaultValue={2.5} step={0.1} className={inputCls} type="number" />
                            <span className="bg-surface-container px-space-xs py-space-xs font-mono-metric-sm text-on-surface-variant">W/m²·K</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-space-2xs">
                          <label className="font-label-caps uppercase tracking-wider text-on-surface-variant">{t("ocfg.outsideConv")}</label>
                          <div className="flex items-center rounded bg-surface-container-lowest shadow-sm">
                            <input name="adv.h_outside" defaultValue={10} step={0.5} className={inputCls} type="number" />
                            <span className="bg-surface-container px-space-xs py-space-xs font-mono-metric-sm text-on-surface-variant">W/m²·K</span>
                          </div>
                        </div>
                      </div>
                      <p className="mt-space-md font-mono-metric-sm text-on-surface-variant">{t("ocfg.windNote")}</p>
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            <SiteComfortEnvFields startIndex={4} showEnv={showEnvelope} />

            {mode === "optimize" ? <OptimizerFields /> : null}

            <div className="flex flex-wrap items-center justify-end gap-space-md pt-space-md">
              <Link href="/" className="rounded bg-surface-container px-space-md py-space-sm font-body-md font-medium text-on-surface transition-colors hover:bg-surface-container-high">
                {t("common.cancel")}
              </Link>
              <button type="submit" className="rounded bg-primary px-space-md py-space-sm font-body-md font-semibold text-on-primary transition-colors hover:bg-primary-container">
                {mode === "optimize" ? t("opt.cta") : t("common.runSim")}
              </button>
            </div>
          </form>
        </section>
      </main>
    </main>
  );
}
