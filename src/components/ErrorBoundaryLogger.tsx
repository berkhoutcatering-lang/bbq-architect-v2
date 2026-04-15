'use client';

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  organizationId?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundaryLogger extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to server
    fetch('/api/error-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorMessage: error.message,
        errorStack: error.stack,
        page: typeof window !== 'undefined' ? window.location.pathname : null,
        organizationId: this.props.organizationId || null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        metadata: { componentStack: errorInfo.componentStack },
      }),
    }).catch(function () { /* silent */ });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: 16,
            background: 'rgba(239,68,68,.1)', marginBottom: 16,
          }}>
            <AlertTriangle size={28} style={{ color: 'var(--red)' }} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            Er ging iets mis
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
            Er is een fout opgetreden. Het probleem is automatisch gerapporteerd.
          </p>
          <button
            onClick={function () { window.location.reload(); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 20px', borderRadius: 10,
              background: 'linear-gradient(135deg, var(--color-accent-gold), #8b6914)',
              color: '#fff', border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 600,
            }}
          >
            <RefreshCw size={14} /> Pagina vernieuwen
          </button>
          {this.state.error && (
            <details style={{ marginTop: 20, textAlign: 'left', maxWidth: 500, margin: '20px auto 0' }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}>Technische details</summary>
              <pre style={{ fontSize: 11, color: 'var(--red)', background: 'var(--bg)', padding: 12, borderRadius: 8, marginTop: 8, overflow: 'auto', maxHeight: 200 }}>
                {this.state.error.message}{'\n'}{this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
