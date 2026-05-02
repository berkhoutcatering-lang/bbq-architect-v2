'use client';

import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import type { MetricBlock as MetricBlockType, DeltaTone } from '@/lib/ai/blocks';

const deltaStyle: Record<DeltaTone, { color: string; bg: string }> = {
    positive: { color: 'var(--status-success-text)', bg: 'var(--status-success-bg)' },
    negative: { color: 'var(--status-danger-text)', bg: 'var(--status-danger-bg)' },
    neutral: { color: 'var(--muted-light)', bg: 'var(--status-neutral-bg)' },
};

interface Props {
    block: MetricBlockType;
    onNavigate?: () => void;
}

export default function MetricBlock({ block, onNavigate }: Props) {
    const DeltaIcon = block.delta?.tone === 'positive' ? ArrowUp : block.delta?.tone === 'negative' ? ArrowDown : ArrowRight;
    const deltaTone = block.delta ? deltaStyle[block.delta.tone] : null;
    const isLink = !!block.route;

    const content = (
        <>
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
            {isLink && (
                <div
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 'var(--space-1)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        color: 'var(--brand)',
                        marginTop: 'var(--space-3)',
                    }}
                >
                    {block.label || 'Open'}
                    <ArrowRight size={12} aria-hidden="true" />
                </div>
            )}
        </>
    );

    const baseStyle = {
        display: 'block',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4)',
        color: 'var(--text)',
        textDecoration: 'none',
    } as const;

    if (isLink && block.route) {
        return (
            <Link href={block.route} onClick={onNavigate} style={baseStyle} className="smoke-card smoke-card-interactive ai-metric-link">
                {content}
            </Link>
        );
    }

    return <div style={baseStyle} className="smoke-card">{content}</div>;
}
