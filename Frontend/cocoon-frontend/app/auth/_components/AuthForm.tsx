"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@/utils/supabase/client";

type Role = "individual" | "organization";
type Tab = "login" | "signup";

const COPY: Record<
  Role,
  {
    badge: string;
    icon: string;
    redirectTo: string;
    otherLabel: string;
    otherHref: string;
  }
> = {
  individual: {
    badge: "INDIVIDUAL ACCESS",
    icon: "⌂",
    redirectTo: "/individual/configure",
    otherLabel: "Organization",
    otherHref: "/auth/organization",
  },
  organization: {
    badge: "ORGANIZATION ACCESS",
    icon: "▣",
    redirectTo: "/organization",
    otherLabel: "Individual",
    otherHref: "/auth/individual",
  },
};

function wrongModeMessage(copy: (typeof COPY)[Role]): ReactNode {
  return (
    <>
      This account is registered for {copy.otherLabel}. Please use the{" "}
      <Link href={copy.otherHref} className="font-semibold underline">
        {copy.otherLabel} login
      </Link>{" "}
      instead.
    </>
  );
}

const inputCls =
  "w-full rounded-lg bg-surface-container-low px-space-md py-space-sm font-body-md text-on-surface outline-none transition-colors placeholder:text-outline focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/20";

export default function AuthForm({ role }: { role: Role }) {
  const copy = COPY[role];
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ReactNode>(
    searchParams.get("error") === "wrong_mode" ? wrongModeMessage(copy) : null,
  );
  const [notice, setNotice] = useState<string | null>(null);

  const switchTab = (next: Tab) => {
    setTab(next);
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (tab === "signup" && password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      if (tab === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { role } },
        });

        if (signUpError) {
          setError(signUpError.message);
          return;
        }

        // Email confirmation disabled → session is live, go straight in.
        if (data.session) {
          router.replace(copy.redirectTo);
          router.refresh();
          return;
        }

        setNotice(
          "Account created. Check your email to confirm your address, then log in.",
        );
        setTab("login");
        setPassword("");
        setConfirm("");
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      if (profileError) {
        await supabase.auth.signOut();
        setError("Couldn't load your profile. Please try again.");
        return;
      }

      if (profile?.role !== role) {
        await supabase.auth.signOut();
        setError(wrongModeMessage(copy));
        return;
      }

      router.replace(copy.redirectTo);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-on-surface antialiased">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12 sm:px-6">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-surface-container-high px-3 py-1 font-mono-metric-sm font-medium text-primary">
            <span className="text-sm">◔</span>
            <span>{copy.badge}</span>
          </div>
          <h1 className="mt-2 font-display-xl tracking-tight text-primary">COCOON</h1>
          <p className="font-body-sm font-medium uppercase tracking-[0.18em] text-on-surface-variant">
            Predict. Compare. Validate.
          </p>
        </div>

        <div className="rounded-xl bg-surface-container-lowest p-card-padding shadow-soft">
          <div className="mb-space-lg grid grid-cols-2 gap-space-2xs rounded-lg bg-surface-container-low p-space-2xs">
            {(["login", "signup"] as Tab[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => switchTab(key)}
                className={
                  tab === key
                    ? "rounded bg-surface-container-lowest px-space-md py-space-xs font-mono-metric-sm font-medium text-primary shadow-sm"
                    : "rounded px-space-md py-space-xs font-mono-metric-sm text-on-surface-variant transition-colors hover:text-on-surface"
                }
              >
                {key === "login" ? "Log In" : "Sign Up"}
              </button>
            ))}
          </div>

          <div className="mb-space-md flex items-center gap-space-xs text-primary">
            <span className="text-base">{copy.icon}</span>
            <h2 className="font-headline-md text-on-surface">
              {tab === "login" ? "Log in to continue" : "Create your account"}
            </h2>
          </div>

          {error ? (
            <div
              role="alert"
              className="mb-space-md rounded-lg bg-error-container px-space-md py-space-sm font-body-sm text-on-error-container"
            >
              {error}
            </div>
          ) : null}

          {notice ? (
            <div className="mb-space-md rounded-lg bg-surface-container px-space-md py-space-sm font-body-sm text-on-surface-variant">
              {notice}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-space-md">
            <div className="space-y-space-2xs">
              <label
                htmlFor="auth-email"
                className="block font-label-caps uppercase tracking-wider text-on-surface-variant"
              >
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-space-2xs">
              <label
                htmlFor="auth-password"
                className="block font-label-caps uppercase tracking-wider text-on-surface-variant"
              >
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={tab === "login" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                placeholder="••••••••"
              />
            </div>

            {tab === "signup" ? (
              <div className="space-y-space-2xs">
                <label
                  htmlFor="auth-confirm"
                  className="block font-label-caps uppercase tracking-wider text-on-surface-variant"
                >
                  Confirm password
                </label>
                <input
                  id="auth-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={inputCls}
                  placeholder="••••••••"
                />
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-body-md font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? tab === "login"
                  ? "Logging in…"
                  : "Creating account…"
                : tab === "login"
                  ? "Log In"
                  : "Sign Up"}
            </button>
          </form>

          <p className="mt-space-md font-body-sm text-on-surface-variant">
            {tab === "login" ? (
              <>
                New here?{" "}
                <button
                  type="button"
                  onClick={() => switchTab("signup")}
                  className="font-medium text-primary hover:underline"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already registered?{" "}
                <button
                  type="button"
                  onClick={() => switchTab("login")}
                  className="font-medium text-primary hover:underline"
                >
                  Log in
                </button>
              </>
            )}
          </p>
        </div>

        <Link
          href="/"
          className="mt-6 text-center font-body-sm text-on-surface-variant transition-colors hover:text-on-surface"
        >
          ← Not sure which mode you need?
        </Link>
      </div>
    </main>
  );
}
