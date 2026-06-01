'use client';
import { useEffect } from 'react';
import { AlertTriangle, RotateCw, Home } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(function () {
    if (typeof window !== 'undefined') {
      fetch('/api/error-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          digest: error.digest,
          url: window.location.pathname,
          ts: new Date().toISOString(),
        }),
      }).catch(function () { /* swallow */ });
    }
  }, [error]);

  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        maxWidth: 520,
        width: '100%',
        background: 'var(--card)',
        borderRadius: 16,
        border: '1px solid rgba(239,68,68,.3)',
        padding: 32,
        boxShadow: '0 20px 40px rgba(0,0,0,.2)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16,
        }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'rgba(239,68,68,.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--red)',
          }}>
            <AlertTriangle size={20} />
          </div>
          <h2 style={{
            color: 'var(--text)',
            fontSize: 18,
            fontWeight: 800,
            margin: 0,
          }}>Er ging iets mis</h2>
        </div>
        <p style={{
          color: 'var(--muted)',
          fontSize: 14,
          lineHeight: 1.5,
          marginBottom: 20,
          margin: '0 0 20px',
        }}>
          De pagina kon niet laden. Probeer opnieuw, of ga terug naar het dashboard.
          Als dit blijft gebeuren, neem dan contact op via Hulp.
        </p>
        {error.message && (
          <details style={{ marginBottom: 20 }}>
            <summary style={{
              color: 'var(--muted)',
              fontSize: 12,
              cursor: 'pointer',
              marginBottom: 8,
            }}>Technische details</summary>
            <div style={{
              background: 'rgba(0,0,0,.3)',
              padding: 12,
              borderRadius: 8,
              fontFamily: 'monospace',
              fontSize: 11,
              color: 'var(--red)',
              wordBreak: 'break-all',
              maxHeight: 120,
              overflow: 'auto',
            }}>
              {error.message}
              {error.digest && (
                <div style={{ marginTop: 8, color: 'var(--muted)' }}>
                  ID: {error.digest}
                </div>
              )}
            </div>
          </details>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={function () { reset(); }}
            style={{
              padding: '10px 20px',
              background: 'var(--brand)',
              color: 'var(--brand-background, #000)',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <RotateCw size={14} /> Probeer opnieuw
          </button>
          <a
            href="/"
            style={{
              padding: '10px 20px',
              background: 'transparent',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Home size={14} /> Naar dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
