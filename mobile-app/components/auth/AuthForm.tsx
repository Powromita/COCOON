/**
 * Shared scaffold for the auth screens with demo fast-fills, session persistence toggle,
 * Zod validation, and token handling.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import React, { useState } from "react";
import { Controller, useForm, type FieldValues, type Path } from "react-hook-form";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { z } from "zod";

import { useT } from "../../i18n";
import { authService } from "../../services/registry";
import { useTheme } from "../../theme";
import { ErrorView } from "../common/ErrorView";
import { InfoBanner } from "../common/InfoBanner";
import { PrimaryButton } from "../common/PrimaryButton";
import { SwitchField } from "../common/SwitchField";
import { TextField } from "../common/TextField";

export interface DemoProfile {
  label: string;
  role: string;
  email: string;
  password?: string;
}

export interface AuthField<T extends FieldValues> {
  name: Path<T>;
  label: string;
  secure?: boolean;
  placeholder?: string;
}

interface AuthFormProps<T extends FieldValues> {
  title: string;
  intro: string;
  schema: z.ZodType<T>;
  fields: AuthField<T>[];
  submitLabel: string;
  onSubmit: (values: T) => Promise<unknown>;
  successMessage?: string;
  links: { href: "/(auth)/login" | "/(auth)/register" | "/(auth)/forgot-password" | "/(auth)/reset-password"; label: string }[];
  demoProfiles?: DemoProfile[];
}

export function AuthForm<T extends FieldValues>({
  title,
  intro,
  schema,
  fields,
  submitLabel,
  onSubmit,
  successMessage,
  links,
  demoProfiles,
}: AuthFormProps<T>) {
  const { colors, radii, spacing, typography } = useTheme();
  const t = useT();
  const [keepActive, setKeepActive] = useState(true);
  const availability = useQuery({ queryKey: ["auth-availability"], queryFn: () => authService.availability() });
  const form = useForm<T>({ resolver: zodResolver(schema as never) as never, mode: "onTouched" });
  const submit = useMutation({ mutationFn: (v: T) => onSubmit(v) });

  const fillProfile = (profile: DemoProfile) => {
    form.setValue("email" as Path<T>, profile.email as never);
    if (profile.password) {
      form.setValue("password" as Path<T>, profile.password as never);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[typography.display, { color: colors.textPrimary }]} accessibilityRole="header">
        {t(title)}
      </Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.md }]}>{intro}</Text>

      {demoProfiles && demoProfiles.length > 0 ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs, fontWeight: "600" }]}>
            FAST-FILL DEMO PROFILES
          </Text>
          <View style={styles.profileRow}>
            {demoProfiles.map((p) => (
              <Pressable
                key={p.email}
                accessibilityRole="button"
                onPress={() => fillProfile(p)}
                style={[
                  styles.profileButton,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    borderRadius: radii.sm,
                    padding: spacing.sm,
                  },
                ]}
              >
                <Text style={[typography.bodyStrong, { color: colors.primary }]}>{p.label}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 11 }]}>{p.role}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {availability.data && !availability.data.available ? (
        <View style={{ marginBottom: spacing.md }}>
          <InfoBanner
            title={t("Demo Environment")}
            message="Auth is running in development mode. Any credentials or fast-fill profile will sign in."
            tone="info"
          />
        </View>
      ) : null}

      {fields.map((f) => (
        <Controller
          key={f.name}
          control={form.control}
          name={f.name}
          render={({ field, fieldState }) => (
            <TextField
              label={f.label}
              required
              value={typeof field.value === "string" ? field.value : ""}
              onChangeText={field.onChange}
              placeholder={f.placeholder}
              autoCapitalize="none"
              secureTextEntry={f.secure}
              error={fieldState.error?.message}
            />
          )}
        />
      ))}

      <View style={{ marginVertical: spacing.xs }}>
        <SwitchField
          label="Keep session active (8h)"
          value={keepActive}
          onChange={setKeepActive}
          helperText="Retains tactical credentials in SecureStore during combat deployment."
        />
      </View>

      {submit.isError ? <ErrorView compact error={submit.error} /> : null}
      {submit.isSuccess && successMessage ? (
        <Text style={[typography.caption, { color: colors.primary, marginBottom: spacing.sm }]}>{successMessage}</Text>
      ) : null}

      <View style={{ marginTop: spacing.md }}>
        <PrimaryButton
          label={submit.isPending ? "Authenticating…" : submitLabel}
          onPress={form.handleSubmit((v: T) => submit.mutate(v))}
          disabled={submit.isPending}
        />
      </View>

      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        {links.map((l) => (
          <Link key={l.href} href={l.href} replace style={[typography.caption, { color: colors.primary, fontWeight: "600", paddingVertical: spacing.xs }]}>
            {l.label}
          </Link>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  profileRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  profileButton: { borderWidth: 1, minWidth: "30%", flex: 1 },
});
