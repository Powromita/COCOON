import { Tabs, useRouter } from "expo-router";
import React from "react";
import { Text, View, type ColorValue } from "react-native";

import { AppHeader } from "../../components/layout/AppHeader";
import { useT } from "../../i18n";
import { useTheme } from "../../theme";

/** Text glyph tab icons — no icon font dependency, and always shown with a label. */
function TabGlyph({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 18, fontWeight: "700" }}>{glyph}</Text>;
}

/**
 * Main navigation: Home · Projects · New shelter · Reports · Settings.
 * Candidates and Results are reached from a project or a run, so they keep
 * their project/run context. "New" is an action tab: it opens the New
 * Shelter flow rather than showing a screen of its own.
 */
export default function TabsLayout() {
  const { colors, typography } = useTheme();
  const t = useT();
  const router = useRouter();

  return (
    <Tabs
      screenLayout={({ children }) => (
        <View style={{ flex: 1 }}>
          {children}
        </View>
      )}
      screenOptions={{
        header: ({ options }) => <AppHeader title={typeof options.title === "string" ? options.title : ""} />,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, minHeight: 60 },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontFamily: typography.label.fontFamily, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("Home"), tabBarIcon: ({ color }) => <TabGlyph glyph="⌂" color={color} /> }} />
      <Tabs.Screen name="projects" options={{ title: t("Projects"), tabBarIcon: ({ color }) => <TabGlyph glyph="▤" color={color} /> }} />
      <Tabs.Screen
        name="new"
        options={{
          title: t("New shelter"),
          tabBarAccessibilityLabel: t("New shelter"),
          tabBarIcon: ({ color }) => <TabGlyph glyph="＋" color={color} />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push("/project/new");
          },
        }}
      />
      <Tabs.Screen name="reports" options={{ title: t("Reports"), tabBarIcon: ({ color }) => <TabGlyph glyph="≣" color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: t("Settings"), tabBarIcon: ({ color }) => <TabGlyph glyph="⚙" color={color} /> }} />
    </Tabs>
  );
}
