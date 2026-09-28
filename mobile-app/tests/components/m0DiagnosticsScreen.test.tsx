/**
 * Test D (M12.2.1 §7): the /dev/m0 diagnostics section renders guard
 * results for every fixture (and, incidentally, capability states too).
 */
import React from "react";
import { act, create } from "react-test-renderer";

import M0IntegrationDemoScreen from "../../app/dev/m0";
import { AppProviders } from "../../providers/AppProviders";
import { FIXTURE_DIAGNOSTICS } from "../../mocks/fixtureLoader";

describe("app/dev/m0 — D. fixture guard diagnostics render for every fixture", () => {
  let tree: ReturnType<typeof create> | undefined;

  afterEach(() => {
    // Unmount so React Query's QueryClient (created per-render inside
    // AppProviders) tears down its internal GC timers before the test
    // file exits — otherwise Jest can intermittently warn about a worker
    // that failed to exit gracefully. See M12.3 report §12.
    act(() => {
      tree?.unmount();
    });
    tree = undefined;
  });

  it("renders every fixture's name and schema_version from FIXTURE_DIAGNOSTICS", async () => {
    await act(async () => {
      tree = create(
        <AppProviders>
          <M0IntegrationDemoScreen />
        </AppProviders>
      );
      // let the capabilities query microtask resolve
      await Promise.resolve();
    });

    const asString = JSON.stringify(tree!.toJSON());

    expect(FIXTURE_DIAGNOSTICS.length).toBeGreaterThan(0);
    for (const entry of FIXTURE_DIAGNOSTICS) {
      expect(asString).toContain(entry.name);
      expect(asString).toContain(entry.schemaVersion);
    }
  });

  it("renders the fixture data-source banner, not a live-backend claim", async () => {
    await act(async () => {
      tree = create(
        <AppProviders>
          <M0IntegrationDemoScreen />
        </AppProviders>
      );
      await Promise.resolve();
    });

    const asString = JSON.stringify(tree!.toJSON());
    expect(asString).toContain("DEMO DATA");
    expect(asString).not.toContain("Live result");
  });
});
