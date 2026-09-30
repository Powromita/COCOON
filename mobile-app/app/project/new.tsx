import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";

import { ErrorView } from "../../components/common/ErrorView";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { ScreenContainer } from "../../components/common/ScreenContainer";
import { useCreateDraft } from "../../hooks/useProjects";
import { useTheme } from "../../theme";

export default function NewProjectScreen() {
  const router = useRouter();
  const { spacing, typography, colors } = useTheme();
  const createDraft = useCreateDraft();

  const handleCreate = async () => {
    try {
      const project = await createDraft.mutateAsync({ name: `Shelter design · ${new Date().toISOString().slice(0, 10)}` });
      router.replace({ pathname: "/project/[id]/edit", params: { id: project.id, step: "0" } });
    } catch {
      // The actionable error is rendered below.
    }
  };

  return (
    <ScreenContainer>
      <View>
        <Text accessibilityRole="header" style={[typography.title, { color: colors.textPrimary, marginBottom: spacing.sm }]}>
          New shelter design
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>
          Enter a real deployment location and shelter requirements. COCOON will generate candidate layouts and evaluate them with its RC thermal model.
        </Text>
        {createDraft.isError ? <ErrorView error={createDraft.error} title="Could not start the design" /> : null}
        <PrimaryButton label={createDraft.isPending ? "Starting…" : "Enter requirements"} onPress={() => void handleCreate()} disabled={createDraft.isPending} />
      </View>
    </ScreenContainer>
  );
}
