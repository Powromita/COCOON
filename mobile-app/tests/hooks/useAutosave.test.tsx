/**
 * Test F (M12.3 §13): debounce coalesces rapid edits into one write;
 * step change / AppState background / unmount each flush immediately;
 * no write is lost across a rapid-edit-then-background sequence.
 */
import React from "react";
import { act, create } from "react-test-renderer";
import { AppState } from "react-native";

import { useAutosave } from "../../hooks/useAutosave";

function Harness({ save, onApi }: { save: (data: string) => Promise<void>; onApi: (api: ReturnType<typeof useAutosave<string>>) => void }) {
  const api = useAutosave<string>(save, 500);
  onApi(api);
  return null;
}

/** AppState's RN jest mock doesn't expose a way to fire "change" — spy on
 * addEventListener and capture the listener so the test can invoke it directly. */
function captureAppStateListener(): (state: string) => void {
  let captured: ((state: string) => void) | undefined;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
    captured = listener as (state: string) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  return (state: string) => captured?.(state);
}

describe("useAutosave — F. debounce, flush triggers, no lost writes", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("coalesces rapid edits into a single write after the debounce window", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    let api!: ReturnType<typeof useAutosave<string>>;
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness save={save} onApi={(a) => (api = a)} />);
    });

    act(() => {
      api.scheduleSave("edit 1");
      api.scheduleSave("edit 2");
      api.scheduleSave("edit 3");
    });

    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("edit 3");

    act(() => {
      tree.unmount();
    });
  });

  it("flush() writes immediately without waiting for the debounce timer (simulates step change)", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    let api!: ReturnType<typeof useAutosave<string>>;
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness save={save} onApi={(a) => (api = a)} />);
    });

    act(() => {
      api.scheduleSave("edit before step change");
    });

    await act(async () => {
      await api.flush();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("edit before step change");

    act(() => {
      tree.unmount();
    });
  });

  it("flushes on AppState background/inactive", async () => {
    const fireChange = captureAppStateListener();
    const save = jest.fn().mockResolvedValue(undefined);
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness save={save} onApi={(a) => a.scheduleSave("pending edit")} />);
    });

    await act(async () => {
      fireChange("background");
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledWith("pending edit");

    act(() => {
      tree.unmount();
    });
  });

  it("no write is lost: rapid edit -> flush (step change) -> immediate background", async () => {
    const fireChange = captureAppStateListener();
    const save = jest.fn().mockResolvedValue(undefined);
    let api!: ReturnType<typeof useAutosave<string>>;
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness save={save} onApi={(a) => (api = a)} />);
    });

    act(() => {
      api.scheduleSave("rapid edit");
    });
    await act(async () => {
      await api.flush(); // step change flush
    });
    await act(async () => {
      // Nothing pending now — a background flush right after should be a safe no-op, not a duplicate/garbage write.
      fireChange("background");
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("rapid edit");

    act(() => {
      tree.unmount();
    });
  });

  it("flushes whatever is pending on unmount", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    let api!: ReturnType<typeof useAutosave<string>>;
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness save={save} onApi={(a) => (api = a)} />);
    });

    act(() => {
      api.scheduleSave("edit before unmount");
    });

    await act(async () => {
      tree.unmount();
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledWith("edit before unmount");
  });
});
