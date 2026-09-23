"use client";

import { useResults } from "@/app/_components/ResultsProvider";
import { deriveStatus } from "@/app/_lib/simulation";
import { useT } from "@/app/_lib/i18n";

const KEY_TO_I18N: Record<string, string> = {
  preparing: "ires.status.preparing",
  weather: "ires.status.weather",
  physics: "ires.status.physics",
  physics_done: "ires.status.physicsDone",
  ansys_queued: "ires.status.ansysQueued",
  ansys_running: "ires.status.ansysRunning",
  ansys_done: "ires.status.ansysDone",
  comparison: "ires.status.comparison",
  failed: "ires.status.failed",
};

const TONE: Record<string, { dot: string; text: string; ring: string; glyph: string }> = {
  info: { dot: "bg-outline", text: "text-on-surface-variant", ring: "border-outline-variant", glyph: "•" },
  progress: { dot: "bg-secondary-container animate-pulse", text: "text-secondary", ring: "border-secondary-container", glyph: "▸" },
  ok: { dot: "bg-tertiary-container", text: "text-tertiary-container", ring: "border-tertiary-container/50", glyph: "✓" },
  error: { dot: "bg-error", text: "text-error", ring: "border-error/50", glyph: "✕" },
};

/** Compact simulation-status chip near the header (spec §4). Colour is
 * reinforced with a glyph and the text label so it never relies on colour. */
export default function SimulationStatus() {
  const t = useT();
  const { phase, status, isReal, results } = useResults();
  const hasSeries = (results.features?.temperature?.series?.indoor_C?.length ?? 0) > 0;
  const s = deriveStatus(phase, status, isReal, hasSeries);
  const tone = TONE[s.tone];
  // status key can carry a "· detail" suffix from deriveStatus; prefer the i18n
  // base label and keep any suffix the deriver added
  const base = t(KEY_TO_I18N[s.key] ?? "ires.status.preparing");
  const suffix = s.label.includes(" · ") ? s.label.slice(s.label.indexOf(" · ")) : "";

  return (
    <div
      className={`inline-flex items-center gap-space-xs rounded-full border bg-surface-container-lowest px-space-sm py-space-2xs shadow-sm ${tone.ring}`}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden className={`h-2 w-2 rounded-full ${tone.dot}`} />
      <span aria-hidden className={`font-mono-metric-sm ${tone.text}`}>{tone.glyph}</span>
      <span className={`font-mono-metric-sm font-medium ${tone.text}`}>
        {base}
        {suffix}
      </span>
    </div>
  );
}
