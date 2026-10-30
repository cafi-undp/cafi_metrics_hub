import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppProvider } from "./lib/state";
import type { Metrics, Quality } from "./lib/types";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

/** Last line of defence: a rendering error shows a card with a reload link instead of a blank page. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Dashboard error", error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 40, fontFamily: "system-ui", maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22 }}>Something went wrong on this page</h1>
        <p style={{ marginTop: 8 }}>The rest of the dashboard is unaffected. <a href="#/" onClick={() => setTimeout(() => location.reload(), 0)}>Back to the overview</a>.</p>
        <pre style={{ marginTop: 16, fontSize: 12, whiteSpace: "pre-wrap", opacity: 0.7 }}>{String(this.state.error)}</pre>
      </div>
    );
  }
}

async function boot() {
  try {
    const [m, q] = await Promise.all([
      fetch("./data/metrics.json", { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error(`metrics.json: HTTP ${r.status}`);
        return r.json() as Promise<Metrics>;
      }),
      fetch("./data/quality.json", { cache: "no-cache" }).then((r) => (r.ok ? (r.json() as Promise<Quality>) : null)).catch(() => null),
    ]);
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <AppProvider m={m} q={q}>
            <App />
          </AppProvider>
        </ErrorBoundary>
      </StrictMode>,
    );
  } catch (e) {
    root.render(
      <div style={{ padding: 40, fontFamily: "system-ui" }}>
        <h1>Data not available</h1>
        <p>Run <code>python -m pipeline.build</code> from the repository root to generate <code>web/public/data/metrics.json</code>.</p>
        <pre>{String(e)}</pre>
      </div>,
    );
  }
}

boot();
