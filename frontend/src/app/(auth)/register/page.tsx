"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ROUTES } from "@/lib/routes";
import { T, useT } from "@/lib/i18n";

export default function RegisterPage() {
  const router = useRouter();
  const t = useT();
  const [passphrase, setPassphrase] = useState("AlphaShield99!");
  const [confirm, setConfirm] = useState("AlphaShield98!");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [consent, setConsent] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== passphrase;
  const canSubmit = !mismatch && confirm.length > 0 && consent && !submitted;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitted(true);
    setTimeout(() => router.push(ROUTES.login), 1200);
  }

  return (
    <>
      <div className="flex flex-col w-full items-center justify-center">
        <div className="w-full max-w-[420px] bg-surface-container-lowest rounded-xl shadow-card p-6 relative">
          <div className="flex flex-col mb-5">
            <div className="flex items-center justify-between">
              <h1 className="font-headline-md text-headline-md text-on-surface font-semibold tracking-tight">
                <T>Clearance &amp; Account Registration</T>
              </h1>
              <span className="font-label-mono-xs text-label-mono-xs px-1.5 py-0.5 rounded-full font-medium tracking-wide" style={{ backgroundColor: "rgb(236, 251, 252)", color: "rgb(15, 122, 140)", border: "1px solid rgba(15, 122, 140, 0.2)" }}>
                <T>STAGE 01</T>
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              <T>Thermal shelter synthesis &amp; ANSYS co-simulation access request.</T>
            </p>
          </div>
          <div className="rounded-xl p-2.5 flex items-start gap-2 mb-4" style={{ backgroundColor: "rgb(240, 253, 250)", border: "1px solid rgb(204, 251, 241)" }}>
            <span className="material-symbols-outlined shrink-0" style={{ fontSize: "16px", lineHeight: "16px", color: "#0F7A8C" }}>
              admin_panel_settings
            </span>
            <p className="font-body-sm text-body-sm leading-tight" style={{ color: "#334155" }}>
              <T>Access Level &amp; Solver Quota (L1–L4) are provisioned by Sector Command administrators post-submission based on military security clearance. Roles are not self-assigned.</T>
            </p>
          </div>
          <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1">
              <label className="font-label-mono-xs text-label-mono-xs tracking-wider text-on-surface-variant font-semibold uppercase" htmlFor="officer-name">
                <T>OFFICER NAME &amp; APPOINTMENT / RANK</T>
              </label>
              <div className="relative flex items-center">
                <input className="w-full h-9 bg-surface-container-low rounded px-3 font-body-sm text-body-sm text-on-surface outline-none focus:bg-surface-container-lowest focus:shadow-sm transition-all" id="officer-name" placeholder={t("e.g. Maj. Ananya Sharma (Lead Structural)")} type="text" defaultValue="Maj. Ananya Sharma (Lead Structural)" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-label-mono-xs text-label-mono-xs tracking-wider text-on-surface-variant font-semibold uppercase" htmlFor="officer-email">
                <T>INSTITUTIONAL / DEFENCE EMAIL</T>
              </label>
              <div className="relative flex items-center">
                <input className="w-full h-9 bg-surface-container-low rounded px-3 font-label-mono-md text-label-mono-md text-on-surface outline-none focus:bg-surface-container-lowest focus:shadow-sm transition-all" id="officer-email" placeholder="name@drdo.res.in / army.mil" type="email" defaultValue="a.sharma@drdo.gov.in" />
                <span className="material-symbols-outlined absolute right-2.5 text-base" style={{ color: "rgb(5, 150, 105)" }}>
                  verified_user
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center">
                <label className="font-label-mono-xs text-label-mono-xs tracking-wider text-on-surface-variant font-semibold uppercase" htmlFor="officer-sector">
                  <T>COMMAND POST / RESEARCH ESTABLISHMENT</T>
                </label>
                <span className="font-label-mono-xs text-label-mono-xs text-outline lowercase italic"><T>optional</T></span>
              </div>
              <div className="relative flex items-center">
                <input className="w-full h-9 bg-surface-container-low rounded px-3 font-body-sm text-body-sm text-on-surface outline-none focus:bg-surface-container-lowest focus:shadow-sm transition-all" id="officer-sector" placeholder={t("e.g. DBO Sector Support / DRDO DIHAR Leh")} type="text" defaultValue="DBO Sector Support / DRDO DIHAR Leh" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-label-mono-xs text-label-mono-xs tracking-wider text-on-surface-variant font-semibold uppercase" htmlFor="passphrase">
                <T>CREATE PASSPHRASE</T>
              </label>
              <div className="relative flex items-center">
                <input className="w-full h-9 bg-surface-container-low rounded px-3 font-label-mono-md text-label-mono-md text-on-surface outline-none focus:bg-surface-container-lowest focus:shadow-sm transition-all tracking-widest" id="passphrase" type={showPassphrase ? "text" : "password"} value={passphrase} onChange={(e) => setPassphrase(e.target.value)} required />
                <button aria-label={t("Toggle passphrase visibility")} onClick={() => setShowPassphrase((v) => !v)} className="absolute right-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full w-7 h-7 flex items-center justify-center transition-colors" type="button">
                  <span className="material-symbols-outlined text-base">{showPassphrase ? "visibility" : "visibility_off"}</span>
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className={`font-label-mono-xs text-label-mono-xs tracking-wider font-semibold uppercase ${mismatch ? "text-error" : "text-on-surface-variant"}`} htmlFor="confirm-passphrase">
                <T>CONFIRM PASSPHRASE</T>
              </label>
              <div className="relative flex items-center">
                <input className={`w-full h-9 rounded px-3 font-label-mono-md text-label-mono-md text-on-surface outline-none transition-all tracking-widest ${mismatch ? "bg-error-container/30" : "bg-surface-container-low focus:bg-surface-container-lowest focus:shadow-sm"}`} id="confirm-passphrase" type={showPassphrase ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} required />
                {mismatch && <span className="material-symbols-outlined absolute right-2.5 text-error text-base">error</span>}
                {!mismatch && confirm.length > 0 && (
                  <span className="material-symbols-outlined absolute right-2.5 text-base" style={{ color: "rgb(5, 150, 105)" }}>
                    verified
                  </span>
                )}
              </div>
              {mismatch && (
                <div className="flex items-center gap-1 mt-0.5 text-error font-body-sm text-body-sm" role="alert">
                  <span className="material-symbols-outlined text-sm shrink-0">cancel</span>
                  <span className=""><T>Passphrases do not match. Please verify characters.</T></span>
                </div>
              )}
            </div>
            <div className="pt-1.5 flex items-start gap-2.5">
              <div className="relative flex items-center justify-center mt-0.5">
                <input checked={consent} onChange={(e) => setConsent(e.target.checked)} className="peer h-4 w-4 appearance-none rounded cursor-pointer transition-colors border border-[#64748B] checked:border-transparent checked:bg-[#0F7A8C]" id="doctrine-consent" type="checkbox" />
                <span className="material-symbols-outlined absolute text-on-primary text-xs pointer-events-none hidden peer-checked:block" style={{ fontSize: "13px" }}>
                  check
                </span>
              </div>
              <label className="font-body-sm text-body-sm text-on-surface cursor-pointer select-none leading-normal" htmlFor="doctrine-consent">
                <T>I certify operational authorization under Official Secrets Act &amp; MIL-STD-810H cold climate design doctrine.</T>
              </label>
            </div>
            <button className="h-9 w-full bg-primary-container hover:bg-primary text-on-primary rounded-[10px] font-label-mono-xs text-label-mono-xs uppercase tracking-wider font-semibold flex items-center justify-center gap-2 mt-2 shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed hover-lift" type="submit" disabled={!canSubmit}>
              <span className="material-symbols-outlined text-base">{submitted ? "check_circle" : "how_to_reg"}</span>
              <span className="">
                <T>{submitted ? "Request Submitted — Returning to Sign In" : "Submit for Verification & Vetting"}</T>
              </span>
            </button>
            <div className="flex justify-center items-center gap-1.5 text-center mt-2">
              <span className="font-body-sm text-body-sm text-on-surface-variant"><T>Already have verified clearance?</T></span>
              <Link className="font-body-sm text-body-sm text-primary-container font-semibold hover:underline" href={ROUTES.login}>
                <T>Return to Sign In</T>
              </Link>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
