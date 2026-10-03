/**
 * The requirements wizard's 5 step bodies, meticulously implementing all
 * inputs collected across COCOON.
 *
 * Step 1: Location, Weather Window & Shelter Identification
 * Step 2: Mission Profile & Room Configuration
 * Step 3: Site Limits & Material/Fuel Constraints
 * Step 4: Architectural Envelope & Envelope Physics
 * Step 5: Solver & Optimization Controls
 */
import React, { useState } from "react";
import { Controller, useWatch, type UseFormSetValue } from "react-hook-form";
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerChangeEvent } from "@react-native-community/datetimepicker";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import type { DraftRequirements } from "../../../database/schema/types";
import {
  arrangementSupport,
  floorOptions,
  materialSupport,
  roomDescription,
  roomLabel,
  sizingFor,
  templatesCovering,
} from "../../../adapters/templates";
import { useCapabilities, useMaterialCatalog, useTemplateCatalog } from "../../../hooks/useCocoon";
import type { TemplateCatalog } from "../../../types/backend";
import { useTheme } from "../../../theme";
import { minTouchTarget } from "../../../theme/spacing";
import { formatNumber, humanize } from "../../../utils/format";
import {
  ECONOMIC_SCENARIOS,
  GLAZING_SPECS,
  HEATER_FUELS,
  LOCATION_PRESETS,
  MISSION_TYPES,
  STANDARD_MATERIALS,
  TIMEZONE_OPTIONS,
  WEATHER_SOURCES,
  WINDOW_ORIENTATIONS,
} from "../../../validation/options";
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
  setValue?: UseFormSetValue<DraftRequirements>;
}

function Note({ children }: { children: React.ReactNode }) {
  const { colors, spacing, typography } = useTheme();
  return <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>{children}</Text>;
}

