"use client";

import type { ReactNode } from "react";
import { T, useT } from "@/lib/i18n";

const INPUT =
  "w-full h-9 rounded-lg bg-surface-container-low px-3 font-data text-[12px] text-on-surface outline-none transition-shadow focus:bg-surface-container-lowest focus:ring-2";

type FieldProps = {
  label: string;
  /** requirements.schema.json key this input writes, shown for traceability. */
  contractKey?: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
};

export function Field({ label, contractKey, hint, error, htmlFor, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="font-label-mono-xs text-label-mono-xs uppercase tracking-wider text-on-surface-variant">
          <T>{label}</T>
        </label>
        {contractKey && <span className="font-data text-[10px] text-outline truncate">{contractKey}</span>}
      </div>
      {children}
      {error ? (
        <p role="alert" className="flex items-center gap-1 font-body-sm text-body-sm text-error">
          <span className="material-symbols-outlined text-[14px]">error</span>
          <T>{error}</T>
        </p>
      ) : (
        hint && (
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            <T>{hint}</T>
          </p>
        )
      )}
    </div>
  );
}

type NumberInputProps = {
  id: string;
  value?: string;
  defaultValue?: string | number;
  onChange?: (v: string) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number | "any";
  invalid?: boolean;
  placeholder?: string;
  disabled?: boolean;
};

export function NumberInput({ id, value, defaultValue, onChange, unit, min, max, step = "any", invalid, placeholder, disabled }: NumberInputProps) {
  return (
    <div className="relative flex items-center">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        defaultValue={value !== undefined ? undefined : defaultValue}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange?.(e.target.value)}
        className={`${INPUT} ${unit ? "pr-14" : ""} ${invalid ? "ring-2 ring-error/40 focus:ring-error/50" : "focus:ring-primary-container/30"} disabled:opacity-50`}
      />
      {unit && <span className="absolute right-3 font-data text-[11px] text-outline pointer-events-none">{unit}</span>}
    </div>
  );
}

export function DateInput({ id, value, onChange, invalid, min }: { id: string; value: string; onChange: (v: string) => void; invalid?: boolean; min?: string }) {
  return (
    <input
      id={id}
      type="date"
      value={value}
      min={min}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={`${INPUT} ${invalid ? "ring-2 ring-error/40" : "focus:ring-primary-container/30"}`}
    />
  );
}

type Option<V> = { value: V; label: string; hint?: string };

export function Select<V extends string>({ id, value, onChange, options }: { id: string; value: V; onChange: (v: V) => void; options: Option<V>[] }) {
  return (
    <div className="relative flex items-center">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as V)}
        className={`${INPUT} appearance-none pr-9 font-body-sm text-body-sm focus:ring-primary-container/30`}
      >
        {options.map((o) => (
          <OptionLabel key={o.value} value={o.value} label={o.label} />
        ))}
      </select>
      <span className="material-symbols-outlined absolute right-2.5 text-[18px] text-on-surface-variant pointer-events-none">expand_more</span>
    </div>
  );
}

// <option> children must be plain strings, so translate via the hook rather than <T>.
function OptionLabel({ value, label }: { value: string; label: string }) {
  const t = useT();
  return <option value={value}>{t(label)}</option>;
}

/** Multi-select rendered as toggle chips (checkbox semantics). */
export function ChipGroup<V extends string>({
  name,
  options,
  selected,
  onChange,
  exclusive,
  invalid,
}: {
  name: string;
  options: { id: V; label: string }[];
  selected: V[];
  onChange: (next: V[]) => void;
  /** Option that clears the others when chosen (e.g. "none"). */
  exclusive?: V;
  invalid?: boolean;
}) {
  function toggle(id: V) {
    if (selected.includes(id)) return onChange(selected.filter((s) => s !== id));
    if (exclusive && id === exclusive) return onChange([id]);
    return onChange([...selected.filter((s) => s !== exclusive), id]);
  }
  return (
    <div role="group" aria-label={name} className={`flex flex-wrap gap-2 ${invalid ? "rounded-xl ring-2 ring-error/30 p-1 -m-1" : ""}`}>
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <label
            key={o.id}
            className={`inline-flex items-center gap-1.5 h-8 pl-2 pr-3 rounded-full border cursor-pointer select-none transition-colors font-body-sm text-body-sm ${
              on
                ? "bg-primary-container text-on-primary border-transparent"
                : "bg-surface-container-lowest text-on-surface border-outline-variant hover:bg-surface-container-low"
            }`}
          >
            <input type="checkbox" className="sr-only peer" checked={on} onChange={() => toggle(o.id)} />
            <span className="material-symbols-outlined text-[16px] peer-focus-visible:outline peer-focus-visible:outline-2">
              {on ? "check_circle" : "add_circle"}
            </span>
            <T>{o.label}</T>
          </label>
        );
      })}
    </div>
  );
}

/** Single-choice cards for small option sets with a one-line description. */
export function RadioCards<V extends string | number | null>({
  name,
  options,
  value,
  onChange,
  columns = 3,
}: {
  name: string;
  options: Option<V>[];
  value: V;
  onChange: (v: V) => void;
  columns?: 2 | 3;
}) {
  return (
    <div role="radiogroup" aria-label={name} className={`grid grid-cols-1 gap-2 ${columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <label
            key={String(o.value)}
            className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
              on ? "border-primary-container bg-primary-fixed/40" : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low"
            }`}
          >
            <input type="radio" name={name} checked={on} onChange={() => onChange(o.value)} className="mt-0.5 w-4 h-4 accent-primary-container" />
            <span className="flex flex-col">
              <span className="font-headline-sm text-[13px] text-on-surface">
                <T>{o.label}</T>
              </span>
              {o.hint && (
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  <T>{o.hint}</T>
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function SectionCard({ title, contractKey, icon, children }: { title: string; contractKey?: string; icon: string; children: ReactNode }) {
  return (
    <section className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-5">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-headline-sm text-headline-sm text-on-surface">
          <span className="material-symbols-outlined text-[18px] text-secondary">{icon}</span>
          <T>{title}</T>
        </h2>
        {contractKey && (
          <span className="font-data text-[10px] px-2 py-0.5 rounded-full bg-surface-container-low text-on-surface-variant">{contractKey}</span>
        )}
      </header>
      {children}
    </section>
  );
}
