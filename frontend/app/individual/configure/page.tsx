import Link from "next/link";

import DesignFlowNavigation from "@/components/navigation/DesignFlowNavigation";
import DesignWizard from "@/components/design/DesignWizard";

export default function IndividualConfigurePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#0f172a_0%,_#111827_18%,_#0b1220_48%,_#030712_100%)] text-slate-100 antialiased">
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-700 text-xl font-bold text-white shadow-lg shadow-cyan-500/25">
              C
            </div>
            <div>
              <div className="flex items-center gap-3">
                <span className="text-xl font-black tracking-tight text-white">COCOON</span>
                <span className="hidden h-5 w-px bg-slate-600 sm:block" />
                <span className="hidden text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200 sm:block">PGML SUITE</span>
              </div>
              <span className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Predict. Compare. Validate.</span>
            </div>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <DesignFlowNavigation />
          </div>

          <div className="flex items-center gap-3">
            <Link href="/guide" className="hidden rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-400/20 sm:block">
              User guide
            </Link>
            <div className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-100">
              Individual mode
            </div>
            <Link href="/" className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10">
              Switch mode
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="mb-8 overflow-hidden rounded-[28px] border border-cyan-500/20 bg-gradient-to-r from-cyan-500/15 via-sky-500/10 to-indigo-500/10 p-6 shadow-[0_20px_60px_rgba(14,116,144,0.18)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-200">Rapid design setup</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-4xl">Build your shelter concept</h1>
              <p className="mt-3 max-w-[42rem] text-sm text-slate-300">
                Configure the shelter location, climate profile, geometry, materials and comfort settings before running a temperature simulation.
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-slate-950/40 px-4 py-2 text-sm text-slate-200">
              <span className="font-semibold text-cyan-200">Stage 7</span> • Design input flow
            </div>
          </div>
        </div>

        <DesignWizard />
      </main>
    </main>
  );
}
