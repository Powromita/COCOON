import React from "react";

import { ErrorState } from "./ErrorState";

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * App-level crash guard. No screen should be able to take the whole app
 * down over missing/malformed data — this catches render-time exceptions
 * that slip past a screen's own loading/error handling.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Unhandled render error:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <ErrorState
          title="The app hit an unexpected error"
          message={this.state.error.message}
          onRetry={this.reset}
        />
      );
    }
    return this.props.children;
  }
}
