'use client';

import Link from 'next/link';
import * as Icons from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import type { NavCardBlock as NavCardBlockType, BadgeTone } from '@/lib/ai/blocks';

const badgeTone: Record<BadgeTone, { bg: string; border: string; text: string }> = {
    info: { bg: 'var(--status-info-bg)', border: 'var(--status-info-border)', text: 'var(--status-info-text)' },
    warning: { bg: 'var(--status-warning-bg)', border: 'var(--status-warning-border)', text: 'var(--status-warning-text)' },
    success: { bg: 'var(--status-success-bg)', border: 'var(--status-success-border)', text: 'var(--status-success-text)' },
    danger: { bg: 'var(--status-danger-bg)', border: 'var(--status-danger-border)', text: 'var(--status-danger-text)' },
    neutral: { bg: 'var(--status-neutral-bg)', border: 'var(--status-neutral-border)', text: 'var(--status-neutral-text)' },
};

// Lucide icon resolver. Onbekende namen vallen terug op ArrowRight (dezelfde
// als CTA-pijl) zodat de kaart altijd rendert.
function resolveIcon(name?: string) {
    if (!name) return ArrowRight;
    const candidate = (Icons as unknown as Record<string, unknown>)[name];
    if (typeof candidate === 'function' || (candidate && typeof candidate === 'object')) {
        return candidate as typeof ArrowRight;
    }
    return ArrowRight;
}

export default function NavCardBlock({ block, onNavigate }: { block: NavCardBlockType; onNavigate?: () => void }) {
    const Icon = resolveIcon(block.icon);
    const badge = block.badge ? badgeTone[block.badge.tone] : null;

    return (
        <Link
            href={block.route}
            onClick={onNavigate}
            className="smoke-card smoke-card-interactive"
            style={{
                display: 'block',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                textDecoration: 'none',
                color: 'var(--text)',
                minHeight: 64,
            }}
            className="ai-nav-card"
        >
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                <div
                    style={{
                        background: 'var(--brand-tint-subtle)',
                        border: '1px solid var(--brand-tint-border)',
                        borderRadius: 'var(--radius-md)',
                        width: 36,
                        height: 36,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    <Icon size={18} color="var(--brand)" aria-hidden="true" />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                        <div
                            style={{
                                fontSize: 'var(--text-sm)',
                                fontWeight: 600,
                                color: 'var(--text)',
                                lineHeight: 1.3,
                            }}
                        >
                            {block.title}
                        </div>
                        {block.badge && badge && (
                            <span
                                style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    color: badge.text,
                                    background: badge.bg,
                                    border: '1px solid ' + badge.border,
                                    padding: '2px 6px',
                                    borderRadius: 'var(--radius-full)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.04em',
                                    flexShrink: 0,
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {block.badge.text}
                            </span>
                        )}
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

                    {block.preview && block.preview.length > 0 && (
                        <ul
                            style={{
                                listStyle: 'none',
                                margin: 'var(--space-2) 0 0',
                                padding: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 2,
                            }}
                        >
                            {block.preview.slice(0, 5).map((item, i) => (
                                <li
                                    key={i}
                                    style={{
                                        fontSize: 'var(--text-xs)',
                                        color: 'var(--muted)',
                                        display: 'flex',
                                        gap: 'var(--space-2)',
                                    }}
                                >
                                    <span style={{ color: 'var(--muted-weak)' }} aria-hidden="true">›</span>
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    )}

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
                        {block.label}
                        <ArrowRight size={12} aria-hidden="true" />
                    </div>
                </div>
            </div>
        </Link>
    );
}
