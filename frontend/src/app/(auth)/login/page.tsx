"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { safeNextPath } from "@/lib/auth-redirect";
import { T, useT } from "@/lib/i18n";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";

type AuthState = "idle" | "authenticating" | "accepted";
const FEATURES = [["device_thermostat", "Thermal", "RC simulation"], ["deployed_code", "Structural", "ANSYS validation"], ["route", "Logistics", "Mission planning"]];

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [authState, setAuthState] = useState<AuthState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthState("authenticating");
    setErrorMessage(null);
    const form = new FormData(event.currentTarget);

    try {
      const { error } = await createClient().auth.signInWithPassword({
        email: String(form.get("email") ?? "").trim(),
        password: String(form.get("password") ?? ""),
      });
      if (error) throw error;

      setAuthState("accepted");
      router.replace(safeNextPath(new URLSearchParams(window.location.search).get("next")));
      router.refresh();
    } catch (error) {
      setAuthState("idle");
      setErrorMessage(error instanceof Error ? error.message : "Unable to sign in.");
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-[1040px] overflow-hidden rounded-2xl border border-line bg-white shadow-card lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden min-h-[590px] overflow-hidden bg-primary px-10 py-9 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full border border-white/10" />
        <div className="absolute -right-8 -top-8 h-52 w-52 rounded-full border border-white/10" />
        <div className="relative">
          <div className="mb-12 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-equilibrium" /><T>Operational decision platform</T></div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-200"><T>Extreme-climate shelter engineering</T></p>
          <h1 className="mt-4 max-w-md text-[34px] font-semibold leading-[1.15] tracking-[-0.03em]"><T>Design safer shelters before deployment.</T></h1>
          <p className="mt-5 max-w-md text-[14px] leading-6 text-blue-100/85"><T>Compare thermal performance, logistics weight, fuel demand and lifecycle cost through one traceable engineering workflow.</T></p>
        </div>
        <div className="relative grid grid-cols-3 gap-3">{FEATURES.map(([icon, label, detail]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[0.07] p-3"><span className="material-symbols-outlined text-[19px] text-secondary-fixed">{icon}</span><p className="mt-4 text-[12px] font-semibold"><T>{label}</T></p><p className="mt-0.5 text-[10px] text-blue-200"><T>{detail}</T></p></div>)}</div>
      </section>

      <section className="flex min-h-[590px] items-center px-6 py-10 sm:px-10 lg:px-12">
        <div className="mx-auto w-full max-w-[390px]">
          <div className="mb-8"><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-fixed text-primary"><span className="material-symbols-outlined text-[22px]">shield_lock</span></div><h2 className="text-[24px] font-semibold tracking-[-0.02em] text-ink"><T>Welcome back</T></h2><p className="mt-2 text-body-md text-ink-muted"><T>Sign in with your authorized institutional account.</T></p></div>
          {errorMessage && <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-red-800" role="alert"><span className="material-symbols-outlined mt-px text-[18px]">error</span><p className="flex-1 text-[11px] leading-4">{errorMessage}</p><button aria-label={t("Dismiss alert")} className="rounded-full p-0.5 hover:bg-red-100" onClick={() => setErrorMessage(null)} type="button"><span className="material-symbols-outlined block text-[16px]">close</span></button></div>}
          <form className="space-y-4" onSubmit={handleAuth}>
            <div><label className="mb-1.5 block text-[11px] font-semibold text-ink-body" htmlFor="defence-id"><T>Institutional email</T></label><div className="relative"><span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-ink-disabled">person</span><input autoComplete="username" className="h-11 w-full rounded-lg border border-line-strong bg-white pl-10 pr-3 text-body-md text-ink outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/15" id="defence-id" name="email" placeholder="name@drdo.gov.in" required type="email" /></div></div>
            <div><div className="mb-1.5 flex justify-between"><label className="text-[11px] font-semibold text-ink-body" htmlFor="passphrase"><T>Passphrase</T></label><Link className="text-[11px] font-semibold text-secondary hover:underline" href={ROUTES.forgotPassword}><T>Forgot passphrase?</T></Link></div><div className="relative"><span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-ink-disabled">key</span><input autoComplete="current-password" className="h-11 w-full rounded-lg border border-line-strong bg-white pl-10 pr-10 text-body-md text-ink outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/15" id="passphrase" name="password" placeholder="Enter your passphrase" required type={showPassphrase ? "text" : "password"} /><button aria-label={t("Toggle password visibility")} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted hover:bg-surface-container-low" onClick={() => setShowPassphrase((value) => !value)} type="button"><span className="material-symbols-outlined text-[18px]">{showPassphrase ? "visibility_off" : "visibility"}</span></button></div></div>
            <button className="hover-lift flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-container text-[12px] font-semibold text-white shadow-sm hover:bg-primary disabled:opacity-70" type="submit" disabled={authState !== "idle"}>{authState === "idle" && <><T>Sign in securely</T><span className="material-symbols-outlined text-[17px]">arrow_forward</span></>}{authState === "authenticating" && <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /><T>Authenticating…</T></>}{authState === "accepted" && <><span className="material-symbols-outlined text-[17px]">check_circle</span><T>Access granted</T></>}</button>
          </form>
          <div className="my-6 flex items-center gap-3"><div className="h-px flex-1 bg-line" /><span className="text-[10px] uppercase tracking-[0.12em] text-ink-disabled"><T>or continue with</T></span><div className="h-px flex-1 bg-line" /></div>
          <button className="flex h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface-container-low text-[12px] font-semibold text-ink-disabled" disabled type="button" title="Requires an institutional identity provider to be configured in Supabase"><span className="material-symbols-outlined text-[18px]">badge</span><T>Institutional SSO / CAC — not configured</T></button>
          <div className="mt-7 border-t border-line pt-5 text-center text-[11px] text-ink-muted"><T>Need authorized access?</T>{" "}<Link className="font-semibold text-secondary hover:underline" href={ROUTES.register}><T>Request an account</T></Link></div>
          <p className="mt-5 flex items-center justify-center gap-1.5 font-data text-[9px] uppercase tracking-[0.1em] text-ink-disabled"><span className="material-symbols-outlined text-[13px]">lock</span><T>Restricted system · Authorized personnel only</T></p>
        </div>
      </section>
    </div>
  );
}
