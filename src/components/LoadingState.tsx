'use client';
import React from 'react';
import { Flame, AlertTriangle } from 'lucide-react';

/* Gestandaardiseerde loading- en error-states zodat elke pagina dezelfde look
 * gebruikt. Vóór deze component had elke pagina een eigen Flame-pulse
 * fallback (10× gedupliceerd) en geen consistente error-UI. */

interface LoadingStateProps {
    label?: string;
    fullScreen?: boolean;
}

export function LoadingState({ label = 'Laden...', fullScreen = true }: LoadingStateProps) {
    if (fullScreen) {
        return (
            <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <Flame className="w-8 h-8 animate-pulse" style={{ color: 'var(--color-accent-gold)' }} />
                    <div style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
                </div>
            </div>
        );
    }
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 12px', color: 'var(--muted)', fontSize: 12 }}>
            <Flame size={14} className="animate-pulse" style={{ color: 'var(--color-accent-gold)' }} />
            {label}
        </div>
    );
}

interface ErrorStateProps {
    title?: string;
    message: string;
    onRetry?: () => void;
}

export function ErrorState({ title = 'Er ging iets mis', message, onRetry }: ErrorStateProps) {
    return (
        <div style={{
            padding: 32,
            textAlign: 'center',
            border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)',
            borderRadius: 12,
            background: 'color-mix(in srgb, var(--red) 6%, transparent)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        }}>
            <AlertTriangle size={28} style={{ color: 'var(--red)' }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 480 }}>{message}</div>
            {onRetry && (
                <button className="btn btn-ghost btn-sm" onClick={onRetry} style={{ marginTop: 8 }}>
                    Opnieuw proberen
                </button>
            )}
        </div>
    );
}
