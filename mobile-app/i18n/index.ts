/**
 * English/Hindi UI text. Mirrors the web frontend's approach
 * (frontend/src/lib/i18n): dictionary keys are the English source strings,
 * anything without a translation falls back to English, and the preference
 * is stored under the same key, "cocoon.lang" (here in SQLite app_meta).
 *
 * Only interface text is translated. Technical IDs, API fields, units and
 * numerical engineering values are never passed through t().
 */
import { useCallback } from "react";

import { useAppStore } from "../store/app.store";
import { hi } from "./hi";

export type Language = "en" | "hi";

export const LANGUAGE_KEY = "cocoon.lang";

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
];

const DICTIONARIES: Record<Language, Record<string, string>> = { en: {}, hi };

export function translate(lang: Language, text: string): string {
  if (lang === "en") return text;
  return DICTIONARIES[lang][text] ?? text;
}

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "hi";
}

/** Returns t(englishText) for the current language. */
export function useT(): (text: string) => string {
  const lang = useAppStore((s) => s.language);
  return useCallback((text: string) => translate(lang, text), [lang]);
}
