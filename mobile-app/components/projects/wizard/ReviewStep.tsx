import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { DraftRequirements } from "../../../database/schema/types";
import { useTheme } from "../../../theme";
import { formatInr, formatWithUnit, NOT_AVAILABLE } from "../../../utils/format";
import {
  GLAZING_SPECS,
  HEATER_FUELS,
  MISSION_TYPES,
  optionLabel,
  ROOM_TYPES,
  STANDARD_MATERIALS,
  WEATHER_SOURCES,
} from "../../../validation/options";
import type { FieldErrors } from "../../../validation/schemas";
import type { WizardStepId } from "../../../validation/steps";
import { AppCard } from "../../common/AppCard";
import { KeyValueRow } from "../../common/KeyValueRow";

interface Section {
  step: WizardStepId;
  title: string;
  rows: [string, string | undefined][];
}

const show = (v: string | undefined | null) => (v === undefined || v === null || v === "" ? undefined : v);
const num = (v: number | null | undefined, unit: string, decimals = 1) =>
  typeof v === "number" ? formatWithUnit(v, unit, decimals) : undefined;
const limit = (v: number | null | undefined, unit: string, decimals = 0) =>
  v === null ? "No limit" : num(v, unit, decimals);

function sections(d: DraftRequirements): Section[] {
  const s = d.site ?? {};
  const m = d.mission ?? {};
  const c = d.constraints ?? {};
  const env = d.envelope ?? {};

  return [
    {
      step: "site",
      title: "1. Location & Weather",
      rows: [
        ["Shelter name", show(d.project_name) ?? "Custom shelter"],
        ["Location", show(d.location_name)],
        ["Coordinates", s.latitude_deg !== undefined && s.longitude_deg !== undefined ? `${s.latitude_deg.toFixed(2)}°N, ${s.longitude_deg.toFixed(2)}°E` : undefined],
        ["Elevation", num(s.elevation_m, "m AMSL", 0)],
        ["Timezone", show(s.timezone)],
        ["Weather archive", optionLabel(WEATHER_SOURCES, s.weather_source)],
        ["Analysis start", show(s.analysis_start)],
        ["Analysis end", show(s.analysis_end)],
      ],
    },
    {
      step: "mission",
      title: "2. Mission & Rooms",
      rows: [
        ["Mission profile", optionLabel(MISSION_TYPES, m.type)],
        ["Troop occupants", num(m.occupants, "soldiers", 0)],
        ["Target indoor temp", num(m.target_temperature_c, "°C")],
        ["Max unmet hours", num(m.maximum_unmet_hours, "h", 0)],
        ["Required rooms", m.required_rooms?.map((r) => optionLabel(ROOM_TYPES, r)).join(", ")],
      ],
    },
    {
      step: "constraints",
      title: "3. Site Limits & Materials",
      rows: [
        ["Maximum footprint", limit(c.maximum_footprint_m2, "m²") ?? "No limit"],
        ["Maximum floors", typeof c.maximum_floors === "number" ? `${c.maximum_floors} floor${c.maximum_floors > 1 ? "s" : ""}` : "1 floor"],
        ["Budget cap (INR)", typeof c.maximum_capex_inr === "number" ? formatInr(c.maximum_capex_inr) : "No limit"],
        ["Max structural mass", limit(c.maximum_mass_kg, "kg") ?? "No limit"],
        ["Max assembly time", limit(c.max_assembly_time_hours, "h") ?? "No limit"],
        ["Permitted materials", c.available_material_ids?.map((id) => optionLabel(STANDARD_MATERIALS, id) ?? id.replace(/^mat_/, "").replaceAll("_", " ")).join(", ") ?? "Default catalog"],
        ["Heating fuel sources", c.heater_fuels?.map((f) => optionLabel(HEATER_FUELS, f)).join(", ") ?? "Kerosene"],
      ],
    },
    {
      step: "envelope",
      title: "4. Architectural Envelope",
      rows: [
        ["Dimensions (L × W × H)", env.length_m && env.width_m && env.height_m ? `${env.length_m}m × ${env.width_m}m × ${env.height_m}m` : undefined],
        ["Wall thickness", num(env.wall_thickness_mm, "mm", 0)],
        ["Roof thickness", num(env.roof_thickness_mm, "mm", 0)],
        ["Floor thickness", num(env.floor_thickness_mm, "mm", 0)],
        ["Window apertures", env.window_count !== undefined ? `${env.window_count} window${env.window_count === 1 ? "" : "s"} (${env.window_width_m ?? 1.2}m × ${env.window_height_m ?? 1.2}m)` : undefined],
        ["Window orientation", show(env.window_orientation)],
        ["Glazing spec", optionLabel(GLAZING_SPECS, env.glazing_spec)],
        ["Airtightness", num(env.air_changes_per_hour, "ACH", 1)],
      ],
    },
    {
      step: "optimize",
      title: "5. Solver & Optimization",
      rows: [
        ["Candidate pool count", num(d.generation_options?.count, "candidates", 0) ?? "24"],
      ],
    },
  ];
}

interface ReviewStepProps {
  draft: DraftRequirements;
  errors: FieldErrors;
  onEditStep: (step: WizardStepId) => void;
}

export function ReviewStep({ draft, errors, onEditStep }: ReviewStepProps) {
  const { colors, spacing, typography } = useTheme();

  return (
    <>
      {sections(draft).map((section) => {
        const sectionErrors = errors.filter(
          (e) => e.step === section.step || (section.step === "constraints" && e.step === "design")
        );
        return (
          <AppCard key={section.step} emphasis={sectionErrors.length > 0 ? "demo" : "none"}>
            <View style={styles.header}>
              <Text accessibilityRole="header" style={[typography.label, { color: colors.textSecondary, flex: 1 }]}>
                {section.title.toUpperCase()}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${section.title}`}
                onPress={() => onEditStep(section.step)}
                hitSlop={8}
                style={styles.edit}
              >
                <Text style={[typography.caption, { color: colors.primary, fontWeight: "600" }]}>Edit</Text>
              </Pressable>
            </View>
            {section.rows.map(([label, value], i) => (
              <KeyValueRow key={label} label={label} value={value ?? NOT_AVAILABLE} last={i === section.rows.length - 1} />
            ))}
            {sectionErrors.map((e) => (
              <Text key={`${e.field}-${e.kind}`} style={[typography.caption, { color: colors.danger, marginTop: spacing.xs }]}>
                {e.label}: {e.message}
              </Text>
            ))}
          </AppCard>
        );
      })}

      <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md, marginTop: spacing.xs }]}>
        Generating executes the COCOON generative engine to synthesize geometries, calculate RC thermal dynamics, and rank candidates by Pareto efficiency.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  edit: { minHeight: 32, minWidth: 48, alignItems: "flex-end", justifyContent: "center" },
});
