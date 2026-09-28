import React from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * The root-level fallback rendered by expo-router's file-based
 * `export const ErrorBoundary` convention in app/_layout.tsx (see
 * node_modules/expo-router/build/views/Try.js — it's a real
 * getDerivedStateFromError class component, so this genuinely IS a React
 * error boundary, not a best-effort try/catch).
 *
 * This sits OUTSIDE AppProviders (ThemeProvider, QueryClientProvider,
 * SafeAreaProvider), because it exists specifically to catch failures
 * IN those providers too — so it deliberately does NOT call useTheme()
 * or rely on any of our own providers, and uses SafeAreaView directly
 * rather than our themed ScreenContainer. It also does not have access
 * to React's componentStack (expo-router's Try only forwards `error`
 * and `retry`), so it shows the error's own JS stack trace instead.
 *
 * components/common/ErrorBoundary.tsx is the OTHER, inner boundary
 * (wraps children inside AppProviders, has full componentDidCatch
 * componentStack) — the two are complementary defense-in-depth, not
 * duplicates: this one is the last resort if AppProviders itself fails.
 */
export function RootErrorFallback({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>COCOON hit a startup error</Text>
        <Text style={styles.message}>{error.message}</Text>

        <Pressable accessibilityRole="button" onPress={retry} style={styles.button}>
          <Text style={styles.buttonText}>Retry</Text>
        </Pressable>

        {error.stack ? (
          <>
            <Text style={styles.stackLabel}>STACK TRACE</Text>
            <Text style={styles.stack}>{error.stack}</Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// Deliberately plain, hardcoded styling — no theme dependency (see doc comment above).
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F6DEDB" },
  content: { padding: 20 },
  title: { fontSize: 20, fontWeight: "700", color: "#5A1C15", marginBottom: 8 },
  message: { fontSize: 15, color: "#5A1C15", marginBottom: 16 },
  button: {
    backgroundColor: "#B3372B",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    marginBottom: 20,
    minHeight: 48,
    justifyContent: "center",
  },
  buttonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  stackLabel: { fontSize: 11, fontWeight: "700", color: "#7A2E24", marginBottom: 4 },
  stack: { fontSize: 11, color: "#7A2E24", fontFamily: "monospace" },
});
