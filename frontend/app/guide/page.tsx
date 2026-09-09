import Link from "next/link";

import { routes } from "@/navigation/routes";

const guideSections = [
  {
    id: "start",
    number: "01",
    title: "Start at Home",
    description: "Use the dashboard as your launch point. Review saved work or begin a new shelter concept.",
    action: "Select Create New Design",
    color: "from-cyan-500/20 to-blue-500/10",
  },
  {
    id: "configure",
    number: "02",
    title: "Configure the shelter",
    description: "Move through Location, Climate, Geometry, and Materials in order. You can jump back to any completed step.",
    action: "Complete each card, then select Continue",
    color: "from-blue-500/20 to-indigo-500/10",
  },
  {
    id: "review",
    number: "03",
    title: "Review before simulation",
    description: "Check the design snapshot, projected comfort, and estimated load. Change an earlier step if anything looks wrong.",
    action: "Select Save & simulate",
    color: "from-violet-500/20 to-fuchsia-500/10",
  },
  {
    id: "results",
    number: "04",
    title: "Read the results",
    description: "Use the metric cards for a quick decision, then inspect the 48-hour profile and comfort band.",
    action: "Compare the chart with the recommendation panel",
    color: "from-emerald-500/20 to-teal-500/10",
  },
  {
    id: "iterate",
    number: "05",
    title: "Iterate with confidence",
    description: "Return to setup, change one group of inputs, and simulate again. This keeps comparisons understandable.",
    action: "Change one variable at a time",
    color: "from-amber-500/20 to-orange-500/10",
  },
] as const;

const inputGuidance = [
  ["Location", "Region, terrain, and altitude describe the site context."],
  ["Climate", "Climate pattern, season, and outdoor design temperature define the weather boundary."],
  ["Geometry", "Shape, dimensions, and glazing describe the shelter envelope."],
  ["Materials", "Wall, roof, occupancy, and heater settings influence thermal behavior."],
];

export default function GuidePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#0f172a_0%,_#111827_20%,_#030712_75%)] text-slate-100 antialiased">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
          <Link href={routes.main.home} className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-600 font-black shadow-lg shadow-cyan-500/20">C</span>
            <span>
              <span className="block text-lg font-black tracking-tight text-white">COCOON</span>
              <span className="block text-[9px] uppercase tracking-[0.2em] text-cyan-200">User guide</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href={routes.main.home} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10">Home</Link>
            <Link href={routes.main.individual.configure} className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-300">Start a design</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <section className="relative mb-8 overflow-hidden rounded-[28px] border border-cyan-400/25 bg-gradient-to-r from-cyan-500/15 via-blue-500/10 to-indigo-500/15 p-6 shadow-[0_20px_70px_rgba(8,145,178,0.16)] md:p-8">
          <div className="absolute right-0 top-0 h-full w-1/3 bg-[linear-gradient(rgba(34,211,238,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.07)_1px,transparent_1px)] bg-[size:24px_24px]" />
          <div className="relative">
          <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-200">
            <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_12px_#67e8f9]" />
            COCOON // HOW IT WORKS
          </div>
          <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight text-white md:text-5xl">A simple path from idea to thermal insight.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            Follow the five stages below. Each screen is designed around one decision, one clear action, and an easy way to go back.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-xs font-semibold text-slate-200">
            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-2">Prototype mode</span>
            <span className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-2">Mock weather and simulation data</span>
            <span className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-2">No backend account required</span>
          </div>
          <div className="mt-8 grid max-w-3xl grid-cols-5 gap-2">
            {guideSections.map((section, index) => (
              <div key={section.id} className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-300/40 bg-slate-950/50 font-mono text-[10px] text-cyan-200">{section.number}</span>
                {index < guideSections.length - 1 ? <span className="h-px flex-1 bg-cyan-400/25" /> : null}
              </div>
            ))}
          </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
          <aside className="h-fit rounded-[24px] border border-slate-700 bg-slate-900/80 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.2)] lg:sticky lg:top-24">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200">Workflow map</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">Use these anchors to move through the app at your own pace.</p>
            <nav className="mt-4 space-y-2">
              {guideSections.map((section) => (
                <a key={section.id} href={`#${section.id}`} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-300 transition hover:bg-cyan-400/10 hover:text-cyan-200">
                  <span className="font-mono text-xs text-cyan-300">{section.number}</span>
                  {section.title}
                </a>
              ))}
              <a href="#inputs" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-300 transition hover:bg-cyan-400/10 hover:text-cyan-200">Input reference</a>
            </nav>
          </aside>

          <div className="space-y-4">
            {guideSections.map((section) => (
              <section id={section.id} key={section.id} className={`scroll-mt-28 rounded-[24px] border border-slate-700 bg-gradient-to-br ${section.color} p-5 shadow-[0_12px_35px_rgba(0,0,0,0.16)] md:p-6`}>
                <div className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/30 bg-slate-950/50 font-mono text-sm font-bold text-cyan-200">{section.number}</span>
                  <div>
                    <h2 className="text-xl font-bold text-white">{section.title}</h2>
                    <p className="mt-2 leading-6 text-slate-300">{section.description}</p>
                    <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/45 px-4 py-3 text-sm font-semibold text-cyan-100">
                      Next action: <span className="font-normal text-slate-200">{section.action}</span>
                    </div>
                  </div>
                </div>
              </section>
            ))}

            <section id="inputs" className="scroll-mt-28 rounded-[24px] border border-slate-700 bg-slate-900/75 p-5 md:p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200">Input reference</p>
              <h2 className="mt-2 text-xl font-bold text-white">What each configuration group means</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {inputGuidance.map(([title, description]) => (
                  <div key={title} className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                    <h3 className="font-semibold text-white">{title}</h3>
                    <p className="mt-2 text-sm leading-5 text-slate-400">{description}</p>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm leading-6 text-slate-400">
                The current prototype stores the latest design in your browser. Results are mock estimates for interface testing, not engineering certification.
              </p>
            </section>
          </div>
        </div>
      </main>
    </main>
  );
}
