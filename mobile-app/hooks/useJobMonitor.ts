/**
 * Foreground job monitor. While the app is active it re-reads every run the
 * device knows is still queued/running (run_index) from the backend, mirrors
 * the backend's status onto the local project, and raises one notification
 * when a run completes or fails. It stops polling when nothing is active and
 * while the app is in the background, and checks immediately on resume.
 *
 * Tapping a notification opens that run's generation screen.
 */
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";

import { DATA_PROVIDER, IS_FIXTURE_MODE } from "../constants/env";
import { getProjectsRepository, getRunsRepository } from "../database";
import { installForegroundHandler, notifyJobFinished, onNotificationTap } from "../notifications/jobs";
import { generationService } from "../services/registry";
import { useAppStore } from "../store/app.store";

export const MONITOR_INTERVAL_MS = 5_000;
const MONITOR_ERROR_MESSAGE = "Unable to refresh one or more design runs. Retrying while the app is open.";

function reportMonitorError(error: unknown, jobId?: string): void {
  useAppStore.getState().setJobMonitorError(MONITOR_ERROR_MESSAGE);
  if (__DEV__) {
    console.warn("[job-monitor] Failed to refresh active run", jobId ?? "(run list)", error);
  }
}

/** One monitoring pass. Exported for tests. Returns the number of runs still active. */
export async function checkActiveRuns(): Promise<number> {
  const runs = await getRunsRepository();
  let active;
  try {
    active = await runs.listActive(DATA_PROVIDER);
  } catch (error) {
    reportMonitorError(error);
    return 1;
  }
  let stillActive = 0;
  let hasErrors = false;
  for (const run of active) {
    try {
      const job = await generationService.getGenerationJob(run.jobId);
      await runs.updateStatus(run.jobId, job.status);
      if (run.projectId) {
        await (await getProjectsRepository()).recordRunStatus(run.projectId, job.status, {
          recommendedDesignId: job.recommendedDesignId,
          error: job.error?.message ?? null,
        });
      }
      if (job.status === "completed" || job.status === "failed") {
        await notifyJobFinished({ jobId: run.jobId, projectId: run.projectId, status: job.status, demo: IS_FIXTURE_MODE });
      } else {
        stillActive += 1;
      }
    } catch (error) {
      reportMonitorError(error, run.jobId);
      hasErrors = true;
      stillActive += 1;
    }
  }
  if (!hasErrors) useAppStore.getState().setJobMonitorError(null);
  return stillActive;
}

export function useJobMonitor(): void {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    installForegroundHandler();
    let cancelled = false;

    const schedule = (delay: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(tick, delay);
    };
    const tick = async () => {
      if (cancelled || AppState.currentState !== "active") return;
      let active: number;
      try {
        active = await checkActiveRuns();
      } catch (error) {
        reportMonitorError(error);
        active = 1;
      }
      // Keep polling only while something is running; a new run restarts the loop (see kickJobMonitor).
      if (!cancelled && active > 0) schedule(MONITOR_INTERVAL_MS);
    };
    kick = () => schedule(0);

    const appState = AppState.addEventListener("change", (s) => {
      if (s === "active") schedule(0);
      else if (timer.current) clearTimeout(timer.current);
    });
    const removeTap = onNotificationTap((data) => {
      if (data?.jobId) router.push({ pathname: "/generation/[jobId]", params: { jobId: data.jobId, projectId: data.projectId ?? "" } });
    });

    schedule(0);
    return () => {
      cancelled = true;
      kick = () => undefined;
      if (timer.current) clearTimeout(timer.current);
      appState.remove();
      removeTap();
    };
  }, [router]);
}

let kick: () => void = () => undefined;

/** Restarts monitoring right away — called after a new run is submitted. */
export function kickJobMonitor(): void {
  kick();
}
