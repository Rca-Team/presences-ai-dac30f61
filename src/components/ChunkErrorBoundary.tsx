import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

const RELOAD_MARKER = 'presence:chunk-reload';

function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const msg = (error as any)?.message || String(error);
  const name = (error as any)?.name || '';
  return (
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /ChunkLoadError/i.test(name) ||
    /error loading dynamically imported module/i.test(msg)
  );
}

/**
 * Catches lazy-loaded chunk failures (common after a new release invalidates
 * old chunk hashes) and self-recovers with a one-shot hard reload so the
 * browser fetches a fresh index.html. Guarded via sessionStorage to prevent
 * reload loops.
 */
export default class ChunkErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (isChunkLoadError(error)) {
      try {
        const already = sessionStorage.getItem(RELOAD_MARKER);
        if (!already) {
          sessionStorage.setItem(RELOAD_MARKER, '1');
          window.location.reload();
          return;
        }
      } catch {
        // sessionStorage unavailable — fall through to fallback UI.
      }
    }
    console.error('App error boundary caught:', error);
  }

  handleReload = () => {
    try {
      sessionStorage.removeItem(RELOAD_MARKER);
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            background: '#0f172a',
            color: '#fff',
            fontFamily: 'sans-serif',
            padding: 20,
            textAlign: 'center',
          }}
        >
          <div>
            <h2>Something went wrong</h2>
            <p style={{ color: '#94a3b8', marginTop: 8 }}>
              Please refresh the page. If the issue persists, clear your browser cache.
            </p>
            <button
              onClick={this.handleReload}
              style={{
                marginTop: 16,
                padding: '8px 24px',
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
