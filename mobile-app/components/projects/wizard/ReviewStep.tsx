import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { DraftRequirements } from "../../../database/schema/types";
import { useTheme } from "../../../theme";
import { formatInr, formatWithUnit, NOT_AVAILABLE } from "../../../utils/format";
import { HEATER_FUELS, MISSION_TYPES, optionLabel, ROOM_TYPES, WEATHER_SOURCES } from "../../../validation/options";
import type { FieldErrors } from "../../../validation/schemas";
import type { WizardStepId } from "../../../validation/steps";
import { AppCard } from "../../common/AppCard";
import { KeyValueRow } from "../../common/KeyValueRow";
import { FormNumber, type DraftControl } from "../../forms/FormFields";

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
  return [
    {
      step: "location",
      title: "Location",
      rows: [
        ["Latitude", num(s.latitude_deg, "°", 4)],
        ["Longitude", num(s.longitude_deg, "°", 4)],
        ["Elevation", num(s.elevation_m, "m", 0)],
        ["Timezone", show(s.timezone)],
      ],
    },
    {
      step: "weather",
      title: "Weather",
      rows: [
        ["Source", optionLabel(WEATHER_SOURCES, s.weather_source)],
        ["Analysis start", show(s.analysis_start)],
        ["Analysis end", show(s.analysis_end)],
      ],
    },
    { step: "mission", title: "Mission", rows: [["Mode", "New shelter"], ["Purpose", optionLabel(MISSION_TYPES, m.type)]] },
    {
      step: "occupancy",
      title: "Occupancy",
      rows: [
        ["Occupants", num(m.occupants, "persons", 0)],
        ["Schedule id", show(m.occupancy_schedule_id) ?? "Default"],
      ],
    },
    {
      step: "rooms",
      title: "Rooms",
      rows: [
        [
          "Required rooms",
          m.required_rooms && m.required_rooms.length > 0
            ? m.required_rooms.map((r) => optionLabel(ROOM_TYPES, r)).join(", ")
            : undefined,
        ],
      ],
    },
    {
      step: "footprint",
      title: "Footprint",
      rows: [
        ["Maximum footprint", limit(c.maximum_footprint_m2, "m²") ?? "No limit"],
        ["Maximum floors", typeof c.maximum_floors === "number" ? String(c.maximum_floors) : "Not set (generator default)"],
        ["Preferred orientation", num(c.preferred_orientation_deg, "°", 0) ?? "Generator decides"],
      ],
    },
    {
      step: "materials",
      title: "Materials",
      rows: [
        ["Material set", show(d.generation_options?.materials_snapshot_id) ?? "Backend default"],
        [
          "Permitted materials",
          c.available_material_ids && c.available_material_ids.length > 0 ? c.available_material_ids.join(", ") : "Any in the set",
        ],
      ],
    },
    {
      step: "comfort",
      title: "Comfort",
      rows: [
        ["Target temperature", num(m.target_temperature_c, "°C") ?? "Contract default"],
        ["Maximum unmet hours", num(m.maximum_unmet_hours, "h") ?? "Contract default"],
      ],
    },
    {
      step: "budget",
      title: "Budget",
      rows: [
        ["Maximum CAPEX", typeof c.maximum_capex_inr === "number" ? formatInr(c.maximum_capex_inr) : "No limit"],
        ["Maximum mass", limit(c.maximum_mass_kg, "kg") ?? "No limit"],
        ["Maximum assembly time", limit(c.max_assembly_time_hours, "h") ?? "No limit"],
        [
          "Heater fuels",
          c.heater_fuels && c.heater_fuels.length > 0 ? c.heater_fuels.map((f) => optionLabel(HEATER_FUELS, f)).join(", ") : "Not restricted",
        ],
        ["Assumption set", show(d.economic_assumption_set_id)],
      ],
    },
  ];
}

interface ReviewStepProps {
  control: DraftControl;
  draft: DraftRequirements;
  errors: FieldErrors;
  onEditStep: (step: WizardStepId) => void;
}

export function ReviewStep({ control, draft, errors, onEditStep }: ReviewStepProps) {
  const { colors, spacing, typography } = useTheme();
  return (
    <>
      {sections(draft).map((section) => {
        const sectionErrors = errors.filter((e) => e.step === section.step);
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
                <Text style={[typography.caption, { color: colors.accent, fontWeight: "600" }]}>Edit</Text>
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

      <AppCard>
        <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.sm }]}>GENERATION</Text>
        <FormNumber control={control} name="generation_options.count" label="Candidate designs" integer placeholder="20" helperText="How many layouts the backend generates and evaluates (1–200). Default 20." />
        <FormNumber control={control} name="generation_options.seed" label="Random seed" integer placeholder="42" helperText="Same seed + same requirements reproduce the same candidates." />
        {errors
          .filter((e) => e.step === "review")
          .map((e) => (
            <Text key={e.field} style={[typography.caption, { color: colors.danger }]}>
              {e.label}: {e.message}
            </Text>
          ))}
      </AppCard>
      <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>
        Generating sends these requirements to the COCOON backend, which generates, simulates, prices and ranks the
        candidates. Nothing is calculated on this device.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  edit: { minHeight: 32, minWidth: 48, alignItems: "flex-end", justifyContent: "center" },
});
