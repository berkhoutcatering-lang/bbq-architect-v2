'use client';
import { useEffect } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface ErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
    useEffect(function () {
        console.error(error);
    }, [error]);

    return (
        <div style={{ padding: 40, background: 'var(--card)', borderRadius: 12, border: '1px solid rgba(239,68,68,.3)', margin: 20, animation: 'fadeIn 0.4s ease-out' }}>
            <h2 style={{ color: 'var(--red)', fontSize: 20, fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={14} /> Er ging iets mis
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
                Er is een onverwachte fout opgetreden. Probeer de pagina opnieuw te laden.
            </p>
            <div style={{ background: 'rgba(0,0,0,.3)', padding: 16, borderRadius: 8, fontFamily: 'monospace', fontSize: 12, color: 'var(--red)', marginBottom: 20, wordBreak: 'break-all' }}>
                {error.message}
            </div>
            <button onClick={function () { reset(); }} style={{ padding: '10px 24px', background: 'var(--brand)', color: 'var(--brand-background, #000)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                <RotateCw size={14} className="mr-1.5" /> Probeer opnieuw
            </button>
        </div>
    );
}
