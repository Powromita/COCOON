/**
 * Expo app configuration.
 *
 * Android package / iOS bundle id: "com.bytefiesta.cocoon" is the team
 * identifier in use. To build under another id without editing this file,
 * set COCOON_ANDROID_PACKAGE (and COCOON_IOS_BUNDLE_ID) in the build
 * environment — e.g. as an EAS environment variable. Changing the id after
 * a release creates a different app on the device/store.
 */
import type { ExpoConfig } from "expo/config";

const ANDROID_PACKAGE = process.env.COCOON_ANDROID_PACKAGE ?? "com.bytefiesta.cocoon";
const IOS_BUNDLE_ID = process.env.COCOON_IOS_BUNDLE_ID ?? ANDROID_PACKAGE;

const config: ExpoConfig = {
  name: "COCOON",
  slug: "cocoon-mobile",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "cocoon",
  // The COCOON mobile UI is a white/light engineering interface by design.
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: true,
    bundleIdentifier: IOS_BUNDLE_ID,
  },
  android: {
    package: ANDROID_PACKAGE,
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: "#FFFFFF",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    permissions: ["INTERNET", "ACCESS_NETWORK_STATE", "POST_NOTIFICATIONS"],
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.CAMERA",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.SYSTEM_ALERT_WINDOW",
    ],
    softwareKeyboardLayoutMode: "resize",
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-sqlite",
    "expo-secure-store",
    "expo-font",
    "expo-sharing",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 180,
        resizeMode: "contain",
        backgroundColor: "#FFFFFF",
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/android-icon-monochrome.png",
        color: "#00236F",
      },
    ],
  ],
};

export default config;
