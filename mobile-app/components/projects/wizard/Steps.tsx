/**
 * The requirements wizard's step bodies. Each renders only fields of the M0
 * RequirementsContract (see validation/steps.ts for the mapping), bound to
 * the wizard's single React Hook Form.
 */
import React, { useState } from "react";
import { Controller, useWatch, type UseFormSetValue } from "react-hook-form";
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerChangeEvent } from "@react-native-community/datetimepicker";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import {
  arrangementSupport,
  floorOptions,
  materialSupport,
  roomChoices,
  roomDescription,
  roomLabel,
  sizingFor,
} from "../../../adapters/templates";
import { useAssumptionSets, useCapabilities, useMaterialCatalog, useTemplateCatalog } from "../../../hooks/useCocoon";
import { useTheme } from "../../../theme";
import { minTouchTarget } from "../../../theme/spacing";
import { formatNumber, humanize } from "../../../utils/format";
import {
  HEATER_FUELS,
  MISSION_TYPES,
  WEATHER_SOURCES,
} from "../../../validation/options";
import type { TemplateCatalog, WeatherSite } from "../../../types/backend";
import { AppCard } from "../../common/AppCard";
import { ErrorView } from "../../common/ErrorView";
import { KeyValueRow } from "../../common/KeyValueRow";
import { SectionHeader } from "../../common/SectionHeader";
import { SelectField } from "../../common/SelectField";
import { Tag } from "../../common/Tag";
import { TextField } from "../../common/TextField";
import { FormChoice, FormMultiChoice, FormNumber, type DraftControl } from "../../forms/FormFields";

interface StepProps {
  control: DraftControl;
  setValue?: UseFormSetValue<import("../../../database/schema/types").DraftRequirements>;
}

function Note({ children }: { children: React.ReactNode }) {
  const { colors, spacing, typography } = useTheme();
  return <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>{children}</Text>;
}

// ---------------------------------------------------------------------------
// 1. Location — site.latitude_deg / longitude_deg / elevation_m / timezone
// ---------------------------------------------------------------------------
export function LocationStep({ control, setValue }: StepProps) {
  const caps = useCapabilities();
  const sites = caps.data?.weatherSiteDetails ?? [];
  const [search, setSearch] = useState("");
  const selectedSite = useWatch({ control, name: "weather_archive_site" });
  const filteredSites = sites.filter((site) => site.display_name.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <>
      <Controller
        control={control}
        name="location_name"
        render={({ field, fieldState }) => (
          <>
            <TextField
              label="Location"
              required
              value={typeof field.value === "string" ? field.value : search}
              onChangeText={(text) => {
                setSearch(text);
                field.onChange(text);
                setValue?.("weather_archive_site", undefined);
              }}
              placeholder="Search a weather archive location"
              helperText="Choose a location with archived weather data. Coordinates are filled in automatically."
              error={fieldState.error?.message}
            />
            {!selectedSite && filteredSites.length > 0 ? (
              <View style={styles.chipRow}>
                {filteredSites.map((site) => (
                  <Chip
                    key={site.site_id}
                    label={site.display_name}
                    onPress={() => {
                      field.onChange(site.display_name);
                      setSearch(site.display_name);
                      setValue?.("weather_archive_site", site.site_id, { shouldValidate: true });
                      setValue?.("site.latitude_deg", site.latitude_deg, { shouldValidate: true });
                      setValue?.("site.longitude_deg", site.longitude_deg, { shouldValidate: true });
                      setValue?.("site.elevation_m", site.elevation_m, { shouldValidate: true });
                      setValue?.("site.timezone", "Asia/Kolkata", { shouldValidate: true });
                      setValue?.("site.weather_source", "NASA_POWER", { shouldValidate: true });
                    }}
                  />
                ))}
              </View>
            ) : null}
            {selectedSite && sites.find((site) => site.site_id === selectedSite) ? (
              <LocationSummary site={sites.find((site) => site.site_id === selectedSite)!} />
            ) : null}
          </>
        )}
      />
      <FormNumber control={control} name="site.elevation_m" label="Elevation" unit="m" required allowNegative helperText="Height above sea level." />
    </>
  );
}

