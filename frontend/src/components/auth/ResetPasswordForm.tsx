"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirmPassword") ?? "")) {
      setError("Passphrases do not match."); setPending(false); return;
    }
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await supabase.auth.signOut();
      router.replace(`${ROUTES.login}?reset=complete`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update the passphrase.");
      setPending(false);
    }
  }

  return <div className="mx-auto w-full max-w-[420px] rounded-2xl border border-line bg-white p-7 shadow-card">
    <h1 className="text-[24px] font-semibold text-ink">Choose a new passphrase</h1>
    <p className="mt-2 text-body-sm text-ink-muted">Use at least 12 characters with upper/lowercase, a number, and a symbol.</p>
    {error && <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-body-sm text-red-800" role="alert">{error}</p>}
    <form className="mt-6 space-y-4" onSubmit={submit}>{["password", "confirmPassword"].map((name, index) => <label key={name} className="block text-[11px] font-semibold text-ink-body">{index ? "Confirm passphrase" : "New passphrase"}<input className="mt-1.5 h-11 w-full rounded-lg border border-line-strong px-3 text-body-md outline-none focus:border-primary-container" name={name} type="password" autoComplete="new-password" minLength={12} required /></label>)}<button className="h-11 w-full rounded-lg bg-primary-container text-body-sm font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">{pending ? "Updating…" : "Update passphrase"}</button></form>
  </div>;
}
