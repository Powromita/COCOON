/**
 * React Hook Form bindings for the common inputs. The wizard owns one form
 * (DraftRequirements) for all steps, so moving between steps never loses
 * input; each step renders these bound to its own field paths. Errors come
 * from the zod draftSchema resolver (validation/schemas.ts).
 */
import React from "react";
import { Controller, type Control, type FieldPath } from "react-hook-form";

import type { DraftRequirements } from "../../database/schema/types";
import type { Option } from "../../validation/options";
import { NumberField } from "../common/NumberField";
import { SelectField } from "../common/SelectField";
import { TextField } from "../common/TextField";

export type DraftControl = Control<DraftRequirements>;
export type DraftPath = FieldPath<DraftRequirements>;

interface BaseProps {
  control: DraftControl;
  name: DraftPath;
  label: string;
  required?: boolean;
  helperText?: string;
}

export function FormNumber({
  control,
  name,
  label,
  required,
  helperText,
  unit,
  integer,
  allowNegative,
  nullable,
  placeholder,
}: BaseProps & { unit?: string; integer?: boolean; allowNegative?: boolean; nullable?: boolean; placeholder?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <NumberField
          label={label}
          unit={unit}
          required={required}
          helperText={helperText}
          placeholder={placeholder}
          allowDecimal={!integer}
          allowNegative={allowNegative}
          value={typeof field.value === "number" ? field.value : undefined}
          // Optional contract fields are nullable; clearing them stores null so the key is explicit.
          onChangeValue={(v) => field.onChange(v === undefined ? (nullable ? null : undefined) : v)}
          onBlur={field.onBlur}
          error={fieldState.error?.message}
          showValid
        />
      )}
    />
  );
}

export function FormText({
  control,
  name,
  label,
  required,
  helperText,
  placeholder,
  autoCapitalize,
}: BaseProps & { placeholder?: string; autoCapitalize?: "none" | "sentences" }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          label={label}
          required={required}
          helperText={helperText}
          placeholder={placeholder}
          autoCapitalize={autoCapitalize}
          value={typeof field.value === "string" ? field.value : ""}
          onChangeText={(t) => field.onChange(t === "" ? undefined : t)}
          error={fieldState.error?.message}
          showValid
        />
      )}
    />
  );
}

export function FormChoice({ control, name, label, required, options }: BaseProps & { options: Option[] }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <SelectField
          label={label}
          required={required}
          options={options}
          value={typeof field.value === "string" ? field.value : undefined}
          onChange={field.onChange}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}

export function FormMultiChoice({ control, name, label, required, options }: BaseProps & { options: Option[] }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const selected: string[] = Array.isArray(field.value) ? (field.value as string[]) : [];
        return (
          <SelectField
            label={label}
            required={required}
            options={options}
            multiple
            value={undefined}
            onChange={() => undefined}
            selectedValues={selected}
            onToggle={(v) => field.onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v])}
            error={fieldState.error?.message}
          />
        );
      }}
    />
  );
}
