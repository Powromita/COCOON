/**
 * Job-completion notifications.
 *
 *   optimization starts → recorded in run_index
 *        ↓
 *   job monitor (hooks/useJobMonitor.ts) re-reads active runs from the backend
 *   while the app is open, and immediately when it returns to the foreground
 *        ↓
 *   backend reports completed / failed
 *        ↓
 *   one local notification per run and terminal status
 *
 * Duplicate prevention: RunsRepository.claimNotification() atomically records
 * the status in SQLite and returns true only once. A result the user already
 * saw on the generation screen is claimed there, so it never notifies too.
 *
 * Availability: expo-notifications is loaded lazily (notifications/module.ts)
 * because it is not part of Expo Go on Android since SDK 53. In Expo Go the
 * app works normally and simply shows no notifications; they work in a
 * development build or an APK.
 *
 * Limitation (documented, not hidden): there is no background polling while
 * the app is closed. Expo's background tasks on Android run at most every
 * ~15 minutes and are not guaranteed, so a run that finishes while the app is
 * closed is announced when the app is next opened.
 */
import { Platform } from "react-native";

import { getRunsRepository } from "../database";
import { getNotificationsModule, IS_EXPO_GO } from "./module";

export const JOB_CHANNEL_ID = "cocoon-jobs";

export type NotificationPermission = "granted" | "denied" | "undetermined" | "unsupported" | "expo_go";

let handlerInstalled = false;

/** Shows notifications while the app is in the foreground too (banner + list). */
export function installForegroundHandler(): void {
  const Notifications = getNotificationsModule();
  if (handlerInstalled || !Notifications) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function ensureChannel(): Promise<void> {
  const Notifications = getNotificationsModule();
  if (!Notifications || Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(JOB_CHANNEL_ID, {
    name: "COCOON jobs",
    description: "Design generation finished or failed",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  const Notifications = getNotificationsModule();
  if (!Notifications) return IS_EXPO_GO ? "expo_go" : "unsupported";
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
  } catch {
    return "unsupported";
  }
}

/** Asks once; a user who denied must enable notifications in system settings. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  const current = await getNotificationPermission();
  if (current !== "undetermined") return current;
  const Notifications = getNotificationsModule();
  if (!Notifications) return current;
  try {
    await ensureChannel();
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted" ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}

export interface JobNotice {
  jobId: string;
  projectId: string | null;
  status: "completed" | "failed";
  demo: boolean;
}

export function noticeContent(notice: JobNotice): { title: string; body: string } {
  const suffix = notice.demo ? " (demo data)" : "";
  return notice.status === "completed"
    ? { title: `COCOON design generation complete${suffix}`, body: `Run ${notice.jobId} finished. Tap to view candidates.` }
    : { title: `COCOON design generation failed${suffix}`, body: `Run ${notice.jobId} failed. Tap for the reason.` };
}

/**
 * Notifies at most once per run and terminal status. Returns whether a
 * notification was shown. Without permission (or without the notifications
 * module, e.g. in Expo Go) nothing is shown, but the status is still claimed
 * so it isn't announced later out of context.
 */
export async function notifyJobFinished(notice: JobNotice): Promise<boolean> {
  const runs = await getRunsRepository();
  const first = await runs.claimNotification(notice.jobId, notice.status);
  if (!first) return false;
  const Notifications = getNotificationsModule();
  if (!Notifications) return false;
  if ((await getNotificationPermission()) !== "granted") return false;
  await ensureChannel();
  const { title, body } = noticeContent(notice);
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { jobId: notice.jobId, projectId: notice.projectId ?? "" } },
    trigger: Platform.OS === "android" ? { channelId: JOB_CHANNEL_ID } : null,
  });
  return true;
}

/** Called when the user sees a terminal status on screen — suppresses the notification. */
export async function markJobStatusSeen(jobId: string, status: "completed" | "failed"): Promise<void> {
  await (await getRunsRepository()).claimNotification(jobId, status);
}

/** Subscribes to notification taps; a no-op where notifications are unavailable. */
export function onNotificationTap(handler: (data: { jobId?: string; projectId?: string }) => void): () => void {
  const Notifications = getNotificationsModule();
  if (!Notifications) return () => undefined;
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    handler(response.notification.request.content.data as { jobId?: string; projectId?: string });
  });
  return () => sub.remove();
}
