'use client';
import { useEffect } from 'react';

export default function Error({ error, reset }) {
    useEffect(() => {
        console.error('Financien Error caught by Boundary:', error);
    }, [error]);

    return (
        <div style={{ padding: 40, background: 'var(--card)', borderRadius: 12, border: '1px solid var(--red)', margin: 20, animation: 'fadeIn 0.4s ease-out' }}>
            <h2 style={{ color: 'var(--red)', fontSize: 24, fontWeight: 900, marginBottom: 12 }}>
                <i className="fa-solid fa-triangle-exclamation"></i> The Vault is Vastegelopen
            </h2>
            <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
                Er is een rekenfout opgetreden. Antigravity heeft deze <code>error.js</code> vanger geplaatst om de verborgen foute datarij te analyseren. Maak een screenshot van de code hieronder!
            </p>

            <div style={{ background: 'rgba(0,0,0,0.5)', padding: 20, borderRadius: 8, fontFamily: 'monospace', color: 'var(--red)', wordBreak: 'break-all' }}>
                <strong style={{ display: 'block', marginBottom: 8, color: '#fff' }}>Exacte Foutmelding:</strong>
                {error.name}: {error.message}
            </div>

            {error.stack && (
                <div style={{ background: 'rgba(0,0,0,0.5)', padding: 20, borderRadius: 8, fontFamily: 'monospace', color: 'var(--muted)', marginTop: 10, fontSize: 11, whiteSpace: 'pre-wrap' }}>
                    <strong style={{ display: 'block', marginBottom: 8, color: '#fff' }}>Stack Trace:</strong>
                    {error.stack}
                </div>
            )}

            <button
                onClick={() => reset()}
                className="btn btn-primary"
                style={{ marginTop: 24 }}
            >
                <i className="fa-solid fa-rotate-right"></i> Probeer opnieuw
            </button>
        </div>
    );
}
