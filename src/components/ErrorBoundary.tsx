import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // You can log to an external logging service here
    console.error("Unhandled error caught by ErrorBoundary:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    // optional: reload the page to recover
    // window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="error-boundary"
          style={{ padding: 24, textAlign: "center" }}
        >
          <h2>Something went wrong.</h2>
          <p>{this.state.error?.message}</p>
          <div style={{ marginTop: 12 }}>
            <button className="btn-primary" onClick={this.handleReset}>
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children as React.ReactElement;
  }
}
