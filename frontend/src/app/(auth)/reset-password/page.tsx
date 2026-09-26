"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ROUTES } from "@/lib/routes";
import { T, useT } from "@/lib/i18n";

const GREEN = "#059669";
const AMBER = "#D97706";
const RED = "#BA1A1A";

type Grade = { level: 0 | 1 | 2 | 3; label: string; grade: string; color: string; tint: string };

/** Rough entropy estimate: length × log2(character pool). */
function assess(pass: string): Grade & { bits: number } {
  let pool = 0;
  if (/[a-z]/.test(pass)) pool += 26;
  if (/[A-Z]/.test(pass)) pool += 26;
  if (/\d/.test(pass)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pass)) pool += 33;
  const bits = pass.length ? Math.round(pass.length * Math.log2(Math.max(pool, 1))) : 0;
  if (pass.length === 0) return { level: 0, label: "Awaiting Input", grade: "—", color: "#64748B", tint: "#F8FAFC", bits };
  if (pass.length < 8) return { level: 1, label: "Weak", grade: "GRADE C", color: RED, tint: "#FEF2F2", bits };
  if (pass.length <= 14 || bits < 80) return { level: 2, label: "Fair", grade: "GRADE B", color: AMBER, tint: "#FFFBEB", bits };
  return { level: 3, label: "Exceptional", grade: "GRADE A+", color: GREEN, tint: "#ECFDF5", bits };
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const t = useT();
  const [pass, setPass] = useState("Himalaya@K2#Stratum2025");
  const [confirm, setConfirm] = useState("Himalaya@K2#Stratum2025");
  const [visible, setVisible] = useState(true);
  const [done, setDone] = useState(false);

  const strength = assess(pass);
  const matches = confirm.length > 0 && confirm === pass;
  const policy = [
    { label: "Minimum 14 characters", ok: pass.length >= 14 },
    { label: "At least 1 symbol and uppercase letter", ok: /[A-Z]/.test(pass) && /[^A-Za-z0-9]/.test(pass) },
    { label: "Not recycled within last 12 operational cycles", ok: pass.length > 0 },
  ];
  const canSubmit = matches && policy.every((p) => p.ok) && !done;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setDone(true);
    setTimeout(() => router.push(ROUTES.login), 1000);
  }

  return (
    <>
      <div className="flex flex-col w-full items-center">
        {/* Card Container */}
        <div className="w-full max-w-[420px] bg-surface-container-lowest rounded-xl shadow-card p-margin flex flex-col relative overflow-hidden">
          {/* Top Micro Indicator */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-secondary to-primary-container" />
          {/* Header Section */}
          <div className="flex flex-col mt-space-xs">
            <div className="flex items-center justify-between">
              <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight font-semibold">
                <T>Reset Passphrase</T>
              </h1>
              <span className="inline-flex items-center gap-1 font-label-mono-xs text-label-mono-xs uppercase px-1.5 py-0.5 rounded-full bg-surface-container text-secondary font-medium" style={{ backgroundColor: "rgb(236, 251, 252)", color: "rgb(15, 122, 140)", border: "1px solid rgba(15, 122, 140, 0.2)" }}>
                <span className="material-symbols-outlined text-[13px]">key</span>
                {" "}<T>CYCLE 2025-Q1</T>
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-outline mt-1 mb-5">
              <T>Establish defense-grade credentials for workstation clearance.</T>
            </p>
          </div>
          {/* Authenticated Identity Chip */}
          <div className="bg-surface-container-low p-2 rounded-xl flex items-center justify-between mb-4 shadow-sm" style={{ backgroundColor: "rgb(236, 251, 252)", border: "1px solid rgba(15, 122, 140, 0.3)", color: "rgb(15, 122, 140)" }}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-secondary text-[16px] shrink-0" style={{ color: "rgb(15, 122, 140)" }}>
                verified_user
              </span>
              <span className="font-body-sm text-body-sm text-on-surface font-medium truncate"><T>Lt. Col. V. Rathore</T></span>
            </div>
            <span className="font-label-mono-xs text-label-mono-xs text-secondary-container bg-surface-container-high px-1.5 py-0.5 rounded-full font-semibold tracking-wider shrink-0 ml-2 font-data" style={{ backgroundColor: "rgba(15, 122, 140, 0.12)", color: "rgb(15, 122, 140)" }}>
              SEC-ID #8821
            </span>
          </div>
          {/* Passphrase Form */}
          <form className="flex flex-col gap-space-md" onSubmit={handleSubmit}>
            {/* Field 1: New Passphrase */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="font-label-mono-xs text-label-mono-xs tracking-wider text-outline font-semibold uppercase" htmlFor="newPass">
                  <T>New Defence Passphrase</T>
                </label>
                <span className="font-label-mono-xs text-label-mono-xs text-outline"><T>REQ: 128-BIT SYM</T></span>
              </div>
              <div className="relative flex items-center">
                <input autoComplete="new-password" className="w-full h-9 rounded bg-surface-container-lowest px-3 pr-9 font-label-mono-md text-label-mono-md text-on-surface focus:outline-none shadow-sm focus:shadow-md transition-all" id="newPass" type={visible ? "text" : "password"} value={pass} onChange={(e) => setPass(e.target.value)} />
                <button aria-label={t("Toggle password visibility")} className="absolute right-2 text-outline hover:text-on-surface flex items-center justify-center p-1 rounded-full hover:bg-surface-container-high" onClick={() => setVisible((v) => !v)} type="button">
                  <span className="material-symbols-outlined text-[18px]">{visible ? "visibility" : "visibility_off"}</span>
                </button>
              </div>
              {/* Semantic Strength Indicator */}
              <div className="flex flex-col gap-1.5 mt-1 bg-surface-container-low p-2 rounded-xl" style={{ backgroundColor: strength.tint, border: `1px solid ${strength.color}4D` }}>
                <div className="grid grid-cols-3 gap-1.5 w-full">
                  {[1, 2, 3].map((seg) => (
                    <div key={seg} className="h-1.5 rounded-full" style={{ backgroundColor: seg <= strength.level ? strength.color : "#E2E8F0" }} />
                  ))}
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <div className="flex items-center gap-1.5" style={{ color: strength.color }}>
                    <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      {strength.level === 3 ? "check_circle" : strength.level === 0 ? "radio_button_unchecked" : "error"}
                    </span>
                    <span className="font-label-mono-xs text-label-mono-xs font-semibold">
                      <T>Passphrase Strength:</T> <T>{strength.label}</T> <T>(Entropy:</T> <span className="font-data">{strength.bits}</span> <T>bits)</T>
                    </span>
                  </div>
                  <span className="font-label-mono-xs text-label-mono-xs uppercase" style={{ color: strength.color, fontWeight: "600" }}>
                    {strength.grade}
                  </span>
                </div>
                {/* Semantic Color Reference Guide */}
                <div className="mt-1 pt-1.5 font-label-mono-xs text-label-mono-xs text-outline leading-tight flex flex-col gap-1">
                  <span className="uppercase tracking-wider font-semibold text-outline"><T>Semantic Grading Standard</T></span>
                  <div className="flex items-center justify-between text-[9px] gap-1">
                    <span className={`flex items-center gap-1 ${strength.level === 1 ? "font-semibold" : ""}`} style={{ color: "rgb(186, 26, 26)" }}>
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: RED }} />
                      <span>
                        <T>Weak (&lt;</T><span className="font-data">8</span> <T>chars)</T>
                      </span>
                    </span>
                    <span className={`flex items-center gap-1 ${strength.level === 2 ? "font-semibold" : ""}`} style={{ color: "rgb(217, 119, 6)" }}>
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: AMBER }} />
                      {" "}<T>Fair</T>
                    </span>
                    <span className={`flex items-center gap-1 ${strength.level === 3 ? "font-semibold" : ""}`} style={{ color: "rgb(5, 150, 105)" }}>
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: GREEN }} />
                      <span>
                        <T>Mission-Ready (&gt;</T><span className="font-data">14</span> <T>chars)</T>
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {/* Field 2: Confirm New Passphrase */}
            <div className="flex flex-col gap-1.5">
              <label className="font-label-mono-xs text-label-mono-xs tracking-wider text-outline font-semibold uppercase" htmlFor="confirmPass">
                <T>Confirm New Passphrase</T>
              </label>
              <div className="relative flex items-center">
                <input autoComplete="new-password" className={`w-full h-9 rounded bg-surface-container-lowest px-3 pr-9 font-label-mono-md text-label-mono-md text-on-surface focus:outline-none shadow-sm focus:shadow-md transition-all ring-1 ${matches || !confirm ? "ring-secondary-container/40" : "ring-error/40"}`} id="confirmPass" type={visible ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={!matches && confirm.length > 0} />
                {confirm.length > 0 && (
                  <span className="absolute right-2.5 flex items-center justify-center rounded-full p-1" style={{ color: matches ? GREEN : RED }}>
                    <span className="material-symbols-outlined text-[18px]">{matches ? "verified" : "error"}</span>
                  </span>
                )}
              </div>
              {confirm.length > 0 && (
                <div className="flex items-center gap-1 mt-0.5" style={{ color: matches ? GREEN : RED }} role={matches ? undefined : "alert"}>
                  <span className="material-symbols-outlined text-[14px]">{matches ? "done_all" : "cancel"}</span>
                  <span className="font-label-mono-xs text-label-mono-xs font-semibold">
                    <T>{matches ? "Passphrases match perfectly" : "Passphrases do not match"}</T>
                  </span>
                </div>
              )}
            </div>
            {/* Password Policy Checklist */}
            <div className="p-2.5 rounded-xl flex flex-col gap-1.5" style={{ backgroundColor: "rgb(248, 250, 252)", border: "1px solid rgb(226, 232, 240)" }}>
              <span className="font-label-mono-xs text-label-mono-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
                <T>DEFSTAN 00-35 Policy Parameters</T>
              </span>
              <div className="grid grid-cols-1 gap-1">
                {policy.map((rule) => (
                  <div key={rule.label} className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[14px]" style={{ color: rule.ok ? GREEN : "#94A3B8" }}>
                      {rule.ok ? "check" : "close"}
                    </span>
                    <span className="font-body-sm text-body-sm" style={{ color: "#475569" }}><T>{rule.label}</T></span>
                  </div>
                ))}
              </div>
            </div>
            {/* Submit Action */}
            <button className="bg-primary hover:bg-primary-container active:bg-primary text-on-primary font-label-mono-xs text-label-mono-xs font-medium tracking-wider uppercase py-2.5 px-4 rounded-[10px] w-full flex items-center justify-center gap-2 shadow-sm transition-colors mt-2 disabled:opacity-60 disabled:cursor-not-allowed hover-lift" type="submit" disabled={!canSubmit} style={{ backgroundColor: "rgb(30, 58, 138)", color: "rgb(255, 255, 255)" }}>
              <span className="material-symbols-outlined text-[16px]">{done ? "check_circle" : "sync_lock"}</span>
              <T>{done ? " Passphrase Updated — Re-authenticate" : " Update Passphrase & Re-authenticate"}</T>
            </button>
          </form>
          {/* Return Link */}
          <Link className="font-body-sm text-body-sm text-center text-outline hover:text-on-surface font-medium block mt-4 transition-colors" href={ROUTES.login}>
            <T>Cancel and return to Secure Sign In</T>
          </Link>
        </div>
      </div>
    </>
  );
}
