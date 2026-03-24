import React from "react";

export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p className="error-boundary-msg">{this.state.error?.message || "An unexpected error occurred."}</p>
          <button type="button" className="error-boundary-retry" onClick={this.handleRetry}>
            Try again
          </button>
          <style>{`
            .error-boundary {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              padding: 24px;
              background: var(--bg-primary, #0a0f1c);
              color: var(--text-primary, #e2e8f0);
              text-align: center;
            }
            .error-boundary h2 { font-size: 18px; margin-bottom: 12px; }
            .error-boundary-msg {
              font-size: 14px;
              color: var(--text-secondary, #94a3b8);
              margin-bottom: 20px;
              max-width: 400px;
            }
            .error-boundary-retry {
              padding: 10px 24px;
              font-size: 14px;
              background: var(--accent, #3b82f6);
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
            }
            .error-boundary-retry:hover { opacity: 0.9; }
          `}</style>
        </div>
      );
    }
    return this.props.children;
  }
}
