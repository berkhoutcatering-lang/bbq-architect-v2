'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Check, Loader2, Clock, ChevronRight, X, Sparkles } from 'lucide-react';

export interface CascadeStep {
    id: string;
    label: string;
    status: 'pending' | 'in_progress' | 'completed' | 'error';
    detail?: string;
    href?: string;
}

interface SyncCascadeProps {
    title: string;
    steps: CascadeStep[];
    onClose?: () => void;
    autoClose?: number;
}

export default function SyncCascade({ title, steps, onClose, autoClose }: SyncCascadeProps) {
    const [visible, setVisible] = useState(false);
    const [exiting, setExiting] = useState(false);

    useEffect(function () {
        const timer = setTimeout(function () { setVisible(true); }, 100);
        return function () { clearTimeout(timer); };
    }, []);

    useEffect(function () {
        if (autoClose && steps.every(function (s) { return s.status === 'completed'; })) {
            const timer = setTimeout(function () { handleClose(); }, autoClose);
            return function () { clearTimeout(timer); };
        }
    }, [autoClose, steps]);

    function handleClose() {
        setExiting(true);
        setTimeout(function () { if (onClose) onClose(); }, 300);
    }

    const completedCount = steps.filter(function (s) { return s.status === 'completed'; }).length;
    const allDone = completedCount === steps.length;

    return (
        <div
            style={{
                position: 'fixed',
                top: 80,
                right: 20,
                zIndex: 999,
                width: 'min(380px, calc(100vw - 40px))',
                opacity: visible && !exiting ? 1 : 0,
                transform: visible && !exiting ? 'translateX(0)' : 'translateX(20px)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                pointerEvents: visible ? 'auto' : 'none',
            }}
        >
            <div style={{
                background: 'linear-gradient(135deg, #1e1e22, #1a1a1e)',
                border: allDone ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(196,163,90,0.2)',
                borderRadius: 16,
                padding: '16px 20px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Sparkles size={14} style={{ color: allDone ? '#10b981' : '#c4a35a' }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: allDone ? '#10b981' : '#c4a35a' }}>
                            {title}
                        </span>
                    </div>
                    <button
                        onClick={handleClose}
                        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}
                    >
                        <X size={14} />
                    </button>
                </div>

                {/* Steps */}
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
                    {steps.map(function (step, idx) {
                        const icon = step.status === 'completed' ? (
                            <Check size={12} style={{ color: '#10b981' }} />
                        ) : step.status === 'in_progress' ? (
                            <Loader2 size={12} style={{ color: '#c4a35a', animation: 'spin 1s linear infinite' }} />
                        ) : step.status === 'error' ? (
                            <X size={12} style={{ color: '#ef4444' }} />
                        ) : (
                            <Clock size={12} style={{ color: 'var(--muted)' }} />
                        );

                        const textColor = step.status === 'completed' ? '#10b981'
                            : step.status === 'in_progress' ? 'white'
                            : step.status === 'error' ? '#ef4444'
                            : 'var(--muted)';

                        const content = (
                            <div
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 10px', borderRadius: 8,
                                    background: step.status === 'in_progress' ? 'rgba(196,163,90,0.05)' : 'transparent',
                                    opacity: step.status === 'pending' ? 0.5 : 1,
                                    transition: 'all 0.3s',
                                    animationDelay: (idx * 200) + 'ms',
                                }}
                                className={step.status === 'completed' ? 'animate-[fadeInUp_0.3s_ease-out_forwards]' : ''}
                            >
                                <div style={{
                                    width: 22, height: 22, borderRadius: 6,
                                    background: step.status === 'completed' ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.03)',
                                    border: step.status === 'completed' ? '1px solid rgba(16,185,129,0.2)' : '1px solid var(--border)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                }}>
                                    {icon}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <span style={{ fontSize: 12, fontWeight: 500, color: textColor }}>
                                        {step.label}
                                    </span>
                                    {step.detail && (
                                        <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 6 }}>
                                            {step.detail}
                                        </span>
                                    )}
                                </div>
                                {step.href && step.status === 'completed' && (
                                    <ChevronRight size={12} style={{ color: 'var(--muted)' }} />
                                )}
                            </div>
                        );

                        if (step.href && step.status === 'completed') {
                            return (
                                <Link key={step.id} href={step.href} style={{ textDecoration: 'none' }}>
                                    {content}
                                </Link>
                            );
                        }
                        return <div key={step.id}>{content}</div>;
                    })}
                </div>

                {/* Connection lines between steps */}
                <style jsx>{`
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        </div>
    );
}
