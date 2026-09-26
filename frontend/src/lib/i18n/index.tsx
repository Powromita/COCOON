"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { hi } from "./hi";

export type Language = "en" | "hi";

export const LANGUAGES: { code: Language; label: string; short: string }[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "hi", label: "हिन्दी", short: "हि" },
];

const STORAGE_KEY = "cocoon.lang";
const DICTIONARIES: Record<Language, Record<string, string>> = { en: {}, hi };

/** Dictionary keys are the English UI strings, whitespace-normalised. */
export function normalizeKey(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

export function translate(lang: Language, text: string) {
  if (lang === "en") return text;
  const lead = text.match(/^\s*/)![0];
  const trail = text.match(/\s*$/)![0];
  const core = normalizeKey(text);
  const hit = DICTIONARIES[lang][core];
  return hit === undefined ? text : lead + hit + trail;
}

// --- language store (localStorage-backed, shared across tabs) --------------------------------
const listeners = new Set<() => void>();

function readStored(): Language {
  try {
    return localStorage.getItem(STORAGE_KEY) === "hi" ? "hi" : "en";
  } catch {
    return "en";
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function writeStored(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // storage unavailable (private mode) — language still switches for this page view
  }
  memoryLang = lang;
  listeners.forEach((l) => l());
}

let memoryLang: Language | null = null;
const getSnapshot = () => memoryLang ?? readStored();
const getServerSnapshot = (): Language => "en";

type Ctx = { lang: Language; setLang: (l: Language) => void; t: (text: string) => string };
const LanguageContext = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (s) => s });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Language) => writeStored(l), []);
  const t = useCallback((text: string) => translate(lang, text), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

/** Translate function for attributes and computed strings in client components. */
export function useT() {
  return useContext(LanguageContext).t;
}

/** Inline translatable text; usable from server and client components alike. */
export function T({ children }: { children: string }) {
  const t = useT();
  return <>{t(children)}</>;
}
