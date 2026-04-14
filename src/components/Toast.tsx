'use client';
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type ShowToastFn = (msg: string, type?: string) => void;

interface ToastItem {
    id: number;
    msg: string;
    type: string;
}

const ToastContext = createContext<ShowToastFn | null>(null);

export function useToast(): ShowToastFn {
    const ctx = useContext(ToastContext);
    if (!ctx) return function () {};
    return ctx;
}

const typeConfig: Record<string, { icon: string; border: string; duration: number }> = {
    success: { icon: '\u2705', border: 'var(--green)', duration: 3000 },
    error: { icon: '\u274c', border: '#ef4444', duration: 8000 },
    warning: { icon: '\u26a0\ufe0f', border: '#f59e0b', duration: 6000 },
    info: { icon: '\ud83d\udca1', border: 'var(--muted)', duration: 4000 },
};

export default function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const showToast: ShowToastFn = useCallback(function (msg, type) {
        const id = Date.now() + Math.random();
        const resolvedType = type || 'info';
        const cfg = typeConfig[resolvedType] || typeConfig.info;
        setToasts(function (prev) { return prev.concat([{ id, msg, type: resolvedType }]); });
        setTimeout(function () {
            setToasts(function (prev) { return prev.filter(function (t) { return t.id !== id; }); });
        }, cfg.duration);
    }, []);

    return (
        <ToastContext.Provider value={showToast}>
            {children}
            <div
                role="status"
                aria-live="polite"
                aria-label="Meldingen"
                style={{
                    position: 'fixed',
                    top: '1.5rem',
                    right: '1.5rem',
                    zIndex: 9999,
                    display: 'flex',
                    flexDirection: 'column' as const,
                    gap: '0.5rem',
                    alignItems: 'flex-end',
                    pointerEvents: 'none' as const,
                }}
            >
                {toasts.map(function (t) {
                    const cfg = typeConfig[t.type] || typeConfig.info;
                    return (
                        <div key={t.id} role="alert" style={{
                            pointerEvents: 'all' as const,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            background: 'var(--card)',
                            border: '1px solid ' + cfg.border,
                            borderLeft: '4px solid ' + cfg.border,
                            borderRadius: '0.75rem',
                            padding: '0.75rem 1.25rem',
                            minWidth: '280px',
                            maxWidth: '480px',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                            animation: 'toastIn 0.25s ease',
                            backdropFilter: 'blur(8px)',
                        }}>
                            <span style={{ fontSize: '1.1rem', flexShrink: 0 }} aria-hidden="true">{cfg.icon}</span>
                            <span style={{ color: 'var(--text)', fontSize: '0.85rem', lineHeight: 1.4, flex: 1 }}>
                                {t.msg}
                            </span>
                            <button
                                onClick={function () {
                                    setToasts(function (prev) { return prev.filter(function (x) { return x.id !== t.id; }); });
                                }}
                                aria-label="Melding sluiten"
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--muted)',
                                    cursor: 'pointer',
                                    fontSize: '1rem',
                                    padding: '0 0.25rem',
                                    flexShrink: 0,
                                }}
                            >{'\u00d7'}</button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}
