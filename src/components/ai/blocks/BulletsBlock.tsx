'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { resolveIcon } from './icons';
import type { BulletsBlock as BulletsBlockType, BulletItem, BadgeTone } from '@/lib/ai/blocks';

const badgeTone: Record<BadgeTone, { bg: string; text: string }> = {
    info: { bg: 'var(--status-info-bg)', text: 'var(--status-info-text)' },
    warning: { bg: 'var(--status-warning-bg)', text: 'var(--status-warning-text)' },
    success: { bg: 'var(--status-success-bg)', text: 'var(--status-success-text)' },
    danger: { bg: 'var(--status-danger-bg)', text: 'var(--status-danger-text)' },
    neutral: { bg: 'var(--status-neutral-bg)', text: 'var(--status-neutral-text)' },
};

function isObjectItem(item: BulletItem): item is { text: string; route?: string; icon?: string; badge?: { text: string; tone: BadgeTone } } {
    return typeof item !== 'string';
}

interface Props {
    block: BulletsBlockType;
    onNavigate?: () => void;
}

export default function BulletsBlock({ block, onNavigate }: Props) {
    return (
        <div
            className="smoke-card"
            style={{
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
                {block.items.map((item, i) => {
                    if (!isObjectItem(item)) {
                        // Plain string item — niet klikbaar
                        return (
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
                        );
                    }

                    // Object-item: mogelijk klikbaar (route) + icon + badge
                    const Icon = resolveIcon(item.icon, null);
                    const tone = item.badge ? badgeTone[item.badge.tone] : null;

                    const inner = (
                        <>
                            <span style={{ color: 'var(--brand)', flexShrink: 0, marginTop: 2 }} aria-hidden="true">
                                {Icon ? <Icon size={14} /> : '•'}
                            </span>
                            <span style={{ flex: 1, color: 'var(--muted-light)' }}>{item.text}</span>
                            {tone && item.badge && (
                                <span
                                    style={{
                                        fontSize: 10,
                                        fontWeight: 600,
                                        color: tone.text,
                                        background: tone.bg,
                                        padding: '1px 6px',
                                        borderRadius: 'var(--radius-full)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.04em',
                                        flexShrink: 0,
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {item.badge.text}
                                </span>
                            )}
                            {item.route && (
                                <ArrowRight size={12} color="var(--muted)" style={{ flexShrink: 0, marginTop: 4 }} aria-hidden="true" />
                            )}
                        </>
                    );

                    if (item.route) {
                        return (
                            <li key={i} style={{ listStyle: 'none' }}>
                                <Link
                                    href={item.route}
                                    onClick={onNavigate}
                                    style={{
                                        display: 'flex',
                                        gap: 'var(--space-2)',
                                        padding: 'var(--space-2)',
                                        margin: 'calc(var(--space-2) * -1)',
                                        marginBottom: 0,
                                        fontSize: 'var(--text-sm)',
                                        color: 'var(--text)',
                                        textDecoration: 'none',
                                        borderRadius: 'var(--radius-md)',
                                        lineHeight: 1.5,
                                        alignItems: 'flex-start',
                                        transition: 'background 100ms',
                                    }}
                                    className="ai-bullet-link"
                                >
                                    {inner}
                                </Link>
                            </li>
                        );
                    }

                    return (
                        <li
                            key={i}
                            style={{
                                fontSize: 'var(--text-sm)',
                                display: 'flex',
                                gap: 'var(--space-2)',
                                lineHeight: 1.5,
                                alignItems: 'flex-start',
                            }}
                        >
                            {inner}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
