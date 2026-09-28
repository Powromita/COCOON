import React from "react";
import { Text, View } from "react-native";

import { useCapabilities } from "../../hooks/useCocoon";
import { useTheme } from "../../theme";
import { formatLocalDateTime } from "../../utils/format";
import { AppCard } from "../common/AppCard";
import { ErrorView } from "../common/ErrorView";
import { StatusBadge } from "../common/StatusBadge";

/** "COCOON System Status" — exactly what the capabilities service reports, nothing assumed. */
export function SystemStatusCard({ compact }: { compact?: boolean }) {
  const { colors, spacing, typography } = useTheme();
  const caps = useCapabilities();

  if (caps.isError) return <ErrorView compact error={caps.error} title="System status unavailable" onRetry={() => void caps.refetch()} />;
  if (!caps.data) {
    return (
      <AppCard>
        <Text style={[typography.caption, { color: colors.textSecondary }]}>Checking system status…</Text>
      </AppCard>
    );
  }

  const entries = compact
    ? caps.data.entries.filter((e) => ["backend", "physics_engine", "ml", "optimization", "economics", "ansys", "reports"].includes(e.key))
    : caps.data.entries;

  return (
    <AppCard>
      {entries.map((e, i) => (
        <View
          key={e.key}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            paddingVertical: spacing.xs,
            borderBottomWidth: i === entries.length - 1 ? 0 : 0.5,
            borderColor: colors.border,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={[typography.body, { color: colors.textPrimary }]}>{e.label}</Text>
            {!compact && e.detail ? <Text style={[typography.caption, { color: colors.textSecondary }]}>{e.detail}</Text> : null}
          </View>
          <StatusBadge status={e.status} />
        </View>
      ))}
      <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
        Checked {formatLocalDateTime(caps.data.checkedAt)}
      </Text>
    </AppCard>
  );
}
