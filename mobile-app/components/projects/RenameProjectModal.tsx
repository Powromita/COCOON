import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useRenameProject } from "../../hooks/useProjects";
import { useTheme } from "../../theme";
import { PrimaryButton } from "../common/PrimaryButton";
import { SecondaryButton } from "../common/SecondaryButton";
import { TextField } from "../common/TextField";

interface RenameProjectModalProps {
  visible: boolean;
  projectId: string;
  initialName: string;
  onClose: () => void;
}

export function RenameProjectModal({ visible, projectId, initialName, onClose }: RenameProjectModalProps) {
  const { colors, radii, spacing, typography } = useTheme();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const renameMutation = useRenameProject(projectId);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Project name cannot be empty.");
      return;
    }
    setError(null);
    try {
      await renameMutation.mutateAsync(trimmed);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Could not rename project.");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, padding: spacing.lg },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[typography.title, { color: colors.textPrimary, marginBottom: spacing.sm }]}>
            Rename Shelter Design
          </Text>
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>
            Update the tactical identifier saved on this device.
          </Text>

          <TextField
            label="Shelter Name"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (error) setError(null);
            }}
            placeholder="e.g. Siachen North Ridge Post"
            error={error ?? undefined}
          />

          <View style={styles.actions}>
            <View style={styles.half}>
              <SecondaryButton label="Cancel" onPress={onClose} />
            </View>
            <View style={styles.half}>
              <PrimaryButton label={renameMutation.isPending ? "Saving…" : "Save Name"} onPress={() => void handleSave()} disabled={renameMutation.isPending} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  sheet: { width: "100%", maxWidth: 440, borderWidth: 1 },
  actions: { flexDirection: "row", gap: 12, marginTop: 16 },
  half: { flex: 1 },
});
