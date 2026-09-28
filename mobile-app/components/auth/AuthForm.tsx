/**
 * Shared scaffold for the auth screens. Shows the service's real
 * availability first, validates input with Zod, and submits through the
 * AuthService — which today reports "not_supported". A token is written to
 * SecureStore only when a real backend returns one; nothing is faked.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import React from "react";
import { Controller, useForm, type FieldValues, type Path } from "react-hook-form";
import { ScrollView, Text, View } from "react-native";
import type { z } from "zod";

import { useT } from "../../i18n";
import { authService } from "../../services/registry";
import { useTheme } from "../../theme";
import { ErrorView } from "../common/ErrorView";
import { InfoBanner } from "../common/InfoBanner";
import { PrimaryButton } from "../common/PrimaryButton";
import { TextField } from "../common/TextField";

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
}

export function AuthForm<T extends FieldValues>({ title, intro, schema, fields, submitLabel, onSubmit, successMessage, links }: AuthFormProps<T>) {
  const { colors, spacing, typography } = useTheme();
  const t = useT();
  const availability = useQuery({ queryKey: ["auth-availability"], queryFn: () => authService.availability() });
  const form = useForm<T>({ resolver: zodResolver(schema as never) as never, mode: "onTouched" });
  const submit = useMutation({ mutationFn: (v: T) => onSubmit(v) });

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
      <Text style={[typography.display, { color: colors.textPrimary }]} accessibilityRole="header">
        {t(title)}
      </Text>
      <Text style={[typography.body, { color: colors.textBody, marginBottom: spacing.md }]}>{intro}</Text>

      {availability.data && !availability.data.available ? (
        <View style={{ marginBottom: spacing.md }}>
          <InfoBanner title={t("Authentication service unavailable")} message={availability.data.reason} tone="warning" />
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

      {submit.isError ? <ErrorView compact error={submit.error} /> : null}
      {submit.isSuccess && successMessage ? (
        <Text style={[typography.caption, { color: colors.statusReady, marginBottom: spacing.sm }]}>{successMessage}</Text>
      ) : null}
      <PrimaryButton
        label={submit.isPending ? "Submitting…" : submitLabel}
        onPress={form.handleSubmit((v) => submit.mutate(v))}
        disabled={submit.isPending}
      />

      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        {links.map((l) => (
          <Link key={l.href} href={l.href} replace style={[typography.caption, { color: colors.accent, fontWeight: "600", paddingVertical: spacing.xs }]}>
            {l.label}
          </Link>
        ))}
      </View>
      <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.lg }]}>
        COCOON is not connected to any defence identity system. Credentials are never stored on the device; an access token would be kept
        only in secure storage, and only after a real sign-in.
      </Text>
    </ScrollView>
  );
}
