/**
 * 3D tab. Gets the design's M0 VisualizationModel (backend endpoint, or —
 * where the backend has none — assembled verbatim from the BuildingModel
 * and timeseries, labelled as such), validates it, and hands it to the
 * WebView viewer. Thermal playback steps through the model's own
 * temperature_series; nothing is interpolated.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";

import { findZone, materialsForZone } from "../../adapters/building";
import { comfortLabel, zoneResults } from "../../adapters/simulation";
import { checkVisualizationModel, floorLevels } from "../../adapters/visualization";
import { useVisualization } from "../../hooks/useCocoon";
import { useAppStore } from "../../store/app.store";
import { useTheme } from "../../theme";
import { minTouchTarget } from "../../theme/spacing";
import { formatNumber, formatTemperature, formatTimestamp, humanize } from "../../utils/format";
import { ErrorView } from "../common/ErrorView";
import { LoadingState } from "../common/LoadingState";
import { Tag } from "../common/Tag";
import { ModelViewer } from "../viewer/ModelViewer";
import { playbackTimestamps, temperatureAt, temperatureRange, THERMAL_SCALE, type ViewerState } from "../viewer/protocol";
import type { ResultsContext } from "./ResultsContext";

const PLAY_STEP_MS = 400;

function Toggle({ label, on, onPress, disabled }: { label: string; on: boolean; onPress: () => void; disabled?: boolean }) {
  const { colors, radii, spacing, typography } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: Boolean(disabled) }}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.toggle,
        {
          borderColor: on ? colors.accent : colors.border,
          backgroundColor: on ? colors.surfaceAlt : colors.surface,
          borderRadius: radii.sm,
          paddingHorizontal: spacing.md,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <Text style={[typography.caption, { color: colors.textPrimary, fontWeight: "600" }]}>{label}</Text>
    </Pressable>
  );
}

export function ViewerTab({ ctx }: { ctx: ResultsContext }) {
  const { colors, spacing, typography } = useTheme();
  const unit = useAppStore((s) => s.temperatureUnit);
  const viz = useVisualization(ctx.building, ctx.timeseries.data?.data);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [state, setState] = useState<Omit<ViewerState, "range">>({
    floor: null,
    isolate: null,
    exploded: false,
    showRoof: false,
    mode: "material",
    timeIndex: 0,
  });
  const [playing, setPlaying] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);

  const model = viz.data?.model;
  const check = useMemo(() => (model ? checkVisualizationModel(model) : null), [model]);
  const times = useMemo(() => (model ? playbackTimestamps(model) : []), [model]);
  const range = useMemo(() => (model ? temperatureRange(model) : null), [model]);
  const floors = useMemo(() => (model ? floorLevels(model) : []), [model]);
  const hasThermal = times.length > 0 && range !== null;
  const viewerState = useMemo<ViewerState>(() => ({ ...state, range }), [state, range]);

  // Playback: one controlled interval, only while playing, cleared on pause/unmount.
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!playing || times.length === 0) return;
    timer.current = setInterval(() => {
      setState((s) => {
        const next = s.timeIndex + 1;
        if (next >= times.length) {
          setPlaying(false);
          return s;
        }
        return { ...s, timeIndex: next };
      });
    }, PLAY_STEP_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [playing, times.length]);

  if (!ctx.building) return <LoadingState label="Loading design…" />;
  if (viz.isError) return <ErrorView error={viz.error} onRetry={() => void viz.refetch()} />;
  if (!viz.data || !model) return <LoadingState label="Preparing visualization model…" />;
  if (check && !check.ok) {
    return <ErrorView error={new Error(`The visualization model is invalid: ${check.problems.join("; ")}`)} title="Cannot display this model" />;
  }

  const sim = ctx.simulation.data?.data;
  const zone = selected ? findZone(ctx.building, selected) : undefined;
  const zoneSim = selected && sim ? zoneResults(sim).find((z) => z.zoneId === selected) : undefined;
  const tAt = selected && hasThermal ? temperatureAt(model, selected, state.timeIndex) : undefined;
  const set = (patch: Partial<Omit<ViewerState, "range">>) => setState((s) => ({ ...s, ...patch }));

  return (
    <View style={styles.flex}>
      <View style={{ flexDirection: "row", gap: spacing.xs, marginBottom: spacing.xs, flexWrap: "wrap" }}>
        {viz.data.origin === "building_geometry" ? (
          <View style={{ gap: 2 }}>
            <Tag label="GEOMETRY-DERIVED VIEW" tone="info" />
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              Drawn from the design’s BuildingModel room geometry — not a backend-generated BIM/STEP/IFC model. Windows are not shown: the
              contract gives no window positions.
            </Text>
          </View>
        ) : (
          <Tag label={`Visualization model ${model.model_id}`} tone="neutral" />
        )}
      </View>

      <ModelViewer model={model} state={viewerState} onRoomSelected={setSelected} onError={setViewerError} />
      {viewerError ? <ErrorView compact error={new Error(viewerError)} title="3D viewer problem" /> : null}

      <ScrollView style={styles.controls} contentContainerStyle={{ paddingTop: spacing.sm }}>
        <View style={styles.row}>
          <Toggle label="All floors" on={state.floor === null} onPress={() => set({ floor: null })} />
          {floors.length > 1
            ? floors.map((f) => <Toggle key={f} label={`Floor ${f}`} on={state.floor === f} onPress={() => set({ floor: f })} />)
            : null}
          <Toggle label="Exploded" on={state.exploded} onPress={() => set({ exploded: !state.exploded })} disabled={floors.length < 2} />
          <Toggle label="Roof" on={state.showRoof} onPress={() => set({ showRoof: !state.showRoof })} />
          <Toggle label="Isolate room" on={Boolean(state.isolate)} disabled={!selected} onPress={() => set({ isolate: state.isolate ? null : selected })} />
          <Toggle label="Thermal" on={state.mode === "thermal"} disabled={!hasThermal} onPress={() => set({ mode: state.mode === "thermal" ? "material" : "thermal" })} />
        </View>

        {state.mode === "thermal" && hasThermal && range ? (
          <View style={{ marginTop: spacing.sm }}>
            <View style={styles.row}>
              <Toggle label={playing ? "Pause" : "Play"} on={playing} onPress={() => setPlaying((p) => !p)} />
              <Text style={[typography.caption, { color: colors.textPrimary, flex: 1 }]} accessibilityLiveRegion="polite">
                {formatTimestamp(times[state.timeIndex])} · step {state.timeIndex + 1}/{times.length}
              </Text>
            </View>
            <Pressable
              accessibilityRole="adjustable"
              accessibilityLabel="Timeline"
              accessibilityValue={{ min: 1, max: times.length, now: state.timeIndex + 1 }}
              accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
              onAccessibilityAction={(e) =>
                set({ timeIndex: Math.max(0, Math.min(times.length - 1, state.timeIndex + (e.nativeEvent.actionName === "increment" ? 1 : -1))) })
              }
              onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
              onPress={(e) => {
                if (trackWidth <= 0) return;
                const f = Math.max(0, Math.min(1, e.nativeEvent.locationX / trackWidth));
                set({ timeIndex: Math.round(f * (times.length - 1)) });
              }}
              style={[styles.track, { minHeight: minTouchTarget }]}
            >
              <View style={[styles.rail, { backgroundColor: colors.surfaceAlt }]}>
                <View style={{ width: `${(state.timeIndex / Math.max(1, times.length - 1)) * 100}%`, height: 6, backgroundColor: colors.accent }} />
              </View>
            </Pressable>
            <View style={styles.row}>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>{formatTemperature(range.min, unit)}</Text>
              <View style={[styles.legendBar, { flex: 1 }]}>
                {THERMAL_SCALE.map((c) => (
                  <View key={c} style={[styles.legendStop, { backgroundColor: c }]} />
                ))}
              </View>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>{formatTemperature(range.max, unit)}</Text>
            </View>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>Room air temperature from the RC simulation, colder → warmer.</Text>
          </View>
        ) : null}

        <View style={{ marginTop: spacing.sm }}>
          {selected ? (
            <View>
              <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{humanize(selected)}</Text>
              {tAt !== undefined ? (
                <Text style={[typography.caption, { color: colors.textPrimary }]}>
                  {formatTemperature(tAt, unit)} at {formatTimestamp(times[state.timeIndex])}
                </Text>
              ) : null}
              {zoneSim ? (
                <Text style={[typography.caption, { color: colors.textPrimary }]}>
                  Mean {formatTemperature(zoneSim.meanC, unit)} · {comfortLabel(zoneSim.unmetHours).label}
                </Text>
              ) : null}
              {zone ? (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  {formatNumber(zone.lengthM, 1)} × {formatNumber(zone.widthM, 1)} × {formatNumber(zone.heightM, 1)} m · floor {zone.floorLevel} ·{" "}
                  {materialsForZone(ctx.building as NonNullable<typeof ctx.building>, selected).join(", ")}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              Drag to rotate · pinch to zoom · two fingers to pan · tap a room for details.
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  controls: { maxHeight: 250 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  toggle: { borderWidth: 1.5, minHeight: 40, justifyContent: "center" },
  track: { justifyContent: "center" },
  rail: { height: 6, borderRadius: 3, overflow: "hidden" },
  legendBar: { flexDirection: "row", height: 10, borderRadius: 2, overflow: "hidden" },
  legendStop: { flex: 1 },
});
