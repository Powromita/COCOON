import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { DraftRequirements } from "../../../database/schema/types";
import { useTheme } from "../../../theme";
import { formatInr, formatWithUnit, humanize, NOT_AVAILABLE } from "../../../utils/format";
import { HEATER_FUELS, MISSION_TYPES, optionLabel, ROOM_TYPES, WEATHER_SOURCES } from "../../../validation/options";
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

function arrangementText(map: Record<string, "dedicated" | "shared"> | undefined): string {
  const entries = Object.entries(map ?? {});
  if (entries.length === 0) return "Any supported arrangement";
  return entries.map(([type, a]) => `${optionLabel(ROOM_TYPES, type)}: ${a === "dedicated" ? "own room" : "shared"}`).join(", ");
}

function sections(d: DraftRequirements): Section[] {
  const s = d.site ?? {};
  const m = d.mission ?? {};
  const c = d.constraints ?? {};
  return [
    {
      step: "site",
      title: "Location & weather",
      rows: [
        ["Location", show(d.location_name)],
        ["Elevation", num(s.elevation_m, "m", 0)],
        ["Source", optionLabel(WEATHER_SOURCES, s.weather_source)],
        ["Analysis start", show(s.analysis_start)],
        ["Analysis end", show(s.analysis_end)],
      ],
    },
    {
      step: "design",
      title: "Design constraints",
      rows: [
        ["Maximum footprint", limit(c.maximum_footprint_m2, "m²") ?? "No limit"],
        ["Maximum floors", typeof c.maximum_floors === "number" ? String(c.maximum_floors) : "System decides"],
        ["Preferred orientation", num(c.preferred_orientation_deg, "°", 0) ?? "System decides"],
        ["Permitted materials", c.available_material_ids?.map((id) => id.replace(/^mat_/, "").replaceAll("_", " ")).join(", ") ?? "Any in the default set"],
        ["Maximum CAPEX", typeof c.maximum_capex_inr === "number" ? formatInr(c.maximum_capex_inr) : "No limit"],
        ["Heater fuels", c.heater_fuels?.map((f) => optionLabel(HEATER_FUELS, f)).join(", ") ?? "No fuel selected"],
      ],
    },
    {
      step: "mission",
      title: "Mission & comfort",
      rows: [
        ["Purpose", optionLabel(MISSION_TYPES, m.type)],
        ["Occupants", num(m.occupants, "persons", 0)],
        ["Required rooms", m.required_rooms?.map((r) => optionLabel(ROOM_TYPES, r)).join(", ")],
        ["Room arrangement", arrangementText(d.generation_options?.room_arrangement)],
        ["Target temperature", num(m.target_temperature_c, "°C")],
        ["Maximum unmet hours", num(m.maximum_unmet_hours, "h")],
      ],
    },
    { step: "optimize", title: "Optimization & economics", rows: [["Candidate designs", num(d.generation_options?.count, "designs", 0) ?? "24"], ["Shelter template", d.generation_options?.template_id ? humanize(d.generation_options.template_id) : "Automatic"], ["Lifecycle assumptions", show(d.economic_assumption_set_id)]] },
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

      {errors.filter((e) => e.step === "optimize").map((e) => (
        <Text key={e.field} style={[typography.caption, { color: colors.danger }]}>{e.label}: {e.message}</Text>
      ))}
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
