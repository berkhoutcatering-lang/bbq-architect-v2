'use client';

import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import type { MetricBlock as MetricBlockType } from '@/lib/ai/blocks';

const deltaStyle: Record<MetricBlockType['delta'] extends infer D ? D extends { tone: infer T } ? T & string : never : never, { color: string; bg: string }> = {
    positive: { color: 'var(--status-success-text)', bg: 'var(--status-success-bg)' },
    negative: { color: 'var(--status-danger-text)', bg: 'var(--status-danger-bg)' },
    neutral: { color: 'var(--muted-light)', bg: 'var(--status-neutral-bg)' },
};

export default function MetricBlock({ block }: { block: MetricBlockType }) {
    const DeltaIcon = block.delta?.tone === 'positive' ? ArrowUp : block.delta?.tone === 'negative' ? ArrowDown : ArrowRight;
    const deltaTone = block.delta ? deltaStyle[block.delta.tone] : null;

    return (
        <div
            style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                color: 'var(--text)',
            }}
        >
            <div
                style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: 'var(--space-2)',
                }}
            >
                {block.title}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <div
                    style={{
                        fontSize: 'var(--text-xl)',
                        fontWeight: 700,
                        color: 'var(--text)',
                        fontFamily: 'var(--font-artisan)',
                    }}
                >
                    {block.value}
                </div>
                {block.delta && deltaTone && (
                    <div
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 'var(--space-1)',
                            fontSize: 'var(--text-xs)',
                            fontWeight: 600,
                            color: deltaTone.color,
                            background: deltaTone.bg,
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-full)',
                        }}
                    >
                        <DeltaIcon size={12} aria-hidden="true" />
                        {block.delta.value}
                    </div>
                )}
            </div>
            {block.text && (
                <div
                    style={{
                        fontSize: 'var(--text-sm)',
                        color: 'var(--muted-light)',
                        marginTop: 'var(--space-2)',
                        lineHeight: 1.5,
                    }}
                >
                    {block.text}
                </div>
            )}
        </div>
    );
}