function LocationSummary({ site }: { site: WeatherSite }) {
  const { colors, typography } = useTheme();
  return (
    <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: 12 }]}>
      Coordinates assigned from the {site.display_name} weather archive.
    </Text>
  );
}

// ---------------------------------------------------------------------------
// 2. Weather — site.analysis_start / analysis_end / weather_source
// ---------------------------------------------------------------------------
const ISO_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):\d{2}(?:\.\d+)?([+-]\d{2}:\d{2}|Z)$/;

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
  const { colors, radii, spacing, typography } = useTheme();
  const [pickerMode, setPickerMode] = useState<"date" | "time" | null>(null);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);
  const parsed = typeof value === "string" ? new Date(value) : new Date();
  const currentDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const pickedValue = splitIso(value).local;

  const savePicked = (date: Date) => {
    const [hoursPart, minutesPart] = offset.replace("−", "-").split(":");
    const offsetMinutes = Math.sign(Number(hoursPart)) * (Math.abs(Number(hoursPart)) * 60 + Number(minutesPart));
    const local = new Date(date.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 16).replace("T", " ");
    onChange(`${local.replace(" ", "T")}:00${offset}`);
  };

  const openPicker = (mode: "date" | "time") => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: currentDate,
        mode,
        display: mode === "date" ? "calendar" : "clock",
        timeZoneName: "Asia/Kolkata",
        is24Hour: true,
        onValueChange: (_event: DateTimePickerChangeEvent, date: Date) => savePicked(date),
      });
    } else {
      setPickerMode(mode);
      setPendingDate(currentDate);
    }
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[typography.label, { color: colors.textPrimary, marginBottom: spacing.xs }]}>{label} *</Text>
      <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>India Standard Time (UTC+05:30)</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${label.toLowerCase()} date`} onPress={() => openPicker("date")} style={[styles.dateButton, { flex: 1, borderColor: colors.border, borderRadius: radii.sm, padding: spacing.md }]}>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>DATE</Text>
          <Text style={[typography.bodyStrong, { color: colors.textPrimary, marginTop: 4 }]}>{pickedValue ? pickedValue.slice(0, 10) : "Choose date"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${label.toLowerCase()} time`} onPress={() => openPicker("time")} style={[styles.dateButton, { flex: 1, borderColor: colors.border, borderRadius: radii.sm, padding: spacing.md }]}>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>TIME</Text>
          <Text style={[typography.bodyStrong, { color: colors.textPrimary, marginTop: 4 }]}>{pickedValue ? pickedValue.slice(11, 16) : "Choose time"}</Text>
        </Pressable>
      </View>
      {error ? <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.xs }]}>{error}</Text> : null}
      {Platform.OS === "ios" && pickerMode && pendingDate ? (
        <Modal transparent animationType="slide" onRequestClose={() => setPickerMode(null)}>
          <View style={styles.pickerScrim}>
            <View style={[styles.pickerSheet, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md }]}>
              <View style={styles.pickerActions}>
                <Pressable accessibilityRole="button" onPress={() => setPickerMode(null)}><Text style={[typography.body, { color: colors.textSecondary }]}>Cancel</Text></Pressable>
                <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{pickerMode === "date" ? "Select date" : "Select time"}</Text>
                <Pressable accessibilityRole="button" onPress={() => { savePicked(pendingDate); setPickerMode(null); }}><Text style={[typography.bodyStrong, { color: colors.accent }]}>Done</Text></Pressable>
              </View>
              <DateTimePicker
                value={pendingDate}
                mode={pickerMode}
                display={pickerMode === "date" ? "inline" : "spinner"}
                timeZoneOffsetInMinutes={330}
                onValueChange={(_event, date) => setPendingDate(date)}
                themeVariant="light"
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

export function WeatherStep({ control }: StepProps) {
  const start = useWatch({ control, name: "site.analysis_start" });
  const [offset] = useState<string>(splitIso(start).offset ?? "+05:30");
  const { colors, spacing, typography } = useTheme();

  return (
    <>
      <FormChoice control={control} name="site.weather_source" label="Weather source" required options={WEATHER_SOURCES} />
      <Note>The analysis window is the period each candidate design is simulated over.</Note>
      <Note>Analysis dates use India Standard Time (UTC+05:30).</Note>
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
      <FormChoice control={control} name="mission.type" label="Shelter purpose" required options={MISSION_TYPES} />
    </>
  );
}

// ---------------------------------------------------------------------------
// 4. Occupancy — mission.occupants / occupancy_schedule_id
// ---------------------------------------------------------------------------
export function OccupancyStep({ control }: StepProps) {
  return <FormNumber control={control} name="mission.occupants" label="Number of occupants" unit="persons" integer required />;
}

// ---------------------------------------------------------------------------
// 5. Rooms — mission.required_rooms (+ generation_options.room_arrangement)
//    Every choice comes from the live M2 catalogue: only room types some
//    template supports are offered, a type no template can combine with the
//    current rooms is shown disabled with the reason, and "own room" /
//    "shared" is offered only where a template really provides both.
// ---------------------------------------------------------------------------
export function RoomsStep({ control }: StepProps) {
  const { colors, spacing, typography } = useTheme();
  const occupants = useWatch({ control, name: "mission.occupants" });
  const catalogQuery = useTemplateCatalog();
  const catalog = catalogQuery.data?.data;
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
        const choices = catalog ? roomChoices(catalog, rooms) : [];
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
            {catalogQuery.data?.source === "cache" ? (
              <Note>Offline: showing the room types last loaded from the COCOON service.</Note>
            ) : null}
            {rooms.length === 0 ? <Note>No rooms yet. Add at least one below.</Note> : null}
            {rooms.map((type, i) => {
              const label = roomLabel(type);
              const known = !catalog || catalog.room_types.some((r) => r.type === type);
              return (
                <AppCard key={type}>
                  <View style={styles.roomRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>
                        {i + 1}. {label}
                      </Text>
                      {type === "airlock" && roomDescription(type) ? (
                        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>{roomDescription(type)}</Text>
                      ) : null}
                      {catalog && known ? (
                        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>{sizingFor(catalog, type)}</Text>
                      ) : null}
                      {!known ? (
                        <Text style={[typography.caption, { color: colors.danger, marginTop: 2 }]}>
                          The layout generator has no {label.toLowerCase()} room type. Remove it to continue.
                        </Text>
                      ) : null}
                    </View>
                    <IconButton label="↑" a11y={`Move ${label} up`} disabled={i === 0} onPress={() => move(i, -1)} />
                    <IconButton label="↓" a11y={`Move ${label} down`} disabled={i === rooms.length - 1} onPress={() => move(i, 1)} />
                    <IconButton label="✕" a11y={`Remove ${label}`} onPress={() => set(rooms.filter((r) => r !== type))} />
                  </View>
                  {catalog && known ? <ArrangementControl control={control} type={type} catalog={catalog} /> : null}
                </AppCard>
              );
            })}
            {fieldState.error ? (
              <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>{fieldState.error.message}</Text>
            ) : null}
            {catalogQuery.isError && !catalog ? (
              <ErrorView compact error={catalogQuery.error} title="Room types could not be loaded" onRetry={() => void catalogQuery.refetch()} />
            ) : null}
            {!catalog && !catalogQuery.isError ? <Note>Loading the room types the layout generator supports…</Note> : null}
            {choices.length > 0 ? (
              <>
                <SectionHeader title="Add room" caption="Only rooms a shelter template supports. Each type can be listed once." />
                <View style={styles.chipRow}>
                  {choices.map((r) => (
                    <Chip
                      key={r.type}
                      label={`+ ${r.label}`}
                      disabled={!r.available}
                      a11yHint={r.available ? r.sizing : r.reason}
                      onPress={() => set([...rooms, r.type])}
                    />
                  ))}
                </View>
                {choices
                  .filter((r) => !r.available)
                  .map((r) => (
                    <Text key={r.type} style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
                      {r.label}: {r.reason}
                    </Text>
                  ))}
              </>
            ) : null}
          </>
        );
      }}
    />
  );
}

