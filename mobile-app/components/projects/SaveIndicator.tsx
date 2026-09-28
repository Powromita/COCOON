import React from "react";
import { Text } from "react-native";

import type { SaveStatus } from "../../hooks/useAutosave";
import { useT } from "../../i18n";
import { useTheme } from "../../theme";
import { relativeTime } from "../../utils/format";

/** Draft autosave state: "✓ Draft saved · just now", "Saving…", or a visible failure. */
export function SaveIndicator({ status, lastSavedAt }: { status: SaveStatus; lastSavedAt: string | null }) {
  const { colors, typography } = useTheme();
  const t = useT();

  const label =
    status === "saving"
      ? t("Saving…")
      : status === "error"
        ? `${t("Save failed")} — ${t("Retry")}`
        : status === "saved"
          ? `✓ ${t("Draft saved")}${lastSavedAt ? ` · ${relativeTime(lastSavedAt)}` : ""}`
          : "";

  if (!label) return null;

  return (
    <Text
      style={[typography.caption, { color: status === "error" ? colors.danger : status === "saved" ? colors.statusReady : colors.textSecondary }]}
      accessibilityLiveRegion="polite"
    >
      {label}
    </Text>
  );
}
