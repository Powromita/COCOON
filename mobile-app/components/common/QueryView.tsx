import type { UseQueryResult } from "@tanstack/react-query";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../theme";
import { EmptyState } from "./EmptyState";
import { ErrorView } from "./ErrorView";

interface QueryViewProps<T> {
  query: Pick<UseQueryResult<T>, "data" | "isLoading" | "isError" | "error" | "refetch" | "isPending">;
  loadingLabel?: string;
  isEmpty?: (data: T) => boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  errorTitle?: string;
  children: (data: T) => React.ReactNode;
}

/** Every API-driven block renders one of: loading, error (with retry), empty, or content. Never blank. */
export function QueryView<T>({
  query,
  loadingLabel = "Loading…",
  isEmpty,
  emptyTitle = "Nothing here yet",
  emptyMessage,
  errorTitle,
  children,
}: QueryViewProps<T>) {
  const { colors, spacing, typography } = useTheme();

  if (query.isError) {
    return <ErrorView error={query.error} title={errorTitle} onRetry={() => void query.refetch()} />;
  }
  if (query.data === undefined) {
    return (
      <View style={[styles.loading, { padding: spacing.xl }]} accessibilityLabel={loadingLabel}>
        <ActivityIndicator color={colors.accent} />
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>{loadingLabel}</Text>
      </View>
    );
  }
  if (isEmpty?.(query.data)) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }
  return <>{children(query.data)}</>;
}

const styles = StyleSheet.create({
  loading: { alignItems: "center", justifyContent: "center" },
});
