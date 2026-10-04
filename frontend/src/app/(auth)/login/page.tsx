"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ROUTES } from "@/lib/routes";
import { T } from "@/lib/i18n";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("user@cocoon.org");
  const [password, setPassword] = useState("password123");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Instant mock login
    setTimeout(() => {
      router.push(ROUTES.dashboard);
    }, 400);
  }

  function handleQuickLogin() {
    setLoading(true);
    setTimeout(() => {
      router.push(ROUTES.dashboard);
    }, 200);
  }

  return (
    <div className="w-full max-w-[400px] mx-auto bg-surface-container-lowest rounded-2xl shadow-card border border-line p-7 sm:p-8">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-navy tracking-tight">
          <T>Sign In</T>
        </h1>
        <p className="text-xs text-on-surface-variant mt-1.5">
          <T>Enter your details to access the COCOON platform</T>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-on-surface mb-1.5" htmlFor="email">
            <T>Email Address</T>
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@organization.com"
            className="w-full h-10 px-3.5 rounded-xl border border-line bg-surface-container-lowest text-sm text-on-surface outline-none transition-all focus:border-navy focus:ring-2 focus:ring-navy/10"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-on-surface" htmlFor="password">
              <T>Password</T>
            </label>
            <Link
              href={ROUTES.forgotPassword}
              className="text-xs text-navy hover:underline font-medium"
            >
              <T>Forgot?</T>
            </Link>
          </div>
          <div className="relative flex items-center">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-10 px-3.5 pr-10 rounded-xl border border-line bg-surface-container-lowest text-sm text-on-surface outline-none transition-all focus:border-navy focus:ring-2 focus:ring-navy/10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 text-on-surface-variant hover:text-on-surface p-1 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">
                {showPassword ? "visibility_off" : "visibility"}
              </span>
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-10 rounded-xl bg-navy hover:bg-navy-hover text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-all hover-lift disabled:opacity-75"
        >
          {loading ? (
            <span className="inline-block animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <>
              <span><T>Sign In</T></span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </>
          )}
        </button>
      </form>

      <div className="relative flex items-center justify-center my-5">
        <div className="w-full h-px bg-line" />
        <span className="absolute bg-surface-container-lowest px-3 text-[11px] text-on-surface-variant uppercase tracking-wider">
          <T>or</T>
        </span>
      </div>

      <button
        type="button"
        onClick={handleQuickLogin}
        disabled={loading}
        className="w-full h-10 rounded-xl border border-line bg-surface-container-low hover:bg-surface-container text-navy text-xs font-semibold flex items-center justify-center gap-2 transition-all hover-lift"
      >
        <span className="material-symbols-outlined text-[18px] text-teal">bolt</span>
        <span><T>1-Click Demo Login</T></span>
      </button>

      <div className="mt-6 text-center">
        <p className="text-xs text-on-surface-variant">
          <T>Don't have an account?</T>{" "}
          <Link href={ROUTES.register} className="text-navy font-semibold hover:underline ml-1">
            <T>Sign Up</T>
          </Link>
        </p>
      </div>
    </div>
  );
}
