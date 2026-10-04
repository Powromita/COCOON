"use client";

import { useEffect, useRef, useState } from "react";

const MESSAGES = [
  "Preparing your shelter for simulation...",
  "Understanding your shelter configuration...",
  "Analysing walls, roof and insulation...",
  "Checking how heat moves through the shelter...",
  "Simulating the selected weather conditions...",
  "Evaluating indoor temperature stability...",
  "Testing thermal comfort across rooms...",
  "Running high-fidelity ANSYS calculations...",
  "Analysing potential heat-loss areas...",
  "Comparing thermal performance...",
  "Reviewing simulation results...",
  "Almost there — preparing your thermal insights...",
  "Building your final recommendation...",
];

const INSIGHTS = [
  "Evaluating performance under extreme outdoor temperatures.",
  "Checking whether your selected materials maintain indoor comfort.",
  "Measuring heat transfer through the shelter envelope.",
  "Comparing room temperatures across the design.",
  "Analysing insulation effectiveness.",
  "Checking areas where unnecessary heat loss may occur.",
];

// Approximate progress range per backend phase (the backend does not report a percentage).
const RANGES: Record<string, { lo: number; hi: number; tau: number }> = {
  starting: { lo: 0, hi: 5, tau: 6 },
  weather: { lo: 5, hi: 12, tau: 8 },
  rc_validation: { lo: 12, hi: 45, tau: 25 },
  ansys_validation: { lo: 45, hi: 90, tau: 90 },
  reporting: { lo: 90, hi: 98, tau: 15 },
};
const QUEUED = { lo: 0, hi: 3, tau: 10 };

/** ansys_validation messages look like "Running ANSYS validation 2/3 for ..." */
function ansysFraction(message?: string | null) {
  const match = message?.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  const [done, total] = [Number(match[1]) - 1, Number(match[2])];
  return total > 0 ? Math.min(Math.max(done / total, 0), 1) : null;
}

/** Cycles through `items`, fading the old one out before the next fades in. */
function useRotating(items: string[], intervalMs: number, offset = 0) {
  const [index, setIndex] = useState(offset);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    let swap: ReturnType<typeof setTimeout>;
    const id = setInterval(() => {
      setVisible(false);
      swap = setTimeout(() => {
        setIndex((i) => (i + 1) % items.length);
        setVisible(true);
      }, 450);
    }, intervalMs);
    return () => { clearInterval(id); clearTimeout(swap); };
  }, [items.length, intervalMs]);
  return { text: items[index], visible };
}

export default function SimulationLoader({
  phase,
  phaseMessage,
  done,
  optId,
}: {
  phase?: string | null;
  phaseMessage?: string | null;
  /** True once the backend has confirmed completion. */
  done: boolean;
  optId?: string | null;
}) {
  const [progress, setProgress] = useState(0);
  const phaseKey = phase ?? "queued";
  const phaseStarted = useRef(Date.now());
  const lastPhase = useRef(phaseKey);
  if (lastPhase.current !== phaseKey) {
    lastPhase.current = phaseKey;
    phaseStarted.current = Date.now();
  }
  const fraction = phaseKey === "ansys_validation" ? ansysFraction(phaseMessage) : null;

  useEffect(() => {
    const id = setInterval(() => {
      setProgress((current) => {
        if (done) return current + (100 - current) * 0.18 > 99.6 ? 100 : current + (100 - current) * 0.18;
        const range = RANGES[phaseKey] ?? QUEUED;
        const elapsed = (Date.now() - phaseStarted.current) / 1000;
        let lo = range.lo;
        if (fraction !== null) lo += (range.hi - range.lo) * fraction * 0.9;
        const target = Math.min(lo + (range.hi - lo) * (1 - Math.exp(-elapsed / range.tau)), 99);
        return target > current ? current + (target - current) * 0.06 : current;
      });
    }, 100);
    return () => clearInterval(id);
  }, [phaseKey, fraction, done]);

  const message = useRotating(MESSAGES, 4500);
  const insight = useRotating(INSIGHTS, 7000, 2);
  const nearEnd = !done && (phaseKey === "reporting" || progress >= 92);
  const shown = done ? Math.round(progress) : Math.min(Math.floor(progress), 99);
  const complete = done && progress >= 99.5;

  return (
    <div className="flex min-h-[calc(100vh-10rem)] w-full flex-col items-center justify-center px-gutter-lg py-12 text-center">
      <style>{`
        @keyframes cocoon-flow { from { background-position: 0 0; } to { background-position: 56px 0; } }
        @keyframes cocoon-pop { 0% { transform: scale(.6); opacity: 0; } 70% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } }
      `}</style>

      <div className="flex w-full max-w-[560px] flex-col items-center">
        {complete ? (
          <div className="flex flex-col items-center gap-3" style={{ animation: "cocoon-pop .5s ease-out both" }}>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-equilibrium-tint text-equilibrium">
              <span className="material-symbols-outlined text-[38px]">check_circle</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-navy">Simulation complete</h1>
            <p className="text-sm text-on-surface-variant">Your shelter&apos;s thermal performance is ready.</p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-navy">Validating your shelter design</h1>
            <div className="mt-10 text-6xl font-semibold tabular-nums tracking-tight text-navy">{shown}<span className="text-3xl text-on-surface-variant">%</span></div>
            <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-surface-container-high" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={shown}>
              <div
                className="h-full rounded-full transition-[width] duration-300 ease-out"
                style={{
                  width: `${Math.max(progress, 1.5)}%`,
                  backgroundColor: "#1e3a8a",
                  backgroundImage: "linear-gradient(115deg, rgba(255,255,255,.28) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.28) 50%, rgba(255,255,255,.28) 75%, transparent 75%)",
                  backgroundSize: "56px 56px",
                  animation: "cocoon-flow 1.1s linear infinite",
                }}
              />
            </div>

            <div className="mt-8 flex min-h-[4.5rem] flex-col items-center gap-2">
              <p
                key={nearEnd ? "end" : "msg"}
                className="text-lg font-medium text-on-surface transition-opacity duration-500"
                style={{ opacity: nearEnd || message.visible ? 1 : 0 }}
              >
                {nearEnd ? "Almost there..." : message.text}
              </p>
              {nearEnd ? (
                <p className="text-sm text-on-surface-variant">Reviewing your thermal simulation and preparing the best design insights.</p>
              ) : (
                <p className="text-sm text-on-surface-variant transition-opacity duration-500" style={{ opacity: insight.visible ? 1 : 0 }}>{insight.text}</p>
              )}
            </div>
            <p className="mt-6 max-w-[420px] text-xs leading-5 text-on-surface-variant/70">
              High-fidelity thermal simulation can take a few minutes. You can keep this page open while we work.
            </p>
          </>
        )}
      </div>

      {optId && <p className="mt-16 font-data text-[10px] text-on-surface-variant/50">Simulation ID: {optId}</p>}
    </div>
  );
}
