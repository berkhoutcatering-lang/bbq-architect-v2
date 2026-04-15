'use client';

import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
    /** Size of the spinner icon in px */
    size?: number;
    /** Optional label shown next to spinner */
    label?: string;
    /** Renders full-height centered block when true */
    fullPage?: boolean;
}

export default function LoadingSpinner({ size = 20, label = 'Laden...', fullPage = false }: LoadingSpinnerProps) {
    if (fullPage) {
        return (
            <div
                role="status"
                aria-label={label}
                style={{
                    display: 'flex',
                    flexDirection: 'column' as const,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                    padding: 48,
                    minHeight: 200,
                }}
            >
                <Loader2
                    size={size}
                    style={{ color: 'var(--brand)', animation: 'spin 1s linear infinite' }}
                    aria-hidden="true"
                />
                {label && <span style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</span>}
            </div>
        );
    }

    return (
        <span
            role="status"
            aria-label={label}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
            <Loader2
                size={size}
                style={{ color: 'var(--muted)', animation: 'spin 1s linear infinite' }}
                aria-hidden="true"
            />
            {label && <span style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</span>}
        </span>
    );
}
