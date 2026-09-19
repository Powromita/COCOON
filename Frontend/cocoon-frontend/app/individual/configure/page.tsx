"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteHeader from "@/app/_components/SiteHeader";
import SiteComfortEnvFields from "@/app/_components/SiteComfortEnvFields";
import { buildRunRequest } from "@/app/_lib/buildRequest";
import { stashRequest } from "@/app/_lib/api";
import { useT } from "@/app/_lib/i18n";

export default function IndividualConfigurePage() {
  const t = useT();
  const router = useRouter();

  const [L, setL] = useState(6);
  const [W, setW] = useState(4);
  const [H, setH] = useState(2.8);
  const [initC, setInitC] = useState(5);
  const [people, setPeople] = useState(5);

  const floorArea = useMemo(() => L * W, [L, W]);
  const volume = useMemo(() => L * W * H, [L, W, H]);
  // occupancy is the only internal heat source on this screen (the auxiliary
  // heater control was removed); ~90 W of metabolic + breathing load per person
  const internalGain = useMemo(() => Math.round(people * 90), [people]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // the household user gives the box + openings + how they'll live in it;
    // the pipeline designs the walls/roof/floor materials and thicknesses
    stashRequest(buildRunRequest(new FormData(e.currentTarget), "optimize"));
    router.push("/individual/results");
  };

  const geometry: { key: string; hintKey: string; name: string; value: number; set: (n: number) => void }[] = [
    { key: "icfg.len", hintKey: "icfg.ew", name: "geom.length_m", value: L, set: setL },
    { key: "icfg.wid", hintKey: "icfg.ns", name: "geom.width_m", value: W, set: setW },
    { key: "icfg.hgt", hintKey: "icfg.apex", name: "geom.height_m", value: H, set: setH },
  ];

  const inputCls =
    "w-full rounded bg-surface-container-low px-space-sm py-space-xs font-mono-metric-md text-on-surface outline-none transition-colors focus:bg-surface-container-lowest";

  return (
    <main className="min-h-screen bg-surface text-on-surface antialiased">
      <SiteHeader mode="Individual" active="configure" />

      <main className="w-full bg-surface pt-16">
        <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-7xl flex-col px-space-md py-space-xl md:px-space-xl">
          <div className="mb-space-xl flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-card-padding shadow-sm md:flex-row md:items-end md:justify-between">
            <div className="min-w-0 flex-1 space-y-space-2xs">
              <div className="flex items-center gap-space-xs text-primary">
                <span className="font-mono-metric-sm uppercase tracking-wider">{t("icfg.crumb1")}</span>
                <span className="text-outline-variant">/</span>
                <span className="text-on-surface-variant">{t("icfg.crumb2")}</span>
              </div>
              <h1 className="font-display-xl tracking-tight text-on-surface">{t("icfg.title")}</h1>
              <p className="w-full max-w-2xl font-body-md text-on-surface-variant">{t("icfg.sub")}</p>
            </div>
            <div className="flex items-center gap-space-xs self-start rounded-full bg-surface-container-low px-space-md py-space-xs shadow-sm md:self-auto">
              <span className="text-primary">⌂</span>
              <span className="font-mono-metric-sm font-medium text-on-surface">{t("hdr.mode.Individual")}</span>
              <span className="text-outline-variant">|</span>
              <Link href="/" className="font-mono-metric-sm text-primary hover:underline">
                {t("common.switch")}
              </Link>
            </div>
          </div>

          {/* 01 GEOMETRY */}
          <section className="mb-space-xl rounded-xl bg-surface-container-lowest p-card-padding shadow-sm">
            <div className="mb-space-lg flex items-center justify-between pb-space-sm">
              <div className="flex items-center gap-space-xs">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-surface-container-high text-sm font-mono-metric-sm font-semibold text-primary">01</span>
                <h2 className="font-headline-md text-on-surface">{t("icfg.s1")}</h2>
              </div>
              <span className="font-mono-metric-sm text-on-surface-variant">{t("icfg.s1tag")}</span>
            </div>

            <div className="grid items-center gap-space-lg lg:grid-cols-12">
              <div className="grid gap-space-sm lg:col-span-6 lg:grid-cols-3">
                {geometry.map((f) => (
                  <div key={f.key} className="space-y-space-2xs">
                    <label className="block font-label-caps uppercase tracking-wider text-on-surface-variant">{t(f.key)}</label>
                    <div className="relative flex items-center">
                      <input
                        name={f.name}
                        value={f.value}
                        onChange={(e) => f.set(+e.target.value)}
                        className={inputCls}
                        type="number"
                        step={0.1}
                        min={1}
                      />
                      <span className="pointer-events-none absolute right-9 font-mono-metric-sm text-outline">m</span>
                    </div>
                    <span className="font-body-sm text-on-surface-variant">{t(f.hintKey)}</span>
                  </div>
                ))}
              </div>

              <div className="flex min-h-[220px] flex-col justify-between gap-space-md rounded-lg bg-surface-container-low p-space-md lg:col-span-6 sm:flex-row">
                <div className="flex flex-1 items-center justify-center">
                  <svg viewBox="0 0 180 120" className="h-32 w-44 stroke-primary fill-transparent">
                    <polygon className="fill-surface-container-high/40 stroke-outline" points="30,75 90,105 150,75 90,45" />
                    <line className="stroke-primary" x1="30" x2="30" y1="75" y2="35" />
                    <line className="stroke-primary" x1="90" x2="90" y1="105" y2="65" />
                    <line className="stroke-primary" x1="150" x2="150" y1="75" y2="35" />
                    <polygon className="fill-surface-variant/40 stroke-primary" points="30,35 90,65 150,35 90,10" />
                    <text x="46" y="98" className="fill-on-surface-variant text-[9px] font-mono-metric-sm">L {L.toFixed(1)}m</text>
                    <text x="118" y="98" className="fill-on-surface-variant text-[9px] font-mono-metric-sm">W {W.toFixed(1)}m</text>
                    <text x="10" y="55" className="fill-primary text-[9px] font-mono-metric-sm">H {H.toFixed(1)}m</text>
                  </svg>
                </div>
                <div className="flex w-full gap-space-md sm:w-auto sm:flex-col">
                  <div className="flex-1 rounded bg-surface-container-lowest p-space-sm shadow-sm">
                    <span className="block font-label-caps uppercase tracking-wider text-on-surface-variant">{t("icfg.floorArea")}</span>
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono-metric-lg font-semibold text-primary">{floorArea.toFixed(1)}</span>
                      <span className="font-mono-metric-sm text-on-surface-variant">m²</span>
                    </div>
                  </div>
                  <div className="flex-1 rounded bg-surface-container-lowest p-space-sm shadow-sm">
                    <span className="block font-label-caps uppercase tracking-wider text-on-surface-variant">{t("icfg.encVol")}</span>
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono-metric-lg font-semibold text-secondary">{volume.toFixed(1)}</span>
                      <span className="font-mono-metric-sm text-on-surface-variant">m³</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 02 WINDOWS & DOORS */}
          <section className="mb-space-xl rounded-xl bg-surface-container-lowest p-card-padding shadow-sm">
            <div className="mb-space-lg flex items-center justify-between pb-space-sm">
              <div className="flex items-center gap-space-xs">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-surface-container-high text-sm font-mono-metric-sm font-semibold text-primary">02</span>
                <h2 className="font-headline-md text-on-surface">{t("icfg.s3")}</h2>
              </div>
              <span className="font-mono-metric-sm text-on-surface-variant">{t("icfg.s3tag")}</span>
            </div>

            <div className="grid gap-space-md sm:grid-cols-4">
              <div className="space-y-space-2xs">
                <label className="block font-label-caps uppercase tracking-wider text-on-surface-variant">{t("icfg.numWin")}</label>
                <div className="relative flex items-center">
                  <input name="win.count" defaultValue={2} className={inputCls} type="number" min={0} step={1} />
                  <span className="pointer-events-none absolute right-9 font-mono-metric-sm text-outline">{t("icfg.units")}</span>
                </div>
                <span className="font-body-sm text-on-surface-variant">{t("icfg.winPriority")}</span>
              </div>
              <div className="space-y-space-2xs sm:col-span-2">
                <label className="block font-label-caps uppercase tracking-wider text-on-surface-variant">{t("icfg.dims")}</label>
                <div className="grid grid-cols-2 gap-space-xs">
                  <div className="relative">
                    <input name="win.width_m" defaultValue={1.2} className={inputCls} type="number" step={0.1} />
                    <span className="pointer-events-none absolute right-9 top-1/2 -translate-y-1/2 text-outline">m</span>
                  </div>
                  <div className="relative">
                    <input name="win.height_m" defaultValue={1.5} className={inputCls} type="number" step={0.1} />
                    <span className="pointer-events-none absolute right-9 top-1/2 -translate-y-1/2 text-outline">m</span>
                  </div>
                </div>
                <span className="font-body-sm text-on-surface-variant">{t("icfg.apArea")}</span>
              </div>
              <div className="space-y-space-2xs">
                <label className="block font-label-caps uppercase tracking-wider text-on-surface-variant">{t("icfg.numDoor")}</label>
                <div className="relative flex items-center">
                  <input name="door.count" defaultValue={1} className={inputCls} type="number" min={0} step={1} />
                  <span className="pointer-events-none absolute right-9 font-mono-metric-sm text-outline">{t("icfg.units")}</span>
                </div>
              </div>
            </div>

            <p className="mt-space-md rounded-lg bg-surface-container-low p-space-sm font-body-sm text-on-surface-variant">
              {t("icfg.pipelineDesigns")}
            </p>
          </section>

          <div className="mb-space-xl space-y-space-xl">
            {/* showEnv={false}: the "Air Infiltration & Ground" card is not shown on
                the household flow — the optimize pipeline uses its own ACH / ground
                proxy, and buildRunRequest only forwards env.ach when the field is present.
                showWorstWindow={false}: the household flow runs neither ANSYS nor the
                worst-case reliability re-rank, so site.worst_hours has no visible effect
                here — buildRunRequest falls back to the backend-required default (48). */}
            <SiteComfortEnvFields startIndex={3} showEnv={false} showGround={false} showWorstWindow={false} />
          </div>

          {/* 05 OCCUPANCY & INITIAL CONDITIONS */}
          <section className="rounded-xl bg-surface-container-lowest p-card-padding shadow-sm">
            <div className="mb-space-lg flex items-center justify-between pb-space-sm">
              <div className="flex items-center gap-space-xs">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-surface-container-high text-sm font-mono-metric-sm font-semibold text-primary">05</span>
                <h2 className="font-headline-md text-on-surface">{t("icfg.s4")}</h2>
              </div>
              <span className="font-mono-metric-sm text-on-surface-variant">{t("icfg.s4tag")}</span>
            </div>

            <div className="space-y-space-lg">
              {/* Row 1 — initial indoor temperature, full width */}
              <div className="space-y-space-xs">
                <div className="flex items-center justify-between gap-space-md">
                  <div>
                    <label htmlFor="gain-initial-c" className="block font-headline-sm text-on-surface">{t("icfg.initTemp")}</label>
                    <p className="font-body-sm text-on-surface-variant">{t("icfg.initTempDesc")}</p>
                  </div>
                  <div className="rounded bg-surface-container-high px-space-sm py-space-2xs">
                    <span className="font-mono-metric-lg font-bold text-primary">{initC >= 0 ? "+" : ""}{initC.toFixed(1)}</span>
                    <span className="font-mono-metric-sm text-primary">°C</span>
                  </div>
                </div>
                <input
                  id="gain-initial-c"
                  name="gain.initial_C"
                  className="h-2 w-full cursor-pointer accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  type="range"
                  value={initC}
                  onChange={(e) => setInitC(+e.target.value)}
                  min={-10}
                  max={22}
                  step={0.5}
                />
                <div className="flex justify-between font-mono-metric-sm text-on-surface-variant">
                  <span>{t("icfg.frozen")}</span>
                  <span>{t("icfg.warm")}</span>
                </div>
              </div>

              {/* Row 2 — occupancy load (editable) + total internal gain (calculated) */}
              <div className="grid gap-space-md lg:grid-cols-2">
                <div className="space-y-space-2xs rounded-lg bg-surface-container-low p-space-md">
                  <label htmlFor="gain-people" className="block font-label-caps uppercase tracking-wider text-on-surface-variant">{t("icfg.occLoad")}</label>
                  <div className="flex items-center rounded bg-surface-container-lowest shadow-sm focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">
                    <input
                      id="gain-people"
                      value={people}
                      onChange={(e) => setPeople(+e.target.value)}
                      className="min-h-[44px] w-full bg-transparent px-space-sm py-space-xs font-mono-metric-md text-on-surface outline-none"
                      type="number"
                      min={0}
                    />
                    <span className="bg-surface-container px-space-xs py-space-xs font-mono-metric-sm text-on-surface-variant">{t("icfg.people")}</span>
                  </div>
                  <p className="font-body-sm text-on-surface-variant">{t("icfg.occDesc")}</p>
                </div>

                <div className="space-y-space-2xs rounded-lg bg-surface-container-low p-space-md" title={t("icfg.gainTip")}>
                  <div className="flex items-center justify-between gap-space-xs">
                    <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">{t("cfg.gain.derived")}</span>
                    <span className="rounded bg-surface-container-high px-space-2xs font-label-caps uppercase tracking-wider text-on-surface-variant">{t("icfg.calcTag")}</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono-metric-lg font-bold text-primary">{internalGain}</span>
                    <span className="font-mono-metric-sm text-primary">W</span>
                  </div>
                  <p className="font-body-sm text-on-surface-variant">{people} {t("icfg.occupants")} × 90 W/person</p>
                  {/* calculated, read-only — occupancy is the only remaining internal
                      heat source after the heater control was removed */}
                  <input type="hidden" name="gain.internal_W" value={internalGain} readOnly />
                </div>
              </div>

              <div className="flex flex-col gap-space-sm pt-space-lg sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                <Link href="/" className="rounded bg-surface-container px-space-md py-space-sm text-center font-body-md font-medium text-on-surface transition-colors hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  {t("common.cancel")}
                </Link>
                <button type="submit" className="rounded bg-primary px-space-md py-space-sm font-body-md font-semibold text-on-primary transition-colors hover:bg-primary-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  {t("icfg.designCta")}
                </button>
              </div>
            </div>
          </section>
        </form>
      </main>
    </main>
  );
}
