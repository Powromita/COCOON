"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";

export default function RegisterForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirmPassword") ?? "")) {
      setError("Passphrases do not match.");
      setPending(false);
      return;
    }

    try {
      const { error: signUpError } = await createClient().auth.signUp({
        email: String(form.get("email") ?? "").trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            display_name: String(form.get("displayName") ?? "").trim(),
            organization: String(form.get("organization") ?? "").trim(),
          },
        },
      });
      if (signUpError) throw signUpError;
      setMessage("Registration received. Check your email to confirm the account before signing in.");
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create the account.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[440px] rounded-2xl border border-line bg-white p-7 shadow-card">
      <h1 className="text-[24px] font-semibold text-ink">Request an account</h1>
      <p className="mt-2 text-body-sm text-ink-muted">Email confirmation is required. Operational roles are assigned by an administrator.</p>
      {error && <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-body-sm text-red-800" role="alert">{error}</p>}
      {message && <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-body-sm text-emerald-800" role="status">{message}</p>}
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <Field label="Name and rank" name="displayName" autoComplete="name" required />
        <Field label="Institutional email" name="email" type="email" autoComplete="email" required />
        <Field label="Command post / organization" name="organization" autoComplete="organization" />
        <Field label="Passphrase" name="password" type="password" autoComplete="new-password" minLength={12} required />
        <Field label="Confirm passphrase" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required />
        <button className="h-11 w-full rounded-lg bg-primary-container text-body-sm font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">{pending ? "Submitting…" : "Submit registration"}</button>
      </form>
      <p className="mt-6 text-center text-body-sm text-ink-muted">Already registered? <Link className="font-semibold text-secondary hover:underline" href={ROUTES.login}>Sign in</Link></p>
    </div>
  );
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  return <label className="block text-[11px] font-semibold text-ink-body">{label}<input {...props} className="mt-1.5 h-11 w-full rounded-lg border border-line-strong px-3 text-body-md outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/15" /></label>;
}
