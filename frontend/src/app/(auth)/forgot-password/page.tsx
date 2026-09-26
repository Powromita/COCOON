"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { ROUTES } from "@/lib/routes";
import { T, useT } from "@/lib/i18n";

const TOKEN_LENGTH = 6;
const RESEND_WINDOW_S = 222;

function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const t = useT();
  const [secondsLeft, setSecondsLeft] = useState(RESEND_WINDOW_S);
  const [token, setToken] = useState<string[]>(["7", "4", "0", "", "", ""]);
  const cells = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const complete = token.every((d) => d !== "");

  function setDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    setToken((t) => t.map((d, i) => (i === index ? digit : d)));
    if (digit && index < TOKEN_LENGTH - 1) cells.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !token[index] && index > 0) cells.current[index - 1]?.focus();
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, TOKEN_LENGTH);
    if (!digits) return;
    e.preventDefault();
    setToken(Array.from({ length: TOKEN_LENGTH }, (_, i) => digits[i] ?? ""));
    cells.current[Math.min(digits.length, TOKEN_LENGTH - 1)]?.focus();
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (complete) router.push(ROUTES.resetPassword);
  }

  return (
    <>
      <div className="flex flex-col w-full items-center">
        <div className="w-full max-w-[420px] bg-surface-container-lowest rounded-xl shadow-card p-margin flex flex-col">
          {/* Card Header */}
          <div className="flex flex-col mb-space-lg">
            <div className="flex items-center justify-between">
              <h1 className="font-headline-md text-headline-md text-on-surface"><T>Account Recovery</T></h1>
              <span className="font-label-mono-xs text-label-mono-xs uppercase px-space-xs py-0.5 rounded-full bg-surface-container text-primary font-medium">
                <T>GATE-RECOV</T>
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              <T>Dispatch cryptographic verification key to registered terminal.</T>
            </p>
          </div>
          {/* Post-Submit State Banner: Success Dispatched */}
          <div className="bg-surface-container-low p-space-md rounded-xl mb-space-md flex items-start gap-space-sm">
            <span className="material-symbols-outlined text-secondary text-base shrink-0 select-none" style={{ fontVariationSettings: "'FILL' 1" }}>
              verified
            </span>
            <div className="flex flex-col">
              <span className="font-headline-sm text-body-md text-on-surface font-semibold"><T>Verification Dispatched</T></span>
              <span className="font-body-sm text-label-mono-sm text-on-surface-variant mt-0.5 leading-snug">
                <T>A single-use 6-digit cryptographic token has been routed to</T>{" "}
                <span className="font-label-mono-sm text-on-surface font-medium"><T>v.rathore@aet.defence.gov.in</T></span>
                .
              </span>
            </div>
          </div>
          {/* Active Window Countdown Note */}
          <div className="bg-surface-container p-space-sm rounded-xl flex items-center justify-between text-on-surface mb-space-lg">
            <div className="flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-tertiary-container text-sm select-none">timer</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant"><T>Verification key active. Resend in:</T></span>
            </div>
            <span className="font-label-mono-md text-label-mono-md text-tertiary-container font-semibold font-data" id="countdown-timer">
              {formatCountdown(secondsLeft)}
            </span>
          </div>
          {/* Form Section */}
          <form className="flex flex-col gap-space-lg" onSubmit={handleSubmit}>
            {/* Institutional Identifier */}
            <div className="flex flex-col gap-space-xs">
              <div className="flex items-center justify-between">
                <label className="font-label-mono-xs text-label-mono-xs tracking-wider text-on-surface-variant font-medium uppercase">
                  <T>Registered Institutional Email</T>
                </label>
              </div>
              <div className="h-9 w-full bg-surface-container-low rounded px-space-md flex items-center justify-between">
                <span className="font-label-mono-sm text-label-mono-sm text-on-surface"><T>v.rathore@aet.defence.gov.in</T></span>
                <span className="material-symbols-outlined text-on-surface-variant text-base">domain</span>
              </div>
            </div>
            {/* Verification Token: 6 Cells */}
            <div className="flex flex-col gap-space-xs">
              <div className="flex items-center justify-between">
                <label className="font-label-mono-xs text-label-mono-xs tracking-wider text-on-surface-variant font-medium uppercase">
                  <T>6-Digit Cryptographic Token</T>
                </label>
              </div>
              <div className="flex items-center justify-between gap-space-xs">
                {token.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      cells.current[i] = el;
                    }}
                    aria-label={`${t("Token digit")} ${i + 1}`}
                    className="w-9 h-9 bg-surface-container-low rounded text-center font-data text-label-mono-lg text-primary font-semibold focus:outline-none focus:bg-surface-variant"
                    inputMode="numeric"
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    maxLength={1}
                    placeholder="•"
                    type="text"
                    value={digit}
                    onChange={(e) => setDigit(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={handlePaste}
                  />
                ))}
              </div>
            </div>
            {/* Actions */}
            <div className="flex flex-col gap-space-sm pt-space-xs">
              <button className="w-full h-9 bg-primary-container hover:bg-primary text-on-primary font-body-sm text-body-sm font-medium tracking-wide uppercase rounded-[10px] flex items-center justify-center gap-space-xs transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed hover-lift" type="submit" disabled={!complete}>
                <span><T>Verify Token &amp; Proceed to Reset</T></span>
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </button>
              <button className="w-full h-8 bg-surface-container hover:bg-surface-container-high text-on-surface font-label-mono-xs text-label-mono-xs tracking-wider uppercase rounded-[10px] flex items-center justify-center gap-space-xs transition-colors hover-lift" type="button" onClick={() => setSecondsLeft(RESEND_WINDOW_S)}>
                <span className="material-symbols-outlined text-sm text-on-surface-variant">sync</span>
                <span><T>Dispatch via Alternate Tactical Channel</T></span>
              </button>
            </div>
          </form>
          {/* Return Link */}
          <Link className="font-body-sm text-body-sm text-center text-primary hover:underline font-medium block mt-space-xl" href={ROUTES.login}>
            <T>← Return to Secure Sign In</T>
          </Link>
        </div>
      </div>
    </>
  );
}
