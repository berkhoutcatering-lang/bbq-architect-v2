'use client';
import { useState, useEffect, type ReactNode } from 'react';
import { Info, X } from 'lucide-react';

interface PageHintAction {
    label: string;
    href: string;
}

interface PageHintProps {
    id: string;
    title: string;
    description: string;
    icon?: ReactNode;
    actions?: PageHintAction[];
}

export default function PageHint({ id, title, description, icon, actions }: PageHintProps) {
    const [dismissed, setDismissed] = useState(true);

    useEffect(() => {
        const key = 'bbq_hint_' + id;
        const stored = localStorage.getItem(key);
        if (!stored) setDismissed(false);
    }, [id]);

    function dismiss() {
        localStorage.setItem('bbq_hint_' + id, 'true');
        setDismissed(true);
    }

    if (dismissed) return null;

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                marginBottom: 14,
                borderRadius: 12,
                background: 'color-mix(in srgb, var(--blue) 6%, transparent)',
                border: '1px solid color-mix(in srgb, var(--blue) 15%, transparent)',
                borderLeft: '2px solid color-mix(in srgb, var(--blue) 50%, transparent)',
                maxHeight: 80,
                overflow: 'hidden',
                animation: 'fadeInDown 0.35s ease-out',
            }}
        >
            <div style={{ flexShrink: 0, color: 'color-mix(in srgb, var(--blue) 70%, transparent)', display: 'flex', alignItems: 'center' }}>
                {icon || <Info size={16} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4, marginTop: 1 }}>{description}</div>
                {actions && actions.length > 0 && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                        {actions.map(function (a) {
                            return (
                                <a
                                    key={a.href}
                                    href={a.href}
                                    style={{ fontSize: 11, color: 'color-mix(in srgb, var(--blue) 80%, transparent)', textDecoration: 'none', fontWeight: 600 }}
                                >
                                    {a.label}
                                </a>
                            );
                        })}
                    </div>
                )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button
                    onClick={dismiss}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--muted)',
                        fontSize: 11,
                        cursor: 'pointer',
                        padding: '6px 8px',
                        whiteSpace: 'nowrap',
                        minHeight: 32,
                    }}
                >
                    Niet meer tonen
                </button>
                <button
                    onClick={dismiss}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--muted)',
                        cursor: 'pointer',
                        padding: 8,
                        display: 'flex',
                        alignItems: 'center',
                        minWidth: 32,
                        minHeight: 32,
                        justifyContent: 'center',
                    }}
                    aria-label="Sluiten"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
}
