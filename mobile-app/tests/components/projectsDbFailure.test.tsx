/**
 * Test K (M12.3 §13): a DbDriver that fails to open gives a visible
 * "Local storage unavailable" state, not a crash.
 */
import { QueryClient } from "@tanstack/react-query";
import React from "react";
import { act, create } from "react-test-renderer";

// Production's openDatabase.native.ts wraps every open failure in DbOpenError.
jest.mock("../../database/openDatabase", () => {
  const { DbOpenError } = jest.requireActual("../../database/DbDriver");
  return { openProjectsDb: jest.fn(() => Promise.reject(new DbOpenError(new Error("disk write failed")))) };
});

import ProjectsScreen from "../../app/(tabs)/projects";
import { AppProviders } from "../../providers/AppProviders";

describe("Projects screen — K. DB open failure is visible, not a crash", () => {
  let tree: ReturnType<typeof create> | undefined;

  afterEach(() => {
    act(() => {
      tree?.unmount();
    });
    tree = undefined;
  });

  it("renders an error state with Retry instead of crashing when the DB fails to open", async () => {
    // retry: 0 so the failing query settles on the first attempt — a real
    // retry backoff would leave a ~1s timer running past this test's own
    // teardown, which is exactly the "worker failed to exit gracefully"
    // warning this phase's acceptance criteria call out to fix.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });

    expect(() => {
      act(() => {
        tree = create(
          <AppProviders queryClient={queryClient}>
            <ProjectsScreen />
          </AppProviders>
        );
      });
    }).not.toThrow();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const asString = JSON.stringify(tree!.toJSON());
    expect(asString).toContain("Local storage unavailable");
    expect(asString).toContain("Retry");

    queryClient.clear();
  });
});
