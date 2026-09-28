/**
 * The requirements wizard's step bodies. Each renders only fields of the M0
 * RequirementsContract (see validation/steps.ts for the mapping), bound to
 * the wizard's single React Hook Form.
 */
import React, { useEffect, useState } from "react";
import { Controller, useWatch } from "react-hook-form";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAssumptionSets, useCapabilities, useMaterialCatalog } from "../../../hooks/useCocoon";
import { useTheme } from "../../../theme";
import { minTouchTarget } from "../../../theme/spacing";
import { formatNumber, humanize } from "../../../utils/format";
import {
  HEATER_FUELS,
  MISSION_TYPES,
  presetOffset,
  ROOM_TYPES,
  TIMEZONE_PRESETS,
  WEATHER_SOURCES,
} from "../../../validation/options";
import { AppCard } from "../../common/AppCard";
import { ErrorView } from "../../common/ErrorView";
import { InfoBanner } from "../../common/InfoBanner";
import { KeyValueRow } from "../../common/KeyValueRow";
import { SectionHeader } from "../../common/SectionHeader";
import { SelectField } from "../../common/SelectField";
import { Tag } from "../../common/Tag";
import { TextField } from "../../common/TextField";
import { FormChoice, FormMultiChoice, FormNumber, FormText, type DraftControl } from "../../forms/FormFields";

interface StepProps {
  control: DraftControl;
}

function Note({ children }: { children: React.ReactNode }) {
  const { colors, spacing, typography } = useTheme();
  return <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>{children}</Text>;
}

// ---------------------------------------------------------------------------
// 1. Location — site.latitude_deg / longitude_deg / elevation_m / timezone
// ---------------------------------------------------------------------------
export function LocationStep({ control }: StepProps) {
  const caps = useCapabilities();
  const sites = caps.data?.weatherSites ?? [];
  return (
    <>
      <FormNumber control={control} name="site.latitude_deg" label="Latitude" unit="°" required allowNegative helperText="Decimal degrees, −90 to 90 (north positive)." />
      <FormNumber control={control} name="site.longitude_deg" label="Longitude" unit="°" required allowNegative helperText="Decimal degrees, −180 to 180 (east positive)." />
      <FormNumber control={control} name="site.elevation_m" label="Elevation" unit="m" required allowNegative helperText="Height above sea level." />
      <Controller
        control={control}
        name="site.timezone"
        render={({ field, fieldState }) => (
          <>
            <TextField
              label="Timezone (IANA)"
              required
              autoCapitalize="none"
              value={typeof field.value === "string" ? field.value : ""}
              onChangeText={(t) => field.onChange(t === "" ? undefined : t)}
              placeholder="e.g. Asia/Kolkata"
              error={fieldState.error?.message}
            />
            <View style={styles.chipRow}>
              {TIMEZONE_PRESETS.map((p) => (
                <Chip key={p.timezone} label={p.timezone} selected={field.value === p.timezone} onPress={() => field.onChange(p.timezone)} />
              ))}
            </View>
          </>
        )}
      />
      <InfoBanner
        title="Weather data"
        message={
          sites.length > 0
            ? `The backend evaluates designs with weather from its nearest cached archive (${sites.map(humanize).join(", ")}) and reports which site and distance it used.`
            : "Weather is selected by the backend from its cached archives. The list of archives is not available right now."
        }
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// 2. Weather — site.analysis_start / analysis_end / weather_source
// ---------------------------------------------------------------------------
const ISO_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):\d{2}(?:\.\d+)?([+-]\d{2}:\d{2}|Z)$/;
const LOCAL_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

function splitIso(value: unknown): { local: string; offset?: string } {
  if (typeof value !== "string") return { local: "" };
  const m = ISO_RE.exec(value);
  if (!m) return { local: value };
  return { local: `${m[1]} ${m[2]}`, offset: m[3] === "Z" ? "+00:00" : m[3] };
}

function DateTimeField({
  control,
  name,
  label,
  offset,
}: StepProps & { name: "site.analysis_start" | "site.analysis_end"; label: string; offset: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <DateTimeInput label={label} value={field.value} offset={offset} onChange={field.onChange} error={fieldState.error?.message} />
      )}
    />
  );
}

