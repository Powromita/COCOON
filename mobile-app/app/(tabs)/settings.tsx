import Constants from "expo-constants";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";
import { ScrollView, Text } from "react-native";

import { AppCard } from "../../components/common/AppCard";
import { KeyValueRow } from "../../components/common/KeyValueRow";
import { SecondaryButton } from "../../components/common/SecondaryButton";
import { SectionHeader } from "../../components/common/SectionHeader";
import { SelectField } from "../../components/common/SelectField";
import { VIEWER_THREE_VERSION } from "../../components/viewer/viewerHtml.generated";
import { getCacheRepository, getMetaRepository } from "../../database";
import { LANGUAGE_KEY, LANGUAGES, useT, type Language } from "../../i18n";
import { getNotificationPermission, requestNotificationPermission } from "../../notifications/jobs";
import { TEMPERATURE_UNIT_KEY } from "../../providers/AppProviders";
import { useAppStore } from "../../store/app.store";
import { useTheme } from "../../theme";
import type { TemperatureUnit } from "../../utils/format";

export default function SettingsScreen() {
  const { colors, spacing, typography } = useTheme();
  const t = useT();
  const unit = useAppStore((s) => s.temperatureUnit);
  const setUnit = useAppStore((s) => s.setTemperatureUnit);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const queryClient = useQueryClient();
  const permission = useQuery({ queryKey: ["settings", "notifications"], queryFn: getNotificationPermission });
  const cacheStats = useQuery({ queryKey: ["settings", "cache"], queryFn: async () => (await getCacheRepository()).stats() });
  const enableNotifications = useMutation({ mutationFn: requestNotificationPermission, onSettled: () => void permission.refetch() });
  const clearCache = useMutation({
    mutationFn: async () => (await getCacheRepository()).clear(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["settings", "cache"] }),
  });

  const changeLanguage = async (value: Language) => {
    setLanguage(value);
    try { await (await getMetaRepository()).set(LANGUAGE_KEY, value); } catch { /* Session preference still applies. */ }
  };
  const changeUnit = async (value: TemperatureUnit) => {
    setUnit(value);
    try { await (await getMetaRepository()).set(TEMPERATURE_UNIT_KEY, value); } catch { /* Session preference still applies. */ }
  };

  const notificationLabel: Record<string, string> = {
    granted: "Allowed", denied: "Turned off", undetermined: "Not enabled", expo_go: "Available in the installed app",
    unsupported: "Unavailable on this device",
  };
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
      <SectionHeader title={t("Language")} />
      <SelectField<Language> label={t("Language")} value={language} onChange={(value) => void changeLanguage(value)} options={LANGUAGES.map((item) => ({ value: item.code, label: item.label }))} />

      <SectionHeader title={t("Units")} />
      <SelectField<TemperatureUnit>
        label="Temperature"
        value={unit}
        onChange={(value) => void changeUnit(value)}
        options={[{ value: "C", label: "Celsius (°C)" }, { value: "F", label: "Fahrenheit (°F)" }]}
      />
      <Text style={[typography.caption, { color: colors.textSecondary, marginTop: -spacing.sm }]}>Other engineering values use SI units.</Text>

      <SectionHeader title={t("Notifications")} />
      <AppCard>
        <KeyValueRow label="Design run updates" value={notificationLabel[permission.data ?? ""] ?? "—"} last />
      </AppCard>
      {permission.data === "undetermined" ? (
        <SecondaryButton label={enableNotifications.isPending ? "Enabling…" : "Enable notifications"} onPress={() => enableNotifications.mutate()} disabled={enableNotifications.isPending} />
      ) : null}

      <SectionHeader title="Saved on this device" />
      <AppCard>
        <KeyValueRow label="Cached results" value={cacheStats.data ? String(cacheStats.data.entries) : "—"} last />
      </AppCard>
      <SecondaryButton label={clearCache.isPending ? "Clearing…" : "Clear cached results"} onPress={() => clearCache.mutate()} disabled={clearCache.isPending} />

      <SectionHeader title="About" />
      <AppCard>
        <KeyValueRow label="App version" value={Constants.expoConfig?.version ?? "—"} />
        <KeyValueRow label="Thermal calculation" value="COCOON RC model" />
        <KeyValueRow label="3D viewer" value={`three.js ${VIEWER_THREE_VERSION}`} last />
      </AppCard>
    </ScrollView>
  );
}
