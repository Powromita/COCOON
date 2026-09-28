import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface UseAutosaveResult<T> {
  /** Call on every edit — coalesces rapid edits into one write ~debounceMs later. */
  scheduleSave: (data: T) => void;
  /** Immediately writes the latest pending data, if any. Safe to call with nothing pending (no-op). */
  flush: () => Promise<void>;
  status: SaveStatus;
  lastSavedAt: string | null;
}

/**
 * Generic debounced-autosave hook. Flushes immediately (not just on the
 * debounce timer) on AppState -> background/inactive and on unmount, so
 * a rapid edit followed immediately by backgrounding is never lost — the
 * caller is additionally responsible for calling `flush()` on step
 * change and on the Android hardware back button, since those aren't
 * generic browser/AppState events this hook can observe on its own.
 */
export function useAutosave<T>(save: (data: T) => Promise<void>, debounceMs = 500): UseAutosaveResult<T> {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const pendingRef = useRef<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current === null) return;
    const data = pendingRef.current;
    pendingRef.current = null;
    setStatus("saving");
    try {
      await saveRef.current(data);
      setStatus("saved");
      setLastSavedAt(new Date().toISOString());
    } catch {
      setStatus("error");
      // Put it back so a later flush() (e.g. the user tapping Retry) can try again.
      pendingRef.current = data;
    }
  }, []);

  const scheduleSave = useCallback(
    (data: T) => {
      pendingRef.current = data;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void flush();
      }, debounceMs);
    },
    [debounceMs, flush]
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background" || nextState === "inactive") {
        void flush();
      }
    });
    return () => subscription.remove();
  }, [flush]);

  useEffect(() => {
    return () => {
      void flush();
    };
    // Intentionally empty deps: this must run exactly once, on unmount, flushing whatever is pending at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { scheduleSave, flush, status, lastSavedAt };
}
