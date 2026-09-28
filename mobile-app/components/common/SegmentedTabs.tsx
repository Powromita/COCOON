import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { minTouchTarget } from "../../theme/spacing";
import { useTheme } from "../../theme";

export interface TabDef<K extends string> {
  key: K;
  label: string;
}

interface SegmentedTabsProps<K extends string> {
  tabs: TabDef<K>[];
  active: K;
  onChange: (key: K) => void;
}

/** Horizontally scrollable tab strip — fits seven result tabs on a small Android screen. */
export function SegmentedTabs<K extends string>({ tabs, active, onChange }: SegmentedTabsProps<K>) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={[styles.wrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist">
        {tabs.map((tab) => {
          const selected = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(tab.key)}
              style={[
                styles.tab,
                {
                  paddingHorizontal: spacing.md,
                  borderBottomColor: selected ? colors.accent : "transparent",
                  minHeight: minTouchTarget,
                },
              ]}
            >
              <Text style={[typography.bodyStrong, { color: selected ? colors.textPrimary : colors.textSecondary }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { justifyContent: "center", borderBottomWidth: 3 },
});
