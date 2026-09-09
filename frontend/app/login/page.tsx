"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DEMO_CREDENTIALS } from "@/constants/auth";
import { useAuth } from "@/hooks/useAuth";
import { routes } from "@/navigation/routes";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState(DEMO_CREDENTIALS.email);
  const [password, setPassword] = useState(DEMO_CREDENTIALS.password);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await login({ email, password });

    if (!result.ok) {
      setError(result.message);
      setIsSubmitting(false);
      return;
    }

    router.push(routes.main.home);
  };

  return (
    <main className="min-h-screen bg-[#050914] px-4 py-6 text-slate-100 sm:px-8 lg:px-12">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-[32px] border border-cyan-400/20 bg-slate-950/80 shadow-[0_25px_100px_rgba(0,0,0,0.5)] lg:grid-cols-[0.92fr_1.08fr]">
          <div className="relative hidden overflow-hidden border-r border-white/10 bg-gradient-to-br from-cyan-500/20 via-blue-600/10 to-indigo-600/20 p-10 lg:block">
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl" />
            <div className="absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="relative flex h-full flex-col justify-between">
              <Link href={routes.main.home} className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-indigo-600 text-xl font-black shadow-lg shadow-cyan-500/25">C</span>
                <span>
                  <span className="block text-xl font-black tracking-tight text-white">COCOON</span>
                  <span className="block text-[10px] uppercase tracking-[0.22em] text-cyan-200">PGML Suite</span>
                </span>
              </Link>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-200">Thermal resilience workspace</p>
                <h1 className="mt-4 text-4xl font-black leading-tight text-white">Design for comfort in extreme climates.</h1>
                <p className="mt-5 max-w-sm text-sm leading-6 text-slate-300">
                  Move from site conditions to a clear thermal concept with guided inputs, mock simulation results, and practical recommendations.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {["Configure", "Simulate", "Improve"].map((label, index) => (
                  <div key={label} className="rounded-xl border border-white/10 bg-slate-950/35 px-2 py-3">
                    <span className="block font-mono text-xs text-cyan-300">0{index + 1}</span>
                    <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-slate-300">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-10">
            <div className="mb-8 lg:hidden">
              <Link href={routes.main.home} className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-600 font-black">C</span>
                <span className="text-xl font-black text-white">COCOON</span>
              </Link>
            </div>
            <div className="mb-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300">COCOON // ACCESS</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-white">Welcome back</h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
                Sign in to continue your shelter design workflow. This prototype uses local mock authentication.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <label className="block text-sm font-medium text-slate-300">
                <span className="mb-2 block">Email address</span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10" autoComplete="email" required />
              </label>
              <label className="block text-sm font-medium text-slate-300">
                <span className="mb-2 block">Password</span>
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10" autoComplete="current-password" required />
              </label>

              {error ? <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}

              <button type="submit" disabled={isSubmitting} className="flex w-full items-center justify-center rounded-xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? "Opening workspace..." : "Sign in to workspace"}
              </button>
            </form>

            <div className="mt-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-cyan-100">Prototype access</p>
                <span className="rounded-full bg-cyan-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-200">Demo</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">Pre-filled credentials are ready. Use them to explore the complete design flow.</p>
              <div className="mt-3 grid gap-1 font-mono text-xs text-slate-300">
                <span>{DEMO_CREDENTIALS.email}</span>
                <span>{DEMO_CREDENTIALS.password}</span>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href={routes.main.home} className="flex-1 rounded-xl border border-slate-700 px-4 py-3 text-center text-sm font-semibold text-slate-300 transition hover:bg-slate-900">Back to home</Link>
              <Link href={routes.guide} className="flex-1 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-center text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/20">Read user guide</Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
