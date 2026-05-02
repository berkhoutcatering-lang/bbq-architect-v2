'use client';

import type { InfoBlock as InfoBlockType } from '@/lib/ai/blocks';

export default function InfoBlock({ block }: { block: InfoBlockType }) {
    return (
        <div
            style={{
                background: 'var(--status-info-bg)',
                border: '1px solid var(--status-info-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                color: 'var(--text)',
            }}
        >
            <div
                style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    color: 'var(--status-info-text)',
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
    );
}
