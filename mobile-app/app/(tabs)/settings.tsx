import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";

import { SCHEMA_VERSION } from "@cocoon/contracts";

import { clearAccessToken, readAccessToken } from "../../auth/tokenStore";
import { AppCard } from "../../components/common/AppCard";
import { ErrorView } from "../../components/common/ErrorView";
import { KeyValueRow } from "../../components/common/KeyValueRow";
import { SecondaryButton } from "../../components/common/SecondaryButton";
import { SectionHeader } from "../../components/common/SectionHeader";
import { SelectField } from "../../components/common/SelectField";
import { Tag } from "../../components/common/Tag";
import { SystemStatusCard } from "../../components/status/SystemStatusCard";
import { VIEWER_THREE_VERSION } from "../../components/viewer/viewerHtml.generated";
import { API_URL, APP_ENV, DATA_PROVIDER, IS_FIXTURE_MODE } from "../../constants/env";
import { getCacheRepository, getMetaRepository, getSyncQueueRepository } from "../../database";
import { useCapabilities } from "../../hooks/useCocoon";
import { LANGUAGE_KEY, LANGUAGES, useT, type Language } from "../../i18n";
import { getNotificationPermission, requestNotificationPermission } from "../../notifications/jobs";
import { TEMPERATURE_UNIT_KEY } from "../../providers/AppProviders";
import { useAppStore } from "../../store/app.store";
import { processSyncQueue } from "../../sync/queue";
import { useTheme } from "../../theme";
import type { TemperatureUnit } from "../../utils/format";
import { formatLocalDateTime } from "../../utils/format";

