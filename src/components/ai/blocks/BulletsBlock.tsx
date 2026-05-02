'use client';

import type { BulletsBlock as BulletsBlockType } from '@/lib/ai/blocks';

export default function BulletsBlock({ block }: { block: BulletsBlockType }) {
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
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    color: 'var(--text)',
                    marginBottom: 'var(--space-3)',
                }}
            >
                {block.title}
            </div>
            <ul
                style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-2)',
                }}
            >
                {block.items.map((item, i) => (
                    <li
                        key={i}
                        style={{
                            fontSize: 'var(--text-sm)',
                            color: 'var(--muted-light)',
                            display: 'flex',
                            gap: 'var(--space-2)',
                            lineHeight: 1.5,
                        }}
                    >
                        <span style={{ color: 'var(--brand)', flexShrink: 0 }} aria-hidden="true">•</span>
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
