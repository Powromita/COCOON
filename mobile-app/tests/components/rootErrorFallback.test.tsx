/**
 * Test C (M12.2.1 §7): the root ErrorBoundary fallback renders the error
 * message and a working Retry control.
 */
import React from "react";
import { act, create } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { RootErrorFallback } from "../../components/common/RootErrorFallback";

describe("RootErrorFallback — C. renders error + retry", () => {
  let tree: ReturnType<typeof create> | undefined;

  afterEach(() => {
    act(() => {
      tree?.unmount();
    });
    tree = undefined;
  });

  it("renders the error message and a stack trace", () => {
    const error = new Error("Simulated startup failure");
    const retry = jest.fn();

    act(() => {
      tree = create(
        <SafeAreaProvider>
          <RootErrorFallback error={error} retry={retry} />
        </SafeAreaProvider>
      );
    });

    const text = tree!.toJSON();
    const asString = JSON.stringify(text);
    expect(asString).toContain("Simulated startup failure");
    expect(asString).toContain("STACK TRACE");
  });

  it("calls retry() when the Retry control is pressed", () => {
    const error = new Error("Simulated startup failure");
    const retry = jest.fn();

    act(() => {
      tree = create(
        <SafeAreaProvider>
          <RootErrorFallback error={error} retry={retry} />
        </SafeAreaProvider>
      );
    });

    const button = tree!.root.findByProps({ accessibilityRole: "button" });
    act(() => {
      button.props.onPress();
    });

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
