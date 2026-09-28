// react-native-safe-area-context's real native provider never fires its
// onInsetsChange event in the Jest/react-test-renderer environment, so
// anything wrapped in a real <SafeAreaProvider> renders with no children
// at all under test. The package ships its own documented mock for
// exactly this (react-native-safe-area-context/jest/mock) — this file
// wires it in globally so component tests actually render.
// https://github.com/th3rdwave/react-native-safe-area-context#testing
jest.mock("react-native-safe-area-context", () => require("react-native-safe-area-context/jest/mock").default);

// expo-crypto's native module isn't linked under Jest, so Crypto.randomUUID()
// silently returns undefined (no throw) rather than a real UUID — which
// broke ProjectsRepository.createDraft's id column under test (M12.3).
// Node has had a built-in, spec-compliant crypto.randomUUID() since 14.17,
// so this mock is a real UUID generator, not a fake placeholder.
jest.mock("expo-crypto", () => ({
  randomUUID: () => require("node:crypto").randomUUID(),
}));

// expo-secure-store has no native module under Jest; an in-memory map keeps
// the same async API so auth/tokenStore.native.ts runs unchanged.
jest.mock("expo-secure-store", () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    setItemAsync: jest.fn(async (k, v) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k) => void store.delete(k)),
  };
});

// NetInfo ships an official Jest mock.
jest.mock("@react-native-community/netinfo", () => require("@react-native-community/netinfo/jest/netinfo-mock.js"));

// The WebView is a native component; tests only need it to render and accept a ref.
jest.mock("react-native-webview", () => {
  const React = require("react");
  const { View } = require("react-native");
  const WebView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: jest.fn() }));
    return React.createElement(View, { testID: "webview", accessibilityLabel: props.accessibilityLabel });
  });
  return { WebView, default: WebView };
});

// expo-notifications: records scheduled notifications; permission defaults to granted.
jest.mock("expo-notifications", () => {
  const scheduled = [];
  let permission = "granted";
  return {
    __scheduled: scheduled,
    __setPermission: (p) => {
      permission = p;
    },
    AndroidImportance: { DEFAULT: 3 },
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn(async () => null),
    getPermissionsAsync: jest.fn(async () => ({ status: permission })),
    requestPermissionsAsync: jest.fn(async () => ({ status: permission })),
    scheduleNotificationAsync: jest.fn(async (req) => {
      scheduled.push(req);
      return String(scheduled.length);
    }),
    addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  };
});

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-file-system", () => {
  const files = new Map();
  class File {
    constructor(dir, name) {
      this.uri = `file:///cache/${name}`;
    }
    get exists() {
      return files.has(this.uri);
    }
    create() {
      files.set(this.uri, "");
    }
    delete() {
      files.delete(this.uri);
    }
    write(text) {
      files.set(this.uri, text);
    }
    textSync() {
      return files.get(this.uri);
    }
  }
  return { File, Paths: { cache: "cache" }, __files: files };
});
