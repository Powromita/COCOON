"use client";

import { LANGUAGES, useLanguage } from "@/lib/i18n";

type Props = { className?: string };

/** Tiny EN ⇄ हि switch. */
export default function LanguageToggle({ className = "" }: Props) {
  const { lang, setLang } = useLanguage();
  const next = LANGUAGES.find((l) => l.code !== lang)!;
  const current = LANGUAGES.find((l) => l.code === lang)!;
  return (
    <button
      type="button"
      onClick={() => setLang(next.code)}
      title={`${next.label}`}
      aria-label={lang === "en" ? "Switch language to Hindi (हिन्दी)" : "भाषा अंग्रेज़ी (English) में बदलें"}
      className={`inline-flex items-center gap-1 h-7 pl-1.5 pr-2 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors ${className}`}
    >
      <span className="material-symbols-outlined text-[16px]" aria-hidden>
        translate
      </span>
      <span className="text-[11px] font-semibold leading-none">{current.short}</span>
    </button>
  );
}
