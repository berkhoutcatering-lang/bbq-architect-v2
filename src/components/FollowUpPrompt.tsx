'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle2, X, ChevronRight, Sparkles } from 'lucide-react';

export interface FollowUpAction {
    icon: string;
    label: string;
    href?: string;
    onClick?: () => void;
}

interface FollowUpPromptProps {
    title: string;
    actions: FollowUpAction[];
    onDismiss?: () => void;
    autoHideMs?: number;
}

export default function FollowUpPrompt({ title, actions, onDismiss, autoHideMs }: FollowUpPromptProps) {
    const [visible, setVisible] = useState(false);
    const [exiting, setExiting] = useState(false);

    useEffect(function () {
        // Animate in after a short delay
        const timer = setTimeout(function () { setVisible(true); }, 300);
        return function () { clearTimeout(timer); };
    }, []);

    useEffect(function () {
        if (autoHideMs && autoHideMs > 0) {
            const timer = setTimeout(function () { handleDismiss(); }, autoHideMs);
            return function () { clearTimeout(timer); };
        }
    }, [autoHideMs]);

    function handleDismiss() {
        setExiting(true);
        setTimeout(function () {
            if (onDismiss) onDismiss();
        }, 300);
    }

    function handleAction(action: FollowUpAction) {
        if (action.onClick) action.onClick();
        handleDismiss();
    }

    return (
        <div
            style={{
                position: 'fixed',
                bottom: 80,
                left: '50%',
                transform: visible && !exiting ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(20px)',
                opacity: visible && !exiting ? 1 : 0,
                zIndex: 1000,
                width: 'min(420px, calc(100vw - 32px))',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                pointerEvents: visible ? 'auto' : 'none',
            }}
        >
            <div
                style={{
                    background: 'linear-gradient(135deg, #1e1e22, #1a1a1e)',
                    border: '1px solid rgba(196, 163, 90, 0.2)',
                    borderRadius: 16,
                    padding: '16px 20px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(196,163,90,0.05)',
                    backdropFilter: 'blur(20px)',
                }}
            >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                            width: 28, height: 28, borderRadius: 8,
                            background: 'rgba(16, 185, 129, 0.12)',
                            border: '1px solid rgba(16, 185, 129, 0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#10b981' }}>{title}</span>
                    </div>
                    <button
                        onClick={handleDismiss}
                        aria-label="Sluiten"
                        style={{
                            background: 'none', border: 'none', color: 'var(--muted)',
                            cursor: 'pointer', padding: 8, borderRadius: 6,
                            minWidth: 44, minHeight: 44,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        <X size={16} aria-hidden="true" />
                    </button>
                </div>

                {/* Label */}
                <div style={{
                    fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const,
                    letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8,
                    display: 'flex', alignItems: 'center', gap: 6,
                }}>
                    <Sparkles size={10} style={{ color: '#c4a35a' }} />
                    Wat nu?
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                    {actions.map(function (action, idx) {
                        const content = (
                            <div
                                key={idx}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 14px', borderRadius: 10,
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid var(--border)',
                                    cursor: 'pointer', transition: 'all 0.15s',
                                    fontSize: 13, color: 'var(--text)', fontWeight: 500,
                                }}
                                onMouseEnter={function (e) {
                                    (e.currentTarget as HTMLElement).style.background = 'rgba(196,163,90,0.08)';
                                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(196,163,90,0.2)';
                                }}
                                onMouseLeave={function (e) {
                                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
                                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                                }}
                                onClick={function () { handleAction(action); }}
                            >
                                <span style={{ fontSize: 16, lineHeight: 1 }}>{action.icon}</span>
                                <span style={{ flex: 1 }}>{action.label}</span>
                                <ChevronRight size={14} style={{ color: 'var(--muted)' }} />
                            </div>
                        );

                        if (action.href) {
                            return (
                                <Link key={idx} href={action.href} onClick={function () { handleDismiss(); }} style={{ textDecoration: 'none' }}>
                                    {content}
                                </Link>
                            );
                        }
                        return content;
                    })}

                    {/* Skip button */}
                    <button
                        onClick={handleDismiss}
                        style={{
                            background: 'none', border: 'none', color: 'var(--muted)',
                            fontSize: 11, cursor: 'pointer', padding: '10px 0',
                            textAlign: 'center' as const, fontWeight: 500,
                            letterSpacing: '0.05em', minHeight: 36,
                        }}
                    >
                        Overslaan
                    </button>
                </div>
            </div>
        </div>
    );
}
