"use client";

import { useState } from "react";
import SectionCard from "@/app/_components/SectionCard";
import { useT } from "@/app/_lib/i18n";

const inputCls =
  "w-full rounded bg-surface-container-low px-space-sm py-space-xs font-mono-metric-md text-on-surface outline-none transition-colors focus:bg-surface-container-lowest";
const labelCls =
  "block font-label-caps uppercase tracking-wider text-on-surface-variant";
const hintCls = "font-body-sm text-on-surface-variant";

/**
 * The shared config fields missing from both configure pages:
 * site + analysis period, comfort target/band, air infiltration + ground.
 * Static only — no submit wiring yet.
 */
export default function SiteComfortEnvFields({
  startIndex = 5,
  showEnv = true,
  showGround = true,
  showWorstWindow = true,
}: {
  startIndex?: number;
  showEnv?: boolean;
  /** hide the ground-temperature control (the optimize flow always uses
   * the 10-yr annual-mean proxy) */
  showGround?: boolean;
  /** hide the worst-case-window control — only the ANSYS validation and the
   * worst-case reliability re-rank consume it, so flows that run neither
   * (e.g. the household optimize flow) fall back to the backend default */
  showWorstWindow?: boolean;
}) {
  const t = useT();
  const [groundMode, setGroundMode] = useState<"auto" | "manual">("auto");

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <>
      <SectionCard index={pad(startIndex)} title={t("cfg.site.title")} tag={t("cfg.site.tag")}>
        <div className="grid gap-space-md md:grid-cols-2">
          <div className="space-y-space-2xs">
            <span className={labelCls}>{t("cfg.site.location")}</span>
            <div className="rounded bg-surface-container-low px-space-sm py-space-xs font-mono-metric-md text-on-surface">
              {t("cfg.site.locationVal")}
            </div>
          </div>
          <div className="space-y-space-2xs">
            <label className={labelCls}>{t("cfg.site.season")}</label>
            <select name="site.season" className={inputCls} defaultValue="winter">
              <option value="winter">{t("cfg.site.seasonWinter")}</option>
              <option value="spring">{t("cfg.site.seasonSpring")}</option>
              <option value="summer">{t("cfg.site.seasonSummer")}</option>
              <option value="autumn">{t("cfg.site.seasonAutumn")}</option>
            </select>
          </div>
          <div className="space-y-space-2xs">
            <label className={labelCls}>{t("cfg.site.typicalWindow")}</label>
            <input name="site.typical_hours" className={inputCls} type="number" defaultValue={168} />
            <span className={hintCls}>{t("cfg.site.typicalHint")}</span>
          </div>
          {!showWorstWindow ? null : (
          <div className="space-y-space-2xs">
            <label className={labelCls}>{t("cfg.site.worstWindow")}</label>
            <input name="site.worst_hours" className={inputCls} type="number" defaultValue={48} />
            <span className={hintCls}>{t("cfg.site.worstHint")}</span>
          </div>
          )}
        </div>
      </SectionCard>

      <SectionCard index={pad(startIndex + 1)} title={t("cfg.comfort.title")} tag={t("cfg.comfort.tag")}>
        <div className="grid gap-space-md sm:grid-cols-3">
          <div className="space-y-space-2xs">
            <label className={labelCls}>{t("cfg.comfort.target")}</label>
            <div className="relative flex items-center">
              <input name="comfort.target_C" className={inputCls} type="number" defaultValue={18} step={0.5} />
              <span className="pointer-events-none absolute right-9 font-mono-metric-sm text-outline">°C</span>
            </div>
          </div>
          <div className="space-y-space-2xs">
            <label className={labelCls}>{t("cfg.comfort.bandLo")}</label>
            <div className="relative flex items-center">
              <input name="comfort.band_lo_C" className={inputCls} type="number" defaultValue={15} step={0.5} />
              <span className="pointer-events-none absolute right-9 font-mono-metric-sm text-outline">°C</span>
            </div>
          </div>
          <div className="space-y-space-2xs">
            <label className={labelCls}>{t("cfg.comfort.bandHi")}</label>
            <div className="relative flex items-center">
              <input name="comfort.band_hi_C" className={inputCls} type="number" defaultValue={24} step={0.5} />
              <span className="pointer-events-none absolute right-9 font-mono-metric-sm text-outline">°C</span>
            </div>
          </div>
        </div>
        <p className={`${hintCls} mt-space-sm`}>{t("cfg.comfort.hint")}</p>
      </SectionCard>

      {!showEnv ? null : (
      <SectionCard index={pad(startIndex + 2)} title={t("cfg.env.title")}>
        <div className="grid gap-space-md md:grid-cols-2">
          <div className="space-y-space-2xs">
            <label className={labelCls}>{t("cfg.env.ach")}</label>
            <input name="env.ach" className={inputCls} type="number" defaultValue={0.7} step={0.1} />
            <span className={hintCls}>{t("cfg.env.achHint")}</span>
          </div>
          {!showGround ? null : (
          <div className="space-y-space-xs">
            <span className={labelCls}>{t("cfg.env.ground")}</span>
            <div className="flex flex-col gap-space-2xs">
              <label className="flex items-center gap-space-xs font-body-sm text-on-surface">
                <input
                  type="radio"
                  name="env.ground_mode"
                  value="annual_mean"
                  className="accent-primary"
                  checked={groundMode === "auto"}
                  onChange={() => setGroundMode("auto")}
                />
                {t("cfg.env.groundAuto")}
              </label>
              <label className="flex items-center gap-space-xs font-body-sm text-on-surface">
                <input
                  type="radio"
                  name="env.ground_mode"
                  value="manual"
                  className="accent-primary"
                  checked={groundMode === "manual"}
                  onChange={() => setGroundMode("manual")}
                />
                {t("cfg.env.groundManual")}
              </label>
              <div className={groundMode === "manual" ? "relative mt-space-2xs flex w-40 items-center" : "hidden"}>
                <input name="env.ground_C" className={inputCls} type="number" defaultValue={-3.6} step={0.5} />
                <span className="pointer-events-none absolute right-9 font-mono-metric-sm text-outline">°C</span>
              </div>
            </div>
          </div>
          )}
        </div>
      </SectionCard>
      )}
    </>
  );
}
