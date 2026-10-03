"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const { error: resetError } = await createClient().auth.resetPasswordForEmail(
        String(form.get("email") ?? "").trim(),
        { redirectTo: `${window.location.origin}${ROUTES.resetPassword}` },
      );
      if (resetError) throw resetError;
      setMessage("If the account exists, a password reset link has been sent.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to request a reset link.");
    } finally {
      setPending(false);
    }
  }

  return <div className="mx-auto w-full max-w-[420px] rounded-2xl border border-line bg-white p-7 shadow-card">
    <h1 className="text-[24px] font-semibold text-ink">Reset your passphrase</h1>
    <p className="mt-2 text-body-sm text-ink-muted">We’ll send a secure recovery link to your registered email.</p>
    {error && <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-body-sm text-red-800" role="alert">{error}</p>}
    {message && <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-body-sm text-emerald-800" role="status">{message}</p>}
    <form className="mt-6 space-y-4" onSubmit={submit}><label className="block text-[11px] font-semibold text-ink-body">Institutional email<input className="mt-1.5 h-11 w-full rounded-lg border border-line-strong px-3 text-body-md outline-none focus:border-primary-container" name="email" type="email" autoComplete="email" required /></label><button className="h-11 w-full rounded-lg bg-primary-container text-body-sm font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">{pending ? "Sending…" : "Send recovery link"}</button></form>
    <Link className="mt-6 block text-center text-body-sm font-semibold text-secondary hover:underline" href={ROUTES.login}>Return to sign in</Link>
  </div>;
}
