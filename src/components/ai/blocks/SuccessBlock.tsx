'use client';

import { CheckCircle2 } from 'lucide-react';
import type { SuccessBlock as SuccessBlockType } from '@/lib/ai/blocks';

export default function SuccessBlock({ block }: { block: SuccessBlockType }) {
    return (
        <div
            style={{
                background: 'var(--status-success-bg)',
                border: '1px solid var(--status-success-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                display: 'flex',
                gap: 'var(--space-3)',
                color: 'var(--text)',
            }}
        >
            <CheckCircle2 size={18} color="var(--status-success-text)" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 600,
                        color: 'var(--status-success-text)',
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
