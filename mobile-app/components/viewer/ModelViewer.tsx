import type { VisualizationModel } from "@cocoon/contracts";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { useTheme } from "../../theme";
import { parseViewerMessage, toInjection, type ViewerState } from "./protocol";
import { VIEWER_HTML } from "./viewerHtml.generated";

interface ModelViewerProps {
  model: VisualizationModel;
  state: ViewerState;
  onRoomSelected: (zoneId: string | null) => void;
  onError: (message: string) => void;
}

/**
 * Hosts viewer/viewer.js in a WebView. The HTML is loaded once; model and
 * view-state changes are pushed in with injectJavaScript, so toggling a
 * control never reloads the WebView.
 */
export function ModelViewer({ model, state, onRoomSelected, onError }: ModelViewerProps) {
  const { colors, typography } = useTheme();
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  // The model most recently sent to the viewer, and the one it has confirmed drawing.
  const sentModel = useRef<VisualizationModel | null>(null);
  const [loadedModel, setLoadedModel] = useState<VisualizationModel | null>(null);
  const loaded = loadedModel === model;

  useEffect(() => {
    if (!ready) return;
    sentModel.current = model;
    ref.current?.injectJavaScript(toInjection({ type: "LOAD_MODEL", model }));
  }, [ready, model]);

  useEffect(() => {
    if (ready) ref.current?.injectJavaScript(toInjection({ type: "SET_STATE", ...state }));
  }, [ready, loaded, state]);

  const onMessage = (e: WebViewMessageEvent) => {
    const msg = parseViewerMessage(e.nativeEvent.data);
    if (!msg) return;
    if (msg.type === "READY") setReady(true);
    else if (msg.type === "MODEL_LOADED") setLoadedModel(sentModel.current);
    else if (msg.type === "ROOM_SELECTED") onRoomSelected(msg.zoneId);
    else if (msg.type === "ERROR") onError(msg.message);
  };

  return (
    <View style={[styles.wrap, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
      <WebView
        ref={ref}
        originWhitelist={["*"]}
        // The page is inline HTML; it never navigates anywhere else.
        onShouldStartLoadWithRequest={(req) => req.url.startsWith("about:") || req.url.startsWith("data:")}
        source={{ html: VIEWER_HTML }}
        onMessage={onMessage}
        javaScriptEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        allowFileAccess={false}
        style={styles.web}
        onError={(e) => onError(e.nativeEvent.description)}
        accessibilityLabel="3D model of the shelter. Drag to rotate, pinch to zoom, tap a room to select it."
      />
      {!loaded ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color={colors.accent} />
          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 6 }]}>Preparing 3D view…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderWidth: 1, borderRadius: 6, overflow: "hidden", minHeight: 260 },
  web: { flex: 1, backgroundColor: "transparent" },
  overlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
});
