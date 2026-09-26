"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_DRAFT, stepErrors, type WizardDraft } from "@/lib/configurator/requirements";

const STORAGE_KEY = "cocoon.configurator.draft.v4";

type Ctx = {
  draft: WizardDraft;
  update: <K extends keyof WizardDraft>(section: K, patch: Partial<WizardDraft[K]> | WizardDraft[K]) => void;
  reset: () => void;
  errors: ReturnType<typeof stepErrors>;
  hydrated: boolean;
};

const WizardContext = createContext<Ctx | null>(null);

function load(): WizardDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WizardDraft>;
    // Merge over defaults so older drafts missing new fields still work.
    return {
      site: { ...DEFAULT_DRAFT.site, ...parsed.site },
      mission: { ...DEFAULT_DRAFT.mission, ...parsed.mission },
      constraints: { ...DEFAULT_DRAFT.constraints, ...parsed.constraints },
      economic_assumption_set_id: parsed.economic_assumption_set_id ?? DEFAULT_DRAFT.economic_assumption_set_id,
      run: { ...DEFAULT_DRAFT.run, ...parsed.run },
    };
  } catch {
    return null;
  }
}

/** Holds the requirements draft across the wizard's step routes; autosaved per browser. */
export function WizardProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<WizardDraft>(DEFAULT_DRAFT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = load();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of a browser-stored draft
    if (saved) setDraft(saved);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // storage unavailable — draft lives for this session only
    }
  }, [draft, hydrated]);

  const update = useCallback<Ctx["update"]>((section, patch) => {
    setDraft((d) => {
      const current = d[section];
      const next = typeof current === "object" && current !== null ? { ...current, ...(patch as object) } : patch;
      return { ...d, [section]: next };
    });
  }, []);

  const reset = useCallback(() => setDraft(DEFAULT_DRAFT), []);
  const errors = useMemo(() => stepErrors(draft), [draft]);

  const value = useMemo(() => ({ draft, update, reset, errors, hydrated }), [draft, update, reset, errors, hydrated]);
  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}

export function useWizard() {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used inside the shelter-configurator layout");
  return ctx;
}