// ---------------------------------------------------------------------------
// 📍 STEP 1: Location, Weather Window & Shelter Identification
// ---------------------------------------------------------------------------
export function SiteWeatherStep({ control, setValue }: StepProps) {
  const { colors, spacing, typography } = useTheme();
  const selectedPreset = useWatch({ control, name: "location_name" });
  const start = useWatch({ control, name: "site.analysis_start" });
  const [offset] = useState<string>(splitIso(start).offset ?? "+05:30");

  const applyPreset = (preset: (typeof LOCATION_PRESETS)[number]) => {
    setValue?.("location_name", preset.name, { shouldValidate: true });
    setValue?.("weather_archive_site", preset.id, { shouldValidate: true });
    setValue?.("site.latitude_deg", preset.latitude, { shouldValidate: true });
    setValue?.("site.longitude_deg", preset.longitude, { shouldValidate: true });
    setValue?.("site.elevation_m", preset.elevation_m, { shouldValidate: true });
    setValue?.("site.timezone", preset.timezone, { shouldValidate: true });
    setValue?.("site.weather_source", preset.weather_source, { shouldValidate: true });
  };

  return (
    <>
      <SectionHeader title="Shelter identification" caption="Name your deployment outpost design." />
      <Controller
        control={control}
        name="project_name"
        render={({ field, fieldState }) => (
          <TextField
            label="Shelter / Project Name"
            placeholder="e.g. Siachen North Ridge Post"
            value={typeof field.value === "string" ? field.value : ""}
            onChangeText={field.onChange}
            helperText="Custom identifier for this tactical shelter design."
            error={fieldState.error?.message}
          />
        )}
      />

      <SectionHeader title="Location quick-start presets" caption="Tap a strategic sector to populate coordinates." />
      <View style={styles.chipRow}>
        {LOCATION_PRESETS.map((p) => {
          const isSelected = selectedPreset === p.name;
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => applyPreset(p)}
              style={[
                styles.presetChip,
                {
                  borderColor: isSelected ? colors.primary : colors.border,
                  backgroundColor: isSelected ? colors.surfaceAlt : colors.surface,
                },
              ]}
            >
              <Text style={[typography.bodyStrong, { color: isSelected ? colors.primary : colors.textPrimary }]}>
                📍 {p.name}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                {p.latitude.toFixed(2)}°N, {p.longitude.toFixed(2)}°E · {p.elevation_m}m
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Controller
        control={control}
        name="location_name"
        render={({ field, fieldState }) => (
          <TextField
            label="Custom Location Name"
            required
            value={typeof field.value === "string" ? field.value : ""}
            onChangeText={field.onChange}
            placeholder="e.g. Ladakh DBO / Sector 4"
            error={fieldState.error?.message}
          />
        )}
      />

      <View style={styles.twoCol}>
        <View style={styles.half}>
          <FormNumber control={control} name="site.latitude_deg" label="Latitude (°)" unit="°" required allowNegative helperText="-90° to +90°" />
        </View>
        <View style={styles.half}>
          <FormNumber control={control} name="site.longitude_deg" label="Longitude (°)" unit="°" required allowNegative helperText="-180° to +180°" />
        </View>
      </View>

      <FormNumber control={control} name="site.elevation_m" label="Elevation (m AMSL)" unit="m" required allowNegative helperText="Altitude above mean sea level (-500 m to 9,000 m)." />

      <Controller
        control={control}
        name="site.timezone"
        render={({ field, fieldState }) => (
          <SelectField
            label="Timezone"
            required
            options={TIMEZONE_OPTIONS}
            value={typeof field.value === "string" ? field.value : ""}
            onChange={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />

      <SectionHeader title="Weather simulation window" caption="Meteorological simulation period." />
      <FormChoice control={control} name="site.weather_source" label="Weather source" required options={WEATHER_SOURCES} />
      <DateTimeField control={control} name="site.analysis_start" label="Analysis Start Date" offset={offset} />
      <DateTimeField control={control} name="site.analysis_end" label="Analysis End Date" offset={offset} />
      <Note>Simulations run against archived meteorological satellite datasets for this window.</Note>
    </>
  );
}

// ---------------------------------------------------------------------------
// 👥 STEP 2: Mission Profile & Room Configuration
// ---------------------------------------------------------------------------
export function MissionOccupancyStep({ control }: StepProps) {
  const { colors, spacing, typography } = useTheme();
  const catalogQuery = useTemplateCatalog();
  const templateCatalog = catalogQuery.data?.data;
  const occupants = useWatch({ control, name: "mission.occupants" }) ?? 30;
  const metabolicGain = typeof occupants === "number" ? occupants * 100 : 3000;

  return (
    <>
      <SectionHeader title="Mission profile" caption="Shelter operational role and troop occupancy." />
      <FormChoice control={control} name="mission.type" label="Mission Type" required options={MISSION_TYPES} />

      <AppCard>
        <Text style={[typography.bodyStrong, { color: colors.textPrimary, marginBottom: spacing.xs }]}>
          Troop Occupants: {occupants} Soldiers
        </Text>
        <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
          Estimated metabolic heat gain: ~{formatNumber(metabolicGain, 0)} W (~100 W / soldier)
        </Text>
        <FormNumber control={control} name="mission.occupants" label="Troop Count" unit="soldiers" integer required placeholder="30" />
      </AppCard>

      <SectionHeader title="Thermal comfort targets" caption="Thermostat setpoints and allowable cold hours." />
      <FormNumber
        control={control}
        name="mission.target_temperature_c"
        label="Target Indoor Temperature (°C)"
        unit="°C"
        allowNegative
        placeholder="18.0"
        helperText="Thermostat setpoint (5.0°C to 30.0°C, default 18.0°C)."
      />

      <FormNumber
        control={control}
        name="mission.maximum_unmet_hours"
        label="Maximum Unmet Hours"
        unit="hours"
        placeholder="24"
        helperText="Allowable weekly hours below comfort target (0 to 168 hours)."
      />

      <SectionHeader title="Required rooms checklist" caption="Rooms a shelter template supports. Sizes are generated by M2." />
      <Controller
        control={control}
        name="mission.required_rooms"
        render={({ field, fieldState }) => {
          const selected: string[] = Array.isArray(field.value) ? field.value : [];
          const toggle = (val: string) => {
            const next = selected.includes(val) ? selected.filter((s) => s !== val) : [...selected, val];
            field.onChange(next);
          };
          if (!templateCatalog) {
            return catalogQuery.isError ? (
              <ErrorView compact error={catalogQuery.error} title="Room types could not be loaded" onRetry={() => void catalogQuery.refetch()} />
            ) : (
              <Note>Loading the room types the layout generator supports…</Note>
            );
          }
          // Types saved in an older draft that the catalogue does not know are listed so they can be removed.
          const unknown = selected.filter((t) => !templateCatalog.room_types.some((r) => r.type === t));
          const types = [...templateCatalog.room_types.map((r) => r.type), ...unknown];

          return (
            <View style={{ gap: spacing.sm }}>
              {catalogQuery.data?.source === "cache" ? <Note>Offline: showing the room types last loaded from the COCOON service.</Note> : null}
              {types.map((type) => {
                const isChecked = selected.includes(type);
                const known = !unknown.includes(type);
                // An unchecked room is offered only if some template can hold it with the rooms already chosen.
                const fits = isChecked || templatesCovering(templateCatalog, [...selected, type]).length > 0;
                const label = roomLabel(type);
                const reason = !known
                  ? "The layout generator has no room of this type. Remove it to continue."
                  : fits
                    ? undefined
                    : `No shelter template has a ${label.toLowerCase()} room together with the rooms already selected.`;
                return (
                  <AppCard
                    key={type}
                    onPress={fits || isChecked ? () => toggle(type) : undefined}
                    emphasis={isChecked ? "accent" : "none"}
                    accessibilityLabel={`${label}, ${isChecked ? "checked" : fits ? "unchecked" : "unavailable"}${reason ? `. ${reason}` : ""}`}
                  >
                    <View style={[styles.roomRow, { opacity: fits ? 1 : 0.5 }]}>
                      <View style={[styles.checkbox, { borderColor: isChecked ? colors.primary : colors.border, backgroundColor: isChecked ? colors.primary : colors.surface }]}>
                        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{isChecked ? "✓" : ""}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{label}</Text>
                        {roomDescription(type) ? (
                          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>{roomDescription(type)}</Text>
                        ) : null}
                        {known ? (
                          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>{sizingFor(templateCatalog, type)}</Text>
                        ) : null}
                        {reason ? (
                          <Text style={[typography.caption, { color: known ? colors.textSecondary : colors.danger, marginTop: 2 }]}>{reason}</Text>
                        ) : null}
                      </View>
                    </View>
                    {isChecked && known ? <ArrangementControl control={control} type={type} catalog={templateCatalog} /> : null}
                  </AppCard>
                );
              })}
              {fieldState.error ? <Text style={[typography.caption, { color: colors.danger }]}>{fieldState.error.message}</Text> : null}
            </View>
          );
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// 🛡️ STEP 3: Site Limits & Material/Fuel Constraints
// ---------------------------------------------------------------------------
export function SiteConstraintsStep({ control }: StepProps) {
  const { colors, spacing, typography } = useTheme();
  const catalog = useMaterialCatalog();
  const catalogList = catalog.data?.data?.snapshots?.[0]?.materials;
  const templateCatalog = useTemplateCatalog().data?.data;
  // The material set generation will use; M2's role for each material is read from the catalogue for that set.
  const snapshotId = useWatch({ control, name: "generation_options.materials_snapshot_id" }) ?? catalog.data?.data?.defaultSnapshotId;
  const floorChoices = templateCatalog
    ? floorOptions(templateCatalog).map((o) => ({ value: o.value, label: o.value === "1" ? "1 Floor (Single Storey)" : `Up to ${o.value} Floors` }))
    : [{ value: "1", label: "1 Floor (Single Storey)" }];

  return (
    <>
      <SectionHeader title="Site boundaries & building limits" caption="Footprint and structural height restrictions." />
      <FormNumber
        control={control}
        name="constraints.maximum_footprint_m2"
        label="Maximum Footprint (m²)"
        unit="m²"
        required
        placeholder="120"
        helperText="Max allowable ground area (1 to 5,000 m²)."
      />

      <Controller
        control={control}
        name="constraints.maximum_floors"
        render={({ field, fieldState }) => (
          <SelectField
            label="Maximum Building Floors"
            options={floorChoices}
            value={typeof field.value === "number" ? String(field.value) : "1"}
            onChange={(v) => field.onChange(Number(v))}
            error={fieldState.error?.message}
          />
        )}
      />

      <FormNumber
        control={control}
        name="constraints.maximum_capex_inr"
        label="Budget Cap (₹ INR)"
        unit="₹"
        nullable
        placeholder="2500000"
        helperText="Max Capital Expenditure ceiling (e.g. ₹25,00,000)."
      />

      <View style={styles.twoCol}>
        <View style={styles.half}>
          <FormNumber
            control={control}
            name="constraints.maximum_mass_kg"
            label="Max Structural Mass"
            unit="kg"
            nullable
            placeholder="15000"
            helperText="Airlift weight limit."
          />
        </View>
        <View style={styles.half}>
          <FormNumber
            control={control}
            name="constraints.max_assembly_time_hours"
            label="Max Assembly Time"
            unit="hours"
            nullable
            placeholder="48"
            helperText="Combat deployment limit."
          />
        </View>
      </View>

      <SectionHeader title="Available materials checklist" caption="Every design needs a structural material; roles come from the layout generator." />
      <Controller
        control={control}
        name="constraints.available_material_ids"
        render={({ field, fieldState }) => {
          const selected: string[] = Array.isArray(field.value) ? field.value : [];

          const toggle = (id: string) => {
            const next = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
            field.onChange(next);
          };

          return (
            <View style={{ gap: spacing.xs }}>
              {STANDARD_MATERIALS.map((mat) => {
                const isSelected = selected.includes(mat.value);
                const catalogMatch = catalogList?.find((m) => m.id === mat.value);
                const support = materialSupport(templateCatalog, snapshotId, mat.value);
                // Known catalogue but no entry = not in the material set generation uses; role null = M2 has no rule for it.
                const unusable = templateCatalog !== undefined && (support === undefined || support.role === null);
                const roleNote = !templateCatalog
                  ? undefined
                  : support === undefined
                    ? "Not in the material set used for generation, so it will not be used."
                    : support.role === null
                      ? "The layout generator has no thickness rule for this material, so it cannot be used in a design."
                      : support.role === "structural"
                        ? "Structural: can form walls, roof and floor."
                        : "Insulation: used alongside a structural material, never on its own.";

                return (
                  <AppCard
                    key={mat.value}
                    onPress={unusable && !isSelected ? undefined : () => toggle(mat.value)}
                    emphasis={isSelected ? "accent" : "none"}
                    accessibilityLabel={`${mat.label}, ${isSelected ? "selected" : unusable ? "cannot be selected" : "unselected"}${roleNote ? `. ${roleNote}` : ""}`}
                  >
                    <View style={styles.roomRow}>
                      <View style={[styles.checkbox, { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary : colors.surface }]}>
                        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{isSelected ? "✓" : ""}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{mat.label}</Text>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>{mat.description}</Text>
                        {roleNote ? (
                          <Text style={[typography.caption, { color: unusable ? colors.danger : colors.textSecondary, marginTop: 2 }]}>{roleNote}</Text>
                        ) : null}
                        {catalogMatch ? (
                          <Text style={[typography.caption, { color: colors.primary, marginTop: 2, fontSize: 11 }]}>
                            k = {catalogMatch.properties.thermal_conductivity_w_mk.toFixed(3)} W/m·K | ρ = {catalogMatch.properties.density_kg_m3} kg/m³
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </AppCard>
                );
              })}
              {fieldState.error ? <Text style={[typography.caption, { color: colors.danger }]}>{fieldState.error.message}</Text> : null}
            </View>
          );
        }}
      />

      <SectionHeader title="Heating fuel sources" caption="Allowable thermal sources for heating calculations." />
      <FormMultiChoice control={control} name="constraints.heater_fuels" label="Heating Fuel Sources" options={HEATER_FUELS} />
    </>
  );
}

// ---------------------------------------------------------------------------
// 📐 STEP 4: Architectural Envelope & Envelope Physics
// ---------------------------------------------------------------------------
export function ArchitecturalEnvelopeStep({ control }: StepProps) {
  const { colors, spacing, typography } = useTheme();

  return (
    <>
      <SectionHeader title="Building geometric envelope" caption="Exterior dimensions along cardinal axes." />
      <View style={styles.twoCol}>
        <View style={styles.half}>
          <FormNumber control={control} name="envelope.length_m" label="Building Length (E-W)" unit="m" placeholder="7.0" helperText="Exterior length (e.g. 7.0 m)." />
        </View>
        <View style={styles.half}>
          <FormNumber control={control} name="envelope.width_m" label="Building Width (N-S)" unit="m" placeholder="6.0" helperText="Exterior width (e.g. 6.0 m)." />
        </View>
      </View>

      <FormNumber control={control} name="envelope.height_m" label="Ceiling Height per Floor" unit="m" placeholder="2.7" helperText="Vertical clear height (e.g. 2.7 m)." />

      <SectionHeader title="Assembly layer thicknesses" caption="Exterior shell envelope composite insulation." />
      <View style={styles.twoCol}>
        <View style={styles.half}>
          <FormNumber control={control} name="envelope.wall_thickness_mm" label="Wall Thickness" unit="mm" placeholder="300" helperText="Composite wall (e.g. 300 mm)." />
        </View>
        <View style={styles.half}>
          <FormNumber control={control} name="envelope.roof_thickness_mm" label="Roof Thickness" unit="mm" placeholder="220" helperText="Roof slab (e.g. 220 mm)." />
        </View>
      </View>

      <FormNumber control={control} name="envelope.floor_thickness_mm" label="Floor Foundation Thickness" unit="mm" placeholder="220" helperText="Subfloor foundation insulation (e.g. 220 mm)." />

      <SectionHeader title="Solar fenestration & glazing" caption="Window apertures, dimensions & orientation." />
      <FormNumber control={control} name="envelope.window_count" label="Window Count" unit="windows" integer placeholder="4" helperText="Total glazing apertures (0 to 12 windows)." />

      <View style={styles.twoCol}>
        <View style={styles.half}>
          <FormNumber control={control} name="envelope.window_width_m" label="Window Width" unit="m" placeholder="1.2" helperText="e.g. 1.2 m" />
        </View>
        <View style={styles.half}>
          <FormNumber control={control} name="envelope.window_height_m" label="Window Height" unit="m" placeholder="1.2" helperText="e.g. 1.2 m" />
        </View>
      </View>

      <Controller
        control={control}
        name="envelope.window_orientation"
        render={({ field, fieldState }) => (
          <SelectField
            label="Window Orientation"
            options={WINDOW_ORIENTATIONS}
            value={typeof field.value === "string" ? field.value : ""}
            onChange={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />

      <FormChoice control={control} name="envelope.glazing_spec" label="Glazing Specification" options={GLAZING_SPECS} />

      <SectionHeader title="Airtightness & infiltration" caption="Envelope air exchange rate under arctic winds." />
      <FormNumber
        control={control}
        name="envelope.air_changes_per_hour"
        label="Airtightness / Infiltration (ACH)"
        unit="ACH"
        placeholder="0.5"
        helperText="Air Changes per Hour (0.0 to 10.0 ACH, standard tight: 0.5 ACH)."
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// ⚙️ STEP 5: Solver & Optimization Controls
// ---------------------------------------------------------------------------
export function OptimizationStep({ control }: StepProps) {
  const { colors, spacing, typography } = useTheme();

  return (
    <>
      <SectionHeader title="Generative synthesis controls" caption="Candidate pool size and simulation parameters." />
      <FormNumber
        control={control}
        name="generation_options.count"
        label="Candidate Pool Count"
        unit="candidates"
        integer
        placeholder="24"
        helperText="Number of generative configurations to synthesize (1 to 200 candidates)."
      />

      <SectionHeader title="Economic lifecycle scenario" caption="Cost analysis and fuel pricing projection." />
      <FormChoice
        control={control}
        name="economic_assumption_set_id"
        label="Economic Assumption Set"
        options={ECONOMIC_SCENARIOS}
      />

      <AppCard>
        <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>⚡ Fast Solver Execution</Text>
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 4 }]}>
          Generates candidate layouts, evaluates 3D envelopes, and runs RC thermal network physics to rank candidates by thermal performance.
        </Text>
      </AppCard>
    </>
  );
}

// Backwards compatibility export
export function ShelterDesignStep(props: StepProps) {
  return <SiteConstraintsStep {...props} />;
}

// ---------------------------------------------------------------------------
// Date/Time helper components
// ---------------------------------------------------------------------------
const ISO_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):\d{2}(?:\.\d+)?([+-]\d{2}:\d{2}|Z)$/;

type ArrangementValue = "either" | "dedicated" | "shared";

/** Own room / shared / either — offered only when the catalogue has templates of both kinds for this room type. */
function ArrangementControl({ control, type, catalog }: { control: DraftControl; type: string; catalog: TemplateCatalog }) {
  const { colors, radii, spacing, typography } = useTheme();
  const support = arrangementSupport(catalog, type);
  const label = roomLabel(type).toLowerCase();
  if (!support.canShare || !support.canDedicate) {
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
        const setArrangement = (v: ArrangementValue) => {
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
              {options.map((o) => {
                const on = current === o.value;
                return (
                  <Pressable
                    key={o.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => setArrangement(o.value)}
                    style={[
                      styles.arrangementChip,
                      {
                        borderColor: on ? colors.accent : colors.border,
                        backgroundColor: on ? colors.surfaceAlt : colors.surface,
                        borderRadius: radii.sm,
                        paddingHorizontal: spacing.md,
                      },
                    ]}
                  >
                    <Text style={[typography.caption, { color: colors.textPrimary, fontWeight: "600" }]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      }}
    />
  );
}

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
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Choose ${label.toLowerCase()} date`}
          onPress={() => openPicker("date")}
          style={[styles.dateButton, { flex: 1, borderColor: colors.border, borderRadius: radii.sm, padding: spacing.md, backgroundColor: colors.surface }]}
        >
          <Text style={[typography.caption, { color: colors.textSecondary }]}>DATE</Text>
          <Text style={[typography.bodyStrong, { color: colors.textPrimary, marginTop: 4 }]}>{pickedValue ? pickedValue.slice(0, 10) : "Choose date"}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Choose ${label.toLowerCase()} time`}
          onPress={() => openPicker("time")}
          style={[styles.dateButton, { flex: 1, borderColor: colors.border, borderRadius: radii.sm, padding: spacing.md, backgroundColor: colors.surface }]}
        >
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
                <Pressable accessibilityRole="button" onPress={() => setPickerMode(null)}>
                  <Text style={[typography.body, { color: colors.textSecondary }]}>Cancel</Text>
                </Pressable>
                <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{pickerMode === "date" ? "Select date" : "Select time"}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    savePicked(pendingDate);
                    setPickerMode(null);
                  }}
                >
                  <Text style={[typography.bodyStrong, { color: colors.primary }]}>Done</Text>
                </Pressable>
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

const styles = StyleSheet.create({
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  presetChip: { borderWidth: 1.5, borderRadius: 8, padding: 10, minWidth: "47%", flex: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  dateButton: { borderWidth: 1, minHeight: 64, justifyContent: "center" },
  pickerScrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  pickerSheet: { borderWidth: 1, paddingBottom: 24 },
  pickerActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 12 },
  roomRow: { flexDirection: "row", alignItems: "center" },
  arrangementChip: { borderWidth: 1.5, minHeight: minTouchTarget, justifyContent: "center" },
  twoCol: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },
});
