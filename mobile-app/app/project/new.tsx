import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { AppCard } from "../../components/common/AppCard";
import { ErrorView } from "../../components/common/ErrorView";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { SectionHeader } from "../../components/common/SectionHeader";
import { SelectField } from "../../components/common/SelectField";
import { Tag } from "../../components/common/Tag";
import { TextField } from "../../components/common/TextField";
import { useCreateDraft } from "../../hooks/useProjects";
import { useTheme } from "../../theme";
import { SAMPLE_TEMPLATE_LABEL, sampleRequirementsDraft } from "../../validation/templates";

type StartFrom = "blank" | "sample";

export default function NewProjectScreen() {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const createDraft = useCreateDraft();
  const [name, setName] = useState("");
  const [startFrom, setStartFrom] = useState<StartFrom>("blank");

  const handleCreate = async () => {
    try {
      const project = await createDraft.mutateAsync({
        name,
        requirements: startFrom === "sample" ? sampleRequirementsDraft() : undefined,
      });
      router.replace({ pathname: "/project/[id]/edit", params: { id: project.id, step: "0" } });
    } catch {
      // Shown below via createDraft.error.
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
        A project holds one shelter’s requirements and the designs generated for it. It is saved on this device.
      </Text>

      <TextField label="Project name" required value={name} onChangeText={setName} placeholder="e.g. Forward post shelter" maxLength={80} />

      <SectionHeader title="Shelter mode" />
      <AppCard emphasis="accent">
        <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>New shelter</Text>
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
          Describe the mission; the backend generates and ranks candidate layouts.
        </Text>
      </AppCard>
      <AppCard>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Text style={[typography.bodyStrong, { color: colors.textSecondary, flex: 1 }]}>Existing shelter</Text>
          <Tag label="Coming soon" />
        </View>
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
          Assessing a shelter you already have is not available in the mobile app yet.
        </Text>
      </AppCard>

      <SelectField<StartFrom>
        label="Start from"
        value={startFrom}
        onChange={setStartFrom}
        options={[
          { value: "blank", label: "Empty requirements" },
          { value: "sample", label: SAMPLE_TEMPLATE_LABEL },
        ]}
      />
      {startFrom === "sample" ? (
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: -spacing.sm, marginBottom: spacing.lg }]}>
          Prefills the wizard with the example requirements published in the M0 contracts package. Every value stays editable.
        </Text>
      ) : null}

      {createDraft.isError ? <ErrorView error={createDraft.error} title="Could not create the project" /> : null}

      <PrimaryButton
        label={createDraft.isPending ? "Creating…" : "Create and continue"}
        onPress={() => void handleCreate()}
        disabled={createDraft.isPending || name.trim().length === 0}
      />
    </ScrollView>
  );
}