export default function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, spacing, typography } = useTheme();
  const t = useT();
  const unit = useAppStore((s) => s.temperatureUnit);
  const setUnit = useAppStore((s) => s.setTemperatureUnit);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const permission = useQuery({ queryKey: ["settings", "notifications"], queryFn: getNotificationPermission });
  const enableNotifications = useMutation({ mutationFn: requestNotificationPermission, onSettled: () => void permission.refetch() });
  const caps = useCapabilities();

  const cacheStats = useQuery({ queryKey: ["settings", "cache"], queryFn: async () => (await getCacheRepository()).stats() });
  const syncOps = useQuery({ queryKey: ["settings", "sync"], queryFn: async () => (await getSyncQueueRepository()).list() });
  const token = useQuery({ queryKey: ["settings", "token"], queryFn: async () => Boolean(await readAccessToken()) });

  const clearCache = useMutation({
    mutationFn: async () => (await getCacheRepository()).clear(),
    onSuccess: () => {
      void cacheStats.refetch();
      void queryClient.invalidateQueries();
    },
  });
  const runSync = useMutation({ mutationFn: () => processSyncQueue(), onSettled: () => void syncOps.refetch() });
  const signOut = useMutation({ mutationFn: clearAccessToken, onSettled: () => void token.refetch() });

  const changeLanguage = async (l: Language) => {
    setLanguage(l);
    try {
      await (await getMetaRepository()).set(LANGUAGE_KEY, l);
    } catch {
      // The choice still applies for this session.
    }
  };

  const changeUnit = async (u: TemperatureUnit) => {
    setUnit(u);
    try {
      await (await getMetaRepository()).set(TEMPERATURE_UNIT_KEY, u);
    } catch {
      // The choice still applies for this session.
    }
  };

  const authMode = caps.data?.authMode;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
      <SectionHeader title={t("Language")} caption="Interface text only — IDs, units and engineering values are never translated." />
      <SelectField<Language> label={t("Language")} value={language} onChange={(l) => void changeLanguage(l)} options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} />

      <SectionHeader title={t("Units")} caption="Values are stored in SI units; the choice only changes how temperatures are displayed." />
      <SelectField<TemperatureUnit>
        label="Temperature"
        value={unit}
        onChange={(u) => void changeUnit(u)}
        options={[
          { value: "C", label: "Celsius (°C)" },
          { value: "F", label: "Fahrenheit (°F)" },
        ]}
      />
      <Text style={[typography.caption, { color: colors.textSecondary, marginTop: -spacing.sm }]}>
        Lengths, areas, energy and costs are always shown in the contract’s units (m, m², kWh, W, ₹).
      </Text>

      <SectionHeader title="Backend" />
      <AppCard>
        <KeyValueRow label="Data provider" value={IS_FIXTURE_MODE ? "Demo fixtures" : "COCOON API"} />
        <KeyValueRow label="API URL" value={API_URL ?? "Not set"} mono />
        <KeyValueRow label="Environment" value={APP_ENV} last />
      </AppCard>
      <SystemStatusCard />
      <SecondaryButton label="Check again" onPress={() => void caps.refetch()} />

      <SectionHeader title="Offline cache" caption="Last successful backend responses, for viewing results offline." />
      <AppCard>
        <KeyValueRow label="Cached responses" value={cacheStats.data ? String(cacheStats.data.entries) : undefined} />
        <KeyValueRow label="Size" value={cacheStats.data ? `${(cacheStats.data.bytes / 1024).toFixed(0)} KB` : undefined} last />
      </AppCard>
      {clearCache.isError ? <ErrorView compact error={clearCache.error} /> : null}
      <SecondaryButton label={clearCache.isPending ? "Clearing…" : "Clear cached data"} onPress={() => clearCache.mutate()} disabled={clearCache.isPending} />
      <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>Projects and drafts are not affected.</Text>

      <SectionHeader title="Sync queue" />
      <AppCard>
        {(syncOps.data ?? []).length === 0 ? (
          <Text style={[typography.caption, { color: colors.textSecondary }]}>Nothing waiting to sync.</Text>
        ) : (
          syncOps.data?.map((op) => (
            <View key={op.id} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
                <Text style={[typography.bodyStrong, { color: colors.textPrimary, flex: 1 }]}>{op.type}</Text>
                <Tag label={op.permanent ? "Failed — needs attention" : op.status} tone={op.permanent ? "danger" : op.status === "failed" ? "warning" : "neutral"} />
              </View>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>
                {op.attempts} attempt(s) · {formatLocalDateTime(op.updatedAt)}
                {op.lastError ? `\n${op.lastError}` : ""}
              </Text>
            </View>
          ))
        )}
      </AppCard>
      <SecondaryButton label={runSync.isPending ? "Syncing…" : "Sync now"} onPress={() => runSync.mutate()} disabled={runSync.isPending || IS_FIXTURE_MODE} />

      <SectionHeader title={t("Notifications")} caption="Design generation complete / failed." />
      <AppCard>
        <KeyValueRow
          label="Permission"
          value={
            permission.data === "granted"
              ? "Allowed"
              : permission.data === "denied"
                ? "Denied — enable in Android settings"
                : permission.data === "expo_go"
                  ? "Not available in Expo Go — use a development build or the APK"
                  : permission.data === "unsupported"
                  ? "Not supported here"
                  : permission.data === "undetermined"
                    ? "Not asked yet"
                    : undefined
          }
          last
        />
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
          Runs are checked while COCOON is open and whenever it returns to the foreground. A run that finishes while the app is closed is
          announced the next time it is opened — Android does not guarantee background checks.
        </Text>
      </AppCard>
      {permission.data === "undetermined" ? (
        <SecondaryButton label="Enable notifications" onPress={() => enableNotifications.mutate()} disabled={enableNotifications.isPending} />
      ) : null}

      <SectionHeader title={t("Authentication")} />
      <AppCard>
        <KeyValueRow
          label="Backend authentication"
          value={IS_FIXTURE_MODE ? "Not used in demo mode" : authMode === "disabled" ? "Disabled on this backend" : authMode ?? "Unknown"}
        />
        <KeyValueRow label="Signed in" value={token.data ? "Yes" : "No"} last />
      </AppCard>
      {token.data ? (
        <SecondaryButton label="Sign out" onPress={() => signOut.mutate()} />
      ) : (
        <SecondaryButton label={t("Sign in")} onPress={() => router.push("/(auth)/login")} />
      )}

      <SectionHeader title="About" />
      <AppCard>
        <KeyValueRow label="App version" value={Constants.expoConfig?.version ?? "Unknown"} />
        <KeyValueRow label="M0 contract schema" value={SCHEMA_VERSION} />
        <KeyValueRow label="3D viewer" value={`three.js ${VIEWER_THREE_VERSION}`} />
        <KeyValueRow label="Provider" value={DATA_PROVIDER} last />
      </AppCard>
      {APP_ENV === "development" ? <SecondaryButton label="M0 fixture diagnostics (developer)" onPress={() => router.push("/dev/m0")} /> : null}
    </ScrollView>
  );
}