function DateTimeInput({
  label,
  value,
  offset,
  onChange,
  error,
}: {
  label: string;
  value: unknown;
  offset: string;
  onChange: (v: string | undefined) => void;
  error?: string;
}) {
  const [text, setText] = useState(splitIso(value).local);
  // Re-compose the stored timestamp when the UTC offset changes.
  useEffect(() => {
    if (LOCAL_RE.test(text)) onChange(`${text.replace(" ", "T")}:00${offset}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);
  return (
    <TextField
      label={`${label} (YYYY-MM-DD HH:MM)`}
      required
      value={text}
      onChangeText={(t) => {
        setText(t);
        if (t === "") onChange(undefined);
        // A well-formed local time is stored as a full, timezone-aware ISO timestamp (M0 requires it);
        // anything else is stored as typed so validation can flag it.
        else onChange(LOCAL_RE.test(t) ? `${t.replace(" ", "T")}:00${offset}` : t);
      }}
      placeholder="2026-01-01 00:00"
      error={error}
    />
  );
}

export function WeatherStep({ control }: StepProps) {
  const timezone = useWatch({ control, name: "site.timezone" });
  const start = useWatch({ control, name: "site.analysis_start" });
  const [offset, setOffset] = useState<string>(splitIso(start).offset ?? presetOffset(timezone) ?? "+00:00");
  const { colors, spacing, typography } = useTheme();

  return (
    <>
      <FormChoice control={control} name="site.weather_source" label="Weather source" required options={WEATHER_SOURCES} />
      <Note>The analysis window is the period each candidate design is simulated over.</Note>
      <TextField
        label="UTC offset for these times"
        value={offset}
        onChangeText={(t) => /^[+-]?\d{0,2}:?\d{0,2}$/.test(t) && setOffset(t)}
        helperText={
          presetOffset(timezone)
            ? `${timezone} is ${presetOffset(timezone)}.`
            : "Enter the offset of the site's timezone, e.g. +05:30."
        }
        error={/^[+-]\d{2}:\d{2}$/.test(offset) ? undefined : "Use the form +05:30 or -04:00."}
      />
      <DateTimeField control={control} name="site.analysis_start" label="Analysis start" offset={offset} />
      <DateTimeField control={control} name="site.analysis_end" label="Analysis end" offset={offset} />
      <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>
        If the backend has no weather for this window it will say so when designs are generated — the app never fills in weather values.
      </Text>
    </>
  );
}

// ---------------------------------------------------------------------------
// 3. Mission — mission.type (mode fixed to new_shelter)
// ---------------------------------------------------------------------------
export function MissionStep({ control }: StepProps) {
  return (
    <>
      <AppCard>
        <KeyValueRow label="Project mode" value="New shelter" last />
      </AppCard>
      <FormChoice control={control} name="mission.type" label="Shelter purpose" required options={MISSION_TYPES} />
      <Note>Existing-shelter assessment and engineering mode are not available in the mobile app yet.</Note>
    </>
  );
}

// ---------------------------------------------------------------------------
// 4. Occupancy — mission.occupants / occupancy_schedule_id
// ---------------------------------------------------------------------------
export function OccupancyStep({ control }: StepProps) {
  return (
    <>
      <FormNumber control={control} name="mission.occupants" label="Number of occupants" unit="persons" integer required />
      <FormText
        control={control}
        name="mission.occupancy_schedule_id"
        label="Occupancy schedule id (optional)"
        autoCapitalize="none"
        placeholder="e.g. continuous_30"
        helperText="Only if the backend has a named schedule for this mission. Leave empty for the default."
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// 5. Rooms — mission.required_rooms
// ---------------------------------------------------------------------------
export function RoomsStep({ control }: StepProps) {
  const { colors, spacing, typography } = useTheme();
  const occupants = useWatch({ control, name: "mission.occupants" });
  return (
    <Controller
      control={control}
      name="mission.required_rooms"
      render={({ field, fieldState }) => {
        const rooms: string[] = Array.isArray(field.value) ? field.value : [];
        const set = (next: string[]) => field.onChange(next);
        const move = (i: number, d: -1 | 1) => {
          const next = [...rooms];
          const j = i + d;
          if (j < 0 || j >= next.length) return;
          [next[i], next[j]] = [next[j], next[i]];
          set(next);
        };
        const remaining = ROOM_TYPES.filter((r) => !rooms.includes(r.value));
        return (
          <>
            <AppCard>
              <KeyValueRow label="Rooms" value={String(rooms.length)} />
              <KeyValueRow label="Occupants" value={typeof occupants === "number" ? String(occupants) : "Not set"} last />
            </AppCard>
            <Note>
              Room sizes and positions are generated by the layout engine (M2) from these room types and the occupant count — they are
              not entered here.
            </Note>
            {rooms.length === 0 ? <Note>No rooms yet. Add at least one below.</Note> : null}
            {rooms.map((type, i) => {
              const def = ROOM_TYPES.find((r) => r.value === type);
              return (
                <AppCard key={type}>
                  <View style={styles.roomRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>
                        {i + 1}. {def?.label ?? type}
                      </Text>
                      {type === "airlock" && def?.description ? (
                        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>{def.description}</Text>
                      ) : null}
                    </View>
                    <IconButton label="↑" a11y={`Move ${def?.label ?? type} up`} disabled={i === 0} onPress={() => move(i, -1)} />
                    <IconButton label="↓" a11y={`Move ${def?.label ?? type} down`} disabled={i === rooms.length - 1} onPress={() => move(i, 1)} />
                    <IconButton label="✕" a11y={`Remove ${def?.label ?? type}`} onPress={() => set(rooms.filter((r) => r !== type))} />
                  </View>
                </AppCard>
              );
            })}
            {fieldState.error ? (
              <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>{fieldState.error.message}</Text>
            ) : null}
            {remaining.length > 0 ? (
              <>
                <SectionHeader title="Add room" caption="Each type can be listed once." />
                <View style={styles.chipRow}>
                  {remaining.map((r) => (
                    <Chip key={r.value} label={`+ ${r.label}`} onPress={() => set([...rooms, r.value])} />
                  ))}
                </View>
              </>
            ) : null}
          </>
        );
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// 6. Footprint — constraints.maximum_footprint_m2 / maximum_floors / preferred_orientation_deg
// ---------------------------------------------------------------------------
export function FootprintStep({ control }: StepProps) {
  return (
    <>
      <FormNumber control={control} name="constraints.maximum_footprint_m2" label="Maximum footprint" unit="m²" nullable helperText="Upper bound on ground area. Leave empty for no limit." />
      <Controller
        control={control}
        name="constraints.maximum_floors"
        render={({ field, fieldState }) => (
          <SelectField
            label="Maximum floors"
            options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
            value={typeof field.value === "number" ? String(field.value) : undefined}
            onChange={(v) => field.onChange(field.value === Number(v) ? null : Number(v))}
            error={fieldState.error?.message}
          />
        )}
      />
      <FormNumber control={control} name="constraints.preferred_orientation_deg" label="Preferred orientation" unit="°" nullable helperText="Azimuth of the main façade, 0–360 (180 = south). Leave empty to let the generator decide." />
    </>
  );
}

// ---------------------------------------------------------------------------
// 7. Materials — constraints.available_material_ids (+ generation_options.materials_snapshot_id)
// ---------------------------------------------------------------------------
export function MaterialsStep({ control }: StepProps) {
  const { colors, spacing, typography } = useTheme();
  const catalog = useMaterialCatalog();
  const chosenSnapshot = useWatch({ control, name: "generation_options.materials_snapshot_id" });

  if (catalog.isError) return <ErrorView error={catalog.error} onRetry={() => void catalog.refetch()} />;
  if (!catalog.data) return <Note>Loading material data…</Note>;

  const { defaultSnapshotId, snapshots } = catalog.data.data;
  const activeId = chosenSnapshot ?? defaultSnapshotId;
  const snapshot = snapshots.find((s) => s.snapshotId === activeId) ?? snapshots[0];

  return (
    <>
      <Controller
        control={control}
        name="generation_options.materials_snapshot_id"
        render={({ field }) => (
          <SelectField
            label="Material data set"
            options={snapshots.map((s) => ({ value: s.snapshotId, label: s.snapshotId === defaultSnapshotId ? `${s.snapshotId} (default)` : s.snapshotId }))}
            value={activeId}
            onChange={(v) => field.onChange(v === defaultSnapshotId ? undefined : v)}
          />
        )}
      />
      {snapshot ? <KeyValueRow label="Checksum (SHA-256)" value={snapshot.checksum.slice(0, 16) + "…"} mono last /> : null}
      <Controller
        control={control}
        name="constraints.available_material_ids"
        render={({ field, fieldState }) => {
          const selected: string[] = Array.isArray(field.value) ? field.value : [];
          const toggle = (id: string) =>
            field.onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
          return (
            <>
              <SectionHeader
                title="Permitted materials"
                caption={selected.length === 0 ? "None selected — the generator may use any material in the set." : `${selected.length} selected`}
              />
              {snapshot?.materials === null ? (
                <Note>This backend lists material ids only; thermal properties are not exposed by GET /api/v1/materials.</Note>
              ) : null}
              {(snapshot?.materialIds ?? []).map((id) => {
                const rec = snapshot?.materials?.find((m) => m.id === id);
                const on = selected.includes(id);
                return (
                  <AppCard key={id} onPress={() => toggle(id)} emphasis={on ? "accent" : "none"} accessibilityLabel={`${rec?.display_name ?? id}, ${on ? "selected" : "not selected"}`}>
                    <View style={styles.roomRow}>
                      <Text style={[typography.bodyStrong, { color: colors.textPrimary, flex: 1 }]}>{rec?.display_name ?? id}</Text>
                      <Tag label={on ? "Selected" : "Not selected"} tone={on ? "ready" : "neutral"} />
                    </View>
                    {rec ? (
                      <View style={{ marginTop: spacing.xs }}>
                        <KeyValueRow label="Category" value={humanize(rec.category)} />
                        <KeyValueRow label="Thermal conductivity" value={`${formatNumber(rec.properties.thermal_conductivity_w_mk, 3)} W/(m·K)`} />
                        <KeyValueRow label="Density" value={`${formatNumber(rec.properties.density_kg_m3, 0)} kg/m³`} />
                        <KeyValueRow label="Specific heat" value={`${formatNumber(rec.properties.specific_heat_j_kgk, 0)} J/(kg·K)`} />
                        <KeyValueRow label="Source" value={rec.source_reference} last />
                      </View>
                    ) : (
                      <Text style={[typography.caption, { color: colors.textSecondary }]}>{id}</Text>
                    )}
                  </AppCard>
                );
              })}
              {fieldState.error ? <Text style={[typography.caption, { color: colors.danger }]}>{fieldState.error.message}</Text> : null}
              <Note>Layer thicknesses are chosen by the layout generator for each candidate and shown in the results.</Note>
            </>
          );
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// 8. Comfort — mission.target_temperature_c / maximum_unmet_hours
// ---------------------------------------------------------------------------
export function ComfortStep({ control }: StepProps) {
  return (
    <>
      <FormNumber control={control} name="mission.target_temperature_c" label="Target indoor temperature" unit="°C" allowNegative helperText="Heating setpoint occupied rooms should be kept at or above." />
      <FormNumber control={control} name="mission.maximum_unmet_hours" label="Maximum unmet hours" unit="h" helperText="How many hours below the target are acceptable over the analysis window." />
      <Note>The contract defines comfort as a single target temperature plus an allowance of unmet hours; there is no separate maximum.</Note>
    </>
  );
}

// ---------------------------------------------------------------------------
// 9. Budget — constraints.* costs/logistics, economic_assumption_set_id
// ---------------------------------------------------------------------------
export function BudgetStep({ control }: StepProps) {
  const sets = useAssumptionSets();
  return (
    <>
      <FormNumber control={control} name="constraints.maximum_capex_inr" label="Maximum CAPEX" unit="₹" nullable helperText="Capital cost limit. Leave empty for no limit." />
      <FormNumber control={control} name="constraints.maximum_mass_kg" label="Maximum shipped mass" unit="kg" nullable />
      <FormNumber control={control} name="constraints.max_assembly_time_hours" label="Maximum assembly time" unit="h" nullable />
      <FormMultiChoice control={control} name="constraints.heater_fuels" label="Allowed heater fuels" options={HEATER_FUELS} />
      <Controller
        control={control}
        name="economic_assumption_set_id"
        render={({ field, fieldState }) => {
          const list = sets.data?.data.assumption_sets ?? [];
          const options = list.map((s) => ({ value: s.id, label: `${s.name} (${s.id} v${s.version})` }));
          if (typeof field.value === "string" && !options.some((o) => o.value === field.value)) {
            options.push({ value: field.value, label: `${field.value} (current value)` });
          }
          return (
            <>
              <SelectField
                label="Economic assumption set"
                required
                options={options}
                value={typeof field.value === "string" ? field.value : undefined}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
              {sets.isError ? <ErrorView compact error={sets.error} onRetry={() => void sets.refetch()} /> : null}
              <Note>Fuel prices, discount rate and lifetime come from this versioned set on the backend (M7). The app does not price anything itself.</Note>
            </>
          );
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Small local controls
// ---------------------------------------------------------------------------
function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const { colors, radii, spacing, typography } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? colors.accent : colors.border,
          backgroundColor: selected ? colors.surfaceAlt : colors.surface,
          borderRadius: radii.sm,
          paddingHorizontal: spacing.md,
        },
      ]}
    >
      <Text style={[typography.caption, { color: colors.textPrimary, fontWeight: "600" }]}>{label}</Text>
    </Pressable>
  );
}

function IconButton({ label, a11y, onPress, disabled }: { label: string; a11y: string; onPress: () => void; disabled?: boolean }) {
  const { colors, typography } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={[styles.icon, { opacity: disabled ? 0.3 : 1 }]}
    >
      <Text style={[typography.subtitle, { color: colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: { borderWidth: 1.5, minHeight: 40, justifyContent: "center" },
  roomRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  icon: { width: minTouchTarget, height: minTouchTarget, alignItems: "center", justifyContent: "center" },
});
