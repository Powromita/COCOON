import React from "react";
import { ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "../../theme";

interface ScreenContainerProps {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
}

/** Standard screen wrapper: safe-area aware, themed background, consistent padding. */
export function ScreenContainer({ children, scroll = false, style }: ScreenContainerProps) {
  const { colors, spacing } = useTheme();

  const content = (
    <View style={[styles.content, { padding: spacing.lg }, style]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.flexGrow}>{content}</ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexGrow: { flexGrow: 1 },
  content: { flex: 1 },
});
