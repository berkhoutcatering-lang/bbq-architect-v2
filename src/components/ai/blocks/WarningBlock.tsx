'use client';

import { AlertTriangle } from 'lucide-react';
import type { WarningBlock as WarningBlockType } from '@/lib/ai/blocks';

const severityStyle: Record<NonNullable<WarningBlockType['severity']>, { bg: string; border: string; text: string }> = {
    low: { bg: 'var(--status-warning-bg)', border: 'var(--status-warning-border)', text: 'var(--status-warning-text)' },
    medium: { bg: 'var(--status-warning-bg)', border: 'var(--status-warning-border)', text: 'var(--status-warning-text)' },
    high: { bg: 'var(--status-danger-bg)', border: 'var(--status-danger-border)', text: 'var(--status-danger-text)' },
};

export default function WarningBlock({ block }: { block: WarningBlockType }) {
    const sev = block.severity ?? 'medium';
    const tone = severityStyle[sev];

    return (
        <div
            style={{
                background: tone.bg,
                border: '1px solid ' + tone.border,
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                display: 'flex',
                gap: 'var(--space-3)',
                color: 'var(--text)',
            }}
        >
            <AlertTriangle size={18} color={tone.text} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 600,
                        color: tone.text,
                        marginBottom: block.text ? 'var(--space-1)' : 0,
                    }}
                >
                    {block.title}
                </div>
                {block.text && (
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--muted-light)', lineHeight: 1.5 }}>
                        {block.text}
                    </div>
                )}
            </div>
        </div>
    );
}