type ArrangementValue = "either" | "dedicated" | "shared";

/** Own room / shared / either — offered only when the catalogue has templates of both kinds for this room type. */
function ArrangementControl({ control, type, catalog }: { control: DraftControl; type: string; catalog: TemplateCatalog }) {
  const { colors, spacing, typography } = useTheme();
  const support = arrangementSupport(catalog, type);
  const label = roomLabel(type).toLowerCase();
  if (!support.canShare || !support.canDedicate) {
    // Only one arrangement exists in the catalogue: say so instead of offering a choice that cannot be honoured.
    return (
      <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
        {support.canDedicate
          ? `Always a separate ${label} room in the supported templates.`
          : `Only available inside another room (for example a multipurpose room), never as a separate ${label} room.`}
      </Text>
    );
  }
  return (
    <Controller
      control={control}
      name="generation_options.room_arrangement"
      render={({ field }) => {
        const map = (field.value as Record<string, "dedicated" | "shared"> | undefined) ?? {};
        const current: ArrangementValue = map[type] ?? "either";
        const setValue = (v: ArrangementValue) => {
          const next = { ...map };
          if (v === "either") delete next[type];
          else next[type] = v;
          field.onChange(next);
        };
        const options: { value: ArrangementValue; label: string }[] = [
          { value: "either", label: "Either" },
          { value: "dedicated", label: "Own room" },
          { value: "shared", label: "Shared" },
        ];
        return (
          <View style={{ marginTop: spacing.sm }} accessibilityRole="radiogroup" accessibilityLabel={`Arrangement for ${label}`}>
            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
              Some templates give {label} its own room; others provide it inside another room.
            </Text>
            <View style={styles.chipRow}>
              {options.map((o) => (
                <Chip key={o.value} label={o.label} selected={current === o.value} radio onPress={() => setValue(o.value)} />
              ))}
            </View>
          </View>
        );
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// 6. Footprint — constraints.maximum_footprint_m2 / maximum_floors / preferred_orientation_deg
// ---------------------------------------------------------------------------
export function FootprintStep({ control }: StepProps) {
  const catalog = useTemplateCatalog().data?.data;
  // Only floor counts some M2 template has; before the catalogue loads only "System decides" is offered.
  const floorChoices = [...(catalog ? floorOptions(catalog) : []), { value: "system", label: "System decides" }];
  return (
    <>
      <FormNumber control={control} name="constraints.maximum_footprint_m2" label="Maximum footprint" unit="m²" required helperText="Maximum ground area, up to 5,000 m²." />
      <Controller
        control={control}
        name="constraints.maximum_floors"
        render={({ field, fieldState }) => (
          <SelectField
            label="Maximum floors"
            options={floorChoices}
            value={typeof field.value === "number" ? String(field.value) : field.value === null ? "system" : undefined}
            onChange={(v) => field.onChange(v === "system" ? null : Number(v))}
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
  const templates = useTemplateCatalog().data?.data;
  if (catalog.isError) return <ErrorView error={catalog.error} onRetry={() => void catalog.refetch()} />;
  if (!catalog.data) return <Note>Loading material data…</Note>;

  const { defaultSnapshotId, snapshots } = catalog.data.data;
  const snapshot = snapshots.find((s) => s.snapshotId === defaultSnapshotId) ?? snapshots[0];

  return (
    <>
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
              <Note>
                Every design needs a structural material for its walls, roof and floor. Insulation is added alongside one, never on its
                own. The roles below come from the layout generator.
              </Note>
              {snapshot?.materials === null ? (
                <Note>This backend lists material ids only; thermal properties are not exposed by GET /api/v1/materials.</Note>
              ) : null}
              {(snapshot?.materialIds ?? []).map((id) => {
                const rec = snapshot?.materials?.find((m) => m.id === id);
                const on = selected.includes(id);
                const support = materialSupport(templates, snapshot?.snapshotId, id);
                const unusable = support !== undefined && support.role === null;
                const roleLabel =
                  support?.role === "structural"
                    ? "Structural"
                    : support?.role === "insulation"
                      ? "Insulation"
                      : unusable
                        ? "Not used by the generator"
                        : humanize(rec?.category ?? "Material");
                return (
                  <AppCard
                    key={id}
                    onPress={unusable && !on ? undefined : () => toggle(id)}
                    emphasis={on ? "accent" : "none"}
                    accessibilityLabel={`${rec?.display_name ?? id}, ${roleLabel}, ${on ? "selected" : unusable ? "cannot be selected" : "not selected"}`}
                  >
                    <View style={styles.roomRow}>
                      <Text style={[typography.bodyStrong, { color: unusable ? colors.textSecondary : colors.textPrimary, flex: 1 }]}>
                        {rec?.display_name ?? id}
                      </Text>
                      <Tag label={`${roleLabel}${on ? " · selected" : ""}`} tone={support?.role === "structural" ? "ready" : on ? "accent" : "neutral"} />
                    </View>
                    {unusable ? (
                      <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                        The layout generator has no thickness rule for this material category, so it cannot be used in a design.
                      </Text>
                    ) : null}
                    {rec ? (
                      <View style={{ marginTop: spacing.xs }}>
                        <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
                          Conductivity describes how readily heat passes through the material; density and specific heat describe how much heat it can store.
                        </Text>
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

/** Five concise screens group all supported analysis inputs by user intent. */
export function SiteWeatherStep({ control, setValue }: StepProps) {
  return <><LocationStep control={control} setValue={setValue} /><SectionHeader title="Analysis period" /><WeatherStep control={control} /></>;
}

export function ShelterDesignStep({ control }: StepProps) {
  return <><FootprintStep control={control} /><SectionHeader title="Materials and heating" /><MaterialsStep control={control} /><BudgetStep control={control} /></>;
}

export function MissionOccupancyStep({ control }: StepProps) {
  return <><MissionStep control={control} /><OccupancyStep control={control} /><SectionHeader title="Required rooms" /><RoomsStep control={control} /><SectionHeader title="Comfort target" /><ComfortStep control={control} /></>;
}

export function OptimizationStep({ control }: StepProps) {
  return <FormNumber control={control} name="generation_options.count" label="Candidate designs" unit="designs" integer helperText="The backend evaluates each generated candidate with the RC thermal model. Choose 1–200 designs." placeholder="24" />;
}

// ---------------------------------------------------------------------------
// Small local controls
// ---------------------------------------------------------------------------
function Chip({
  label,
  selected,
  onPress,
  disabled,
  radio,
  a11yHint,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
  radio?: boolean;
  a11yHint?: string;
}) {
  const { colors, radii, spacing, typography } = useTheme();
  return (
    <Pressable
      accessibilityRole={radio ? "radio" : "button"}
      accessibilityState={
        radio ? { checked: Boolean(selected), disabled: Boolean(disabled) } : { selected: Boolean(selected), disabled: Boolean(disabled) }
      }
      accessibilityHint={a11yHint}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.chip,
        {
          borderColor: selected ? colors.accent : colors.border,
          backgroundColor: selected ? colors.surfaceAlt : colors.surface,
          borderRadius: radii.sm,
          paddingHorizontal: spacing.md,
          opacity: disabled ? 0.4 : 1,
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
  chip: { borderWidth: 1.5, minHeight: minTouchTarget, justifyContent: "center" },
  dateButton: { borderWidth: 1, minHeight: 70, justifyContent: "center" },
  pickerScrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  pickerSheet: { borderWidth: 1, paddingBottom: 24 },
  pickerActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 12 },
  roomRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  icon: { width: minTouchTarget, height: minTouchTarget, alignItems: "center", justifyContent: "center" },
});
