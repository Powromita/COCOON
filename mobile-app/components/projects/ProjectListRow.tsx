import React from "react";
import { StyleSheet, Text, View } from "react-native";

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
  /** Where the project lives — always shown, never mixed silently. */
  origin?: ProjectOrigin;
  compact?: boolean;
}

/** Technical project card: ID, name, location, occupants, area, materials, status, last updated, validation. */
export function ProjectListRow({ item, onPress, onLongPress, origin = "LOCAL", compact }: ProjectListRowProps) {
  const { colors, spacing, typography } = useTheme();
  const t = useT();
  const validation =
    item.runStatus === "completed"
      ? item.dataProvider === "fixture"
        ? "RC engine (demo run)"
        : "RC engine · ANSYS not requested"
      : item.runStatus === "failed"
        ? "Pipeline failed"
        : item.runStatus
          ? "Run in progress"
          : "No run yet";

  return (
    <AppCard
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={`${origin} project ${item.name}. ${item.locationLabel ?? "Location not set"}.${onLongPress ? " Long-press to delete." : ""}`}
    >
      <View style={styles.top}>
        <Tag label={t(origin)} tone={origin === "DEMO" ? "demo" : origin === "REMOTE" ? "info" : "neutral"} />
        <ProjectStatusBadge status={item.displayStatus} />
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
});
