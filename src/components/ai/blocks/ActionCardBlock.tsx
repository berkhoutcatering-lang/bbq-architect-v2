'use client';

import { useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import type { ActionCardBlock as ActionCardBlockType } from '@/lib/ai/blocks';

type ExecuteState = 'idle' | 'running' | 'done' | 'error';

interface Props {
    block: ActionCardBlockType;
    /**
     * Wordt aangeroepen wanneer de gebruiker op de confirm-knop klikt.
     * Krijgt het hele action-object (type + data) zodat de host
     * (ChatPanel of preview) zelf de juiste server-action kan kiezen.
     * Mag een Promise teruggeven — UI toont dan een spinner.
     */
    onExecute?: (action: ActionCardBlockType['action']) => void | Promise<void>;
}

export default function ActionCardBlock({ block, onExecute }: Props) {
    const [state, setState] = useState<ExecuteState>('idle');
    const [error, setError] = useState<string | null>(null);

    const destructive = block.destructive === true;
    const accentColor = destructive ? 'var(--status-danger-text)' : 'var(--brand)';
    const accentBg = destructive ? 'var(--status-danger-bg)' : 'var(--brand-tint-subtle)';
    const accentBorder = destructive ? 'var(--status-danger-border)' : 'var(--brand-tint-border)';

    async function handleConfirm() {
        if (!onExecute || state === 'running') return;
        setState('running');
        setError(null);
        try {
            await onExecute(block.action);
            setState('done');
        } catch (err) {
            setState('error');
            setError(err instanceof Error ? err.message : 'Actie mislukt');
        }
    }

    return (
        <div
            className="smoke-card"
            style={{
                border: '1px solid ' + accentBorder,
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                color: 'var(--text)',
            }}
        >
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                <div
                    style={{
                        background: accentBg,
                        border: '1px solid ' + accentBorder,
                        borderRadius: 'var(--radius-md)',
                        width: 36,
                        height: 36,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    <Zap size={18} color={accentColor} aria-hidden="true" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
                        {block.title}
                    </div>
                    <div
                        style={{
                            fontSize: 'var(--text-sm)',
                            color: 'var(--muted-light)',
                            marginTop: 'var(--space-1)',
                            lineHeight: 1.5,
                        }}
                    >
                        {block.summary}
                    </div>
                    <div
                        style={{
                            fontSize: 11,
                            color: 'var(--muted)',
                            marginTop: 'var(--space-2)',
                            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                        }}
                    >
                        actie: {block.action.type}
                    </div>
                </div>
            </div>

            {state === 'idle' && (
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        className={destructive ? 'btn btn-red' : 'btn btn-brand'}
                        style={{ minHeight: 36 }}
                    >
                        {block.confirm_label}
                    </button>
                    <button
                        type="button"
                        onClick={() => setState('idle')}
                        className="btn btn-ghost"
                        style={{ minHeight: 36 }}
                    >
                        {block.cancel_label ?? 'Annuleer'}
                    </button>
                </div>
            )}

            {state === 'running' && (
                <div
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        marginTop: 'var(--space-4)',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--muted-light)',
                    }}
                >
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true" />
                    Bezig met uitvoeren…
                </div>
            )}

            {state === 'done' && (
                <div
                    style={{
                        marginTop: 'var(--space-4)',
                        padding: 'var(--space-2) var(--space-3)',
                        background: 'var(--status-success-bg)',
                        border: '1px solid var(--status-success-border)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--status-success-text)',
                        fontWeight: 600,
                    }}
                >
                    Klaar.
                </div>
            )}

            {state === 'error' && (
                <div
                    style={{
                        marginTop: 'var(--space-4)',
                        padding: 'var(--space-2) var(--space-3)',
                        background: 'var(--status-danger-bg)',
                        border: '1px solid var(--status-danger-border)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--status-danger-text)',
                    }}
                >
                    {error ?? 'Er ging iets mis. Probeer het opnieuw.'}
                </div>
            )}
        </div>
    );
}
