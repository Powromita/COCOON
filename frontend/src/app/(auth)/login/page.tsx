"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ROUTES } from "@/lib/routes";
import { T, useT } from "@/lib/i18n";

type AuthState = "idle" | "authenticating" | "accepted";

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const [showBanner, setShowBanner] = useState(true);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [authState, setAuthState] = useState<AuthState>("idle");
  const [ssoPending, setSsoPending] = useState(false);
  const [keepActive, setKeepActive] = useState(true);

  // No backend yet: mimic the Stitch token handshake, then enter the workstation.
  function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthState("authenticating");
    setTimeout(() => {
      setAuthState("accepted");
      setTimeout(() => router.push(ROUTES.dashboard), 400);
    }, 1200);
  }

  function handleSSO() {
    setSsoPending(true);
    setTimeout(() => router.push(ROUTES.dashboard), 800);
  }

  return (
    <>
      <div className="flex flex-col w-full items-center justify-center">
        <div className="w-full max-w-[420px] bg-surface-container-lowest rounded-xl shadow-card p-6 sm:p-7 relative transition-all duration-200">
          {showBanner && (
          <div className="bg-error-container text-on-error-container p-3 rounded-xl flex items-center justify-between gap-space-sm mb-5 shadow-xs transition-opacity duration-200" id="session-banner" style={{ border: "1px solid rgb(254, 202, 202)", backgroundColor: "rgb(254, 242, 242)", color: "rgb(153, 27, 27)" }}>
            <div className="flex items-center gap-space-sm min-w-0">
              <span className="material-symbols-outlined text-[18px] text-error shrink-0">warning</span>
              <p className="font-body-sm text-body-sm text-error leading-snug" style={{ color: "rgb(153, 27, 27)" }}>
                <T>Session expired due to inactivity (Token</T>{" "}
                <span className="font-label-mono-xs text-label-mono-xs font-semibold font-data">SEC-TK948</span>
                <T>). Please re-authenticate.</T>
              </p>
            </div>
            <button aria-label={t("Dismiss alert")} className="text-error hover:opacity-75 p-0.5 transition-opacity shrink-0 flex items-center justify-center rounded-full" onClick={() => setShowBanner(false)} type="button">
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
          )}
          <div className="mb-6">
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
              <T>Secure Authentication</T>
            </h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              <T>Enter institutional credentials to access DBO/Ladakh solver clusters.</T>
            </p>
          </div>
          <form className="space-y-4" onSubmit={handleAuth}>
            <div>
              <label className="block font-label-mono-xs text-label-mono-xs text-on-surface-variant font-medium uppercase tracking-wider mb-1.5" htmlFor="defence-id">
                <T>INSTITUTIONAL EMAIL // DEFENCE ID</T>
              </label>
              <div className="relative flex items-center">
                <input className="w-full h-[36px] bg-surface-container-lowest rounded-lg px-3 font-label-mono-md text-label-mono-md text-on-surface placeholder:text-outline-variant outline-none transition-all shadow-xs focus:bg-surface-container-lowest focus:shadow-[0_0_0_2px_#1e3a8a]" id="defence-id" placeholder="officer.id@drdo.nic.in / .gov / .mil" required type="email" style={{ border: "1px solid rgb(203, 213, 225)" }} />
              </div>
            </div>
            <div>
              <label className="block font-label-mono-xs text-label-mono-xs text-on-surface-variant font-medium uppercase tracking-wider mb-1.5" htmlFor="passphrase">
                <T>ENCRYPTED PASSPHRASE</T>
              </label>
              <div className="relative flex items-center">
                <input className="w-full h-[36px] bg-surface-container-lowest rounded-lg px-3 pr-9 font-label-mono-md text-label-mono-md text-on-surface placeholder:text-outline-variant outline-none transition-all shadow-xs focus:bg-surface-container-lowest focus:shadow-[0_0_0_2px_#1e3a8a]" id="passphrase" placeholder="••••••••••••••••" required type={showPassphrase ? "text" : "password"} style={{ border: "1px solid rgb(203, 213, 225)" }} />
                <button aria-label={t("Toggle password visibility")} className="absolute right-2.5 text-outline hover:text-on-surface p-1 transition-colors flex items-center justify-center rounded-full" id="toggle-visibility" onClick={() => setShowPassphrase((v) => !v)} type="button">
                  <span className="material-symbols-outlined text-[18px]" id="eye-icon">
                    {showPassphrase ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none group">
                <div className="relative flex items-center justify-center">
                  <input checked={keepActive} onChange={(e) => setKeepActive(e.target.checked)} className="peer sr-only" id="keep-active" type="checkbox" />
                  <div className={`w-4 h-4 rounded-sm shadow-xs transition-all flex items-center justify-center peer-focus-visible:ring-2 peer-focus-visible:ring-primary-container ${keepActive ? "bg-secondary shadow-none" : "bg-surface-container-lowest"}`} style={{ border: keepActive ? "1px solid transparent" : "1px solid rgb(148, 163, 184)" }}>
                    <span className={`material-symbols-outlined text-[13px] text-on-primary transition-opacity font-bold ${keepActive ? "opacity-100" : "opacity-0"}`}>
                      check
                    </span>
                  </div>
                </div>
                <span className="font-body-sm text-body-sm text-on-surface-variant group-hover:text-on-surface transition-colors" style={{ color: "rgb(100, 116, 139)" }}>
                  <T>Keep solver session active (8h field shift)</T>
                </span>
              </label>
              <Link className="font-body-sm text-body-sm text-primary hover:text-primary-container hover:underline font-medium transition-colors shrink-0" href={ROUTES.forgotPassword} style={{ color: "rgb(0, 104, 120)" }}>
                <T>Forgot passphrase?</T>
              </Link>
            </div>
            <button className="w-full h-[36px] bg-primary-container hover:bg-primary active:bg-on-primary-fixed text-on-primary font-headline-sm text-headline-sm uppercase tracking-wider rounded-[10px] flex items-center justify-center gap-space-sm shadow-sm transition-all mt-5 cursor-pointer disabled:opacity-80 disabled:cursor-wait hover-lift" id="submit-btn" type="submit" disabled={authState !== "idle"}>
              {authState === "idle" && (
                <>
                  <span className="material-symbols-outlined text-[16px]">lock</span>
                  <span className=""><T>Authenticate &amp; Enter Workstation</T></span>
                </>
              )}
              {authState === "authenticating" && (
                <>
                  <span className="inline-block animate-spin w-3.5 h-3.5 border-2 border-on-primary border-t-transparent rounded-full" />
                  <span><T>Authenticating Secure Token...</T></span>
                </>
              )}
              {authState === "accepted" && (
                <>
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  <span><T>Credentials Accepted</T></span>
                </>
              )}
            </button>
          </form>
          <div className="relative flex items-center justify-center my-5">
            <div className="w-full h-px bg-surface-container" />
            <span className="absolute bg-surface-container-lowest px-2.5 font-label-mono-xs text-label-mono-xs text-outline uppercase tracking-wider">
              <T>OR FEDERATED ACCESS</T>
            </span>
          </div>
          <button className="w-full h-[36px] bg-surface-container-lowest hover:bg-surface-container-low active:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium rounded-[10px] flex items-center justify-center gap-space-sm shadow-xs transition-all cursor-pointer disabled:opacity-75 hover-lift" onClick={handleSSO} disabled={ssoPending} type="button" style={{ border: "1px solid rgb(203, 213, 225)", color: "rgb(51, 65, 85)" }}>
            <svg aria-hidden="true" className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
            </svg>
            <span className=""><T>Continue with Institutional SSO (Google / CAC)</T></span>
          </button>
          <div className="mt-6 text-center">
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              <T>New mission personnel?</T>{" "}
              <Link className="text-primary hover:text-primary-container font-medium hover:underline transition-colors ml-1" href={ROUTES.register} style={{ color: "rgb(0, 104, 120)" }}>
                <T>Request clearance / Sign up</T>
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
