"use client";

import { useLang, useT, type Lang } from "@/app/_lib/i18n";

const OPTIONS: { value: Lang; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "hi", label: "हि" },
];

/**
 * Compact English / Hindi toggle. Sits in the header (left of the mode pill)
 * and on the mode-picker page. Choice is persisted in localStorage by the
 * LanguageProvider, so it sticks across navigation and reloads.
 */
export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  const t = useT();

  return (
    <div
      role="group"
      aria-label={t("lang.aria")}
      className={`flex items-center overflow-hidden rounded-full bg-surface-container-low p-[2px] tracking-normal normal-case shadow-sm ${className}`}
    >
      {OPTIONS.map((opt) => {
        const selected = lang === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLang(opt.value)}
            aria-pressed={selected}
            className={`rounded-full px-space-sm py-[3px] font-mono-metric-sm font-medium transition-colors ${
              selected
                ? "bg-primary text-on-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
