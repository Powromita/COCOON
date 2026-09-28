/**
 * Lazy access to expo-notifications.
 *
 * Since SDK 53, Expo Go on Android does not include expo-notifications: merely
 * importing the package there throws ("Android Push notifications … was
 * removed from Expo Go"). So the module is never imported at load time —
 * only here, on demand, and only outside Expo Go and web. Everywhere else
 * gets `null` and reports notifications as unavailable instead of crashing.
 *
 * In a development build or an APK (EAS) the module loads normally.
 */
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

type NotificationsModule = typeof import("expo-notifications");

/** True when running inside the Expo Go app (not a development build or APK). */
export const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let cached: NotificationsModule | null | undefined;

export function getNotificationsModule(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (IS_EXPO_GO || Platform.OS === "web") {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("expo-notifications") as NotificationsModule;
  } catch {
    cached = null;
  }
  return cached;
}
