'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorCardProps {
    /** Korte kop boven het bericht. Default: "Niet geladen". */
    title?: string;
    /** Het feitelijke probleem, in mensentaal. */
    message?: string;
    /** Async-safe retry handler. Toont een knop "Opnieuw proberen". */
    retry?: () => void | Promise<void>;
    /**
     * Compact-mode: kleinere padding + icon, voor inline-in-card-gebruik
     * binnen een grotere page (b.v. één van 12 sections op /events/[id]/hub).
     */
    compact?: boolean;
    /** Optionele technische context voor devs (uitklapbaar in <details>). */
    details?: string;
}

/**
 * ErrorCard — fallback-UI voor mislukte data-fetches.
 *
 * Onderscheid met `ErrorBoundaryLogger`:
 *   - `ErrorBoundaryLogger` vangt React-render-crashes (whole-page-down)
 *   - `ErrorCard` is voor "deze API-call faalde, rest van de page werkt
 *     wel" — typisch binnen een card-section
 *
 * Gebruik:
 * ```tsx
 * const { data, loading, error, refetch } = useSupabase('offertes');
 * if (loading) return <Skeleton />;
 * if (error) return <ErrorCard message={error} retry={refetch} compact />;
 * return <OfferteList data={data} />;
 * ```
 */
export default function ErrorCard({
    title = 'Niet geladen',
    message = 'Deze sectie kon niet worden geladen. Probeer opnieuw — werkt het nog niet, mail support@bbqarchitect.nl.',
    retry,
    compact = false,
    details,
}: ErrorCardProps) {
    const padding = compact ? 16 : 32;
    const iconSize = compact ? 22 : 32;
    const titleSize = compact ? 14 : 18;
    const msgSize = compact ? 12 : 13;

    return (
        <div
            role="alert"
            style={{
                padding,
                textAlign: 'center',
                background: 'color-mix(in srgb, var(--danger, #ef4444) 5%, var(--card, transparent))',
                border: '1px solid color-mix(in srgb, var(--danger, #ef4444) 20%, transparent)',
                borderRadius: 12,
            }}
        >
            <div
                style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: iconSize + 18, height: iconSize + 18, borderRadius: 12,
                    background: 'color-mix(in srgb, var(--danger, #ef4444) 12%, transparent)',
                    marginBottom: compact ? 8 : 12,
                }}
            >
                <AlertTriangle size={iconSize} style={{ color: 'var(--danger, #ef4444)' }} aria-hidden />
            </div>
            <h3 style={{
                fontSize: titleSize, fontWeight: 700, color: 'var(--text)',
                margin: 0, marginBottom: 6,
            }}>
                {title}
            </h3>
            <p style={{
                color: 'var(--muted)', fontSize: msgSize, lineHeight: 1.5,
                margin: 0, marginBottom: retry ? (compact ? 12 : 16) : 0,
                maxWidth: 400, marginLeft: 'auto', marginRight: 'auto',
            }}>
                {message}
            </p>
            {retry && (
                <button
                    onClick={() => { void retry(); }}
                    className="btn btn-ghost btn-sm"
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: compact ? '6px 12px' : '8px 16px',
                        borderRadius: 8,
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        fontSize: compact ? 12 : 13,
                        fontWeight: 600,
                    }}
                >
                    <RefreshCw size={compact ? 12 : 14} aria-hidden /> Opnieuw proberen
                </button>
            )}
            {details && (
                <details style={{ marginTop: 12, textAlign: 'left', maxWidth: 500, marginLeft: 'auto', marginRight: 'auto' }}>
                    <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--muted)' }}>Technische details</summary>
                    <pre style={{
                        fontSize: 11, color: 'var(--danger, #ef4444)',
                        background: 'var(--bg)', padding: 10, borderRadius: 8,
                        marginTop: 6, overflow: 'auto', maxHeight: 160,
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                        {details}
                    </pre>
                </details>
            )}
        </div>
    );
}
