import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ProjectListItem } from "../../database/schema/types";
import { useT } from "../../i18n";
import { useTheme } from "../../theme";
import { formatLocalDateTime, formatWithUnit, NOT_AVAILABLE, relativeTime } from "../../utils/format";
import { AppCard } from "../common/AppCard";
import { KeyValueRow } from "../common/KeyValueRow";
import { Tag } from "../common/Tag";
import { ProjectStatusBadge } from "./ProjectStatusBadge";

export type ProjectOrigin = "LOCAL" | "REMOTE" | "DEMO";

interface ProjectListRowProps {
  item: ProjectListItem;
  onPress: () => void;
  onLongPress?: () => void;
  onDelete?: () => void;
  onRename?: () => void;
  /** Where the project lives — always shown, never mixed silently. */
  origin?: ProjectOrigin;
  compact?: boolean;
}

/** Technical project card: ID, name, location, occupants, area, materials, status, last updated, validation. */
export function ProjectListRow({ item, onPress, onLongPress, onDelete, onRename, origin = "LOCAL", compact }: ProjectListRowProps) {
  const { colors, radii, spacing, typography } = useTheme();
  const t = useT();
  const validation =
    item.runStatus === "completed"
      ? "RC simulation complete"
      : item.runStatus === "failed"
        ? "Pipeline failed"
        : item.runStatus
          ? "Run in progress"
          : "No run yet";

  return (
    <AppCard
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={`${origin} project ${item.name}. ${item.locationLabel ?? "Location not set"}.${onDelete ? " Tap delete to remove." : ""}`}
    >
      <View style={styles.top}>
        <Tag label={t(origin)} tone={origin === "DEMO" ? "demo" : origin === "REMOTE" ? "info" : "neutral"} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <ProjectStatusBadge status={item.displayStatus} />
          {onDelete ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete project ${item.name}`}
              onPress={(e) => {
                e.stopPropagation?.();
                onDelete();
              }}
              style={({ pressed }) => [
                styles.deleteBtn,
                {
                  borderColor: colors.danger,
                  backgroundColor: colors.dangerBg,
                  borderRadius: radii.sm,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[typography.caption, { color: colors.danger, fontWeight: "700" }]}>🗑️ Delete</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Text style={[typography.subtitle, { color: colors.textPrimary, marginTop: spacing.xs }]} numberOfLines={2}>
        {item.name}
      </Text>
      <Text style={[typography.monoSmall, { color: colors.textSecondary }]} selectable>
        {item.id}
      </Text>
      {compact ? (
        <Text style={[typography.caption, { color: colors.textBody, marginTop: spacing.xs }]}>
          {item.locationLabel ?? "Location not set"} · updated {relativeTime(item.updatedAt)}
        </Text>
      ) : (
        <View style={{ marginTop: spacing.xs }}>
          <KeyValueRow label="Location" value={item.locationLabel ?? NOT_AVAILABLE} mono />
          <KeyValueRow label="Occupants" value={item.occupants === null ? NOT_AVAILABLE : String(item.occupants)} mono />
          <KeyValueRow label="Max footprint" value={item.maxFootprintM2 === null ? NOT_AVAILABLE : formatWithUnit(item.maxFootprintM2, "m²", 0)} mono />
          <KeyValueRow label="Materials" value={item.materialIds.length > 0 ? item.materialIds.join(", ") : "Any in set"} mono />
          <KeyValueRow label="Validation" value={validation} />
          <KeyValueRow label="Last updated" value={formatLocalDateTime(item.updatedAt)} mono last />
        </View>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  deleteBtn: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
