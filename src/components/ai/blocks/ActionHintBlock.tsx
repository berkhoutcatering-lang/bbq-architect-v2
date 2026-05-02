'use client';

import { Lightbulb } from 'lucide-react';
import type { ActionHintBlock as ActionHintBlockType } from '@/lib/ai/blocks';

export default function ActionHintBlock({ block }: { block: ActionHintBlockType }) {
    return (
        <div
            style={{
                background: 'var(--brand-tint-subtle)',
                border: '1px dashed var(--brand-tint-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-3) var(--space-4)',
                display: 'flex',
                gap: 'var(--space-3)',
                color: 'var(--text)',
            }}
        >
            <Lightbulb size={16} color="var(--brand)" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 600,
                        color: 'var(--brand)',
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
