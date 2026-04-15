'use client';
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, AlertTriangle, Info, RefreshCw, X } from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'sync';

export interface ToastAction {
    label: string;
    onClick: () => void;
}

export interface ToastOptions {
    type?: ToastType;
    title?: string;
    description?: string;
    action?: ToastAction;
    duration?: number;
    /** Undo-style toast: shows countdown, calls onUndo if clicked before expiry */
    undo?: { label?: string; onUndo: () => void };
}

interface ToastItem {
    id: number;
    type: ToastType;
    title?: string;
    message: string;
    action?: ToastAction;
    undo?: { label: string; onUndo: () => void };
    duration: number;
}

type ShowToastFn = {
    (msg: string, type?: string): void;
    (options: ToastOptions & { message: string }): void;
};

// ── Config ──────────────────────────────────────────────────────────────────

const typeConfig: Record<ToastType, { icon: typeof AlertCircle; border: string; duration: number }> = {
    success: { icon: CheckCircle2, border: 'var(--green)', duration: 3000 },
    error: { icon: AlertCircle, border: 'var(--red)', duration: 8000 },
    warning: { icon: AlertTriangle, border: 'var(--amber)', duration: 6000 },
    info: { icon: Info, border: 'var(--muted)', duration: 4000 },
    sync: { icon: RefreshCw, border: 'var(--blue)', duration: 0 },
};

// ── Context ─────────────────────────────────────────────────────────────────

const ToastContext = createContext<ShowToastFn | null>(null);

export function useToast(): ShowToastFn {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        const noop = function () {} as ShowToastFn;
        return noop;
    }
    return ctx;
}

// ── Provider ────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 4;

export default function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const removeToast = useCallback(function (id: number) {
        setToasts(function (prev) { return prev.filter(function (t) { return t.id !== id; }); });
    }, []);

    const showToast: ShowToastFn = useCallback(function (msgOrOpts: string | (ToastOptions & { message: string }), type?: string) {
        let item: ToastItem;

        if (typeof msgOrOpts === 'string') {
            // Simple API: showToast('message', 'type')
            const resolvedType = (type || 'info') as ToastType;
            const cfg = typeConfig[resolvedType] || typeConfig.info;
            item = {
                id: Date.now() + Math.random(),
                type: resolvedType,
                message: msgOrOpts,
                duration: cfg.duration,
            };
        } else {
            // Rich API: showToast({ message, type, title, action, undo, duration })
            const opts = msgOrOpts;
            const resolvedType = opts.type || 'info';
            const cfg = typeConfig[resolvedType] || typeConfig.info;
            item = {
                id: Date.now() + Math.random(),
                type: resolvedType,
                title: opts.title,
                message: opts.message,
                action: opts.action,
                undo: opts.undo ? { label: opts.undo.label || 'Ongedaan maken', onUndo: opts.undo.onUndo } : undefined,
                duration: opts.duration !== undefined ? opts.duration : cfg.duration,
            };
        }

        setToasts(function (prev) { return prev.concat([item]).slice(-MAX_VISIBLE); });

        if (item.duration > 0) {
            setTimeout(function () { removeToast(item.id); }, item.duration);
        }
    }, [removeToast]) as ShowToastFn;

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
                    maxWidth: '420px',
                    width: '92%',
                }}
            >
                {toasts.map(function (t) {
                    const cfg = typeConfig[t.type] || typeConfig.info;
                    const Icon = cfg.icon;
                    const isSync = t.type === 'sync';

                    return (
                        <div
                            key={t.id}
                            role={t.type === 'error' ? 'alert' : undefined}
                            style={{
                                pointerEvents: 'all' as const,
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '0.75rem',
                                background: 'var(--card)',
                                border: '1px solid ' + cfg.border,
                                borderLeft: '4px solid ' + cfg.border,
                                borderRadius: '0.75rem',
                                padding: '0.75rem 1rem',
                                width: '100%',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                                animation: 'toastIn 0.25s ease',
                                backdropFilter: 'blur(8px)',
                            }}
                        >
                            <Icon
                                size={18}
                                style={{
                                    color: cfg.border.startsWith('var(') ? cfg.border.replace('var(', '').replace(')', '') ? cfg.border : cfg.border : cfg.border,
                                    flexShrink: 0,
                                    marginTop: 1,
                                    animation: isSync ? 'spin 1s linear infinite' : undefined,
                                }}
                                aria-hidden="true"
                            />

                            <div style={{ flex: 1, minWidth: 0 }}>
                                {t.title && (
                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                                        {t.title}
                                    </div>
                                )}
                                <div style={{ color: 'var(--text)', fontSize: '0.8rem', lineHeight: 1.4 }}>
                                    {t.message}
                                </div>
                                {(t.action || t.undo) && (
                                    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                                        {t.action && (
                                            <button
                                                onClick={function () { t.action!.onClick(); removeToast(t.id); }}
                                                style={{
                                                    background: 'none',
                                                    border: '1px solid ' + cfg.border,
                                                    color: cfg.border.startsWith('var(') ? undefined : cfg.border,
                                                    borderRadius: 6,
                                                    padding: '4px 10px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    transition: 'background 0.15s',
                                                }}
                                            >
                                                {t.action.label}
                                            </button>
                                        )}
                                        {t.undo && (
                                            <button
                                                onClick={function () { t.undo!.onUndo(); removeToast(t.id); }}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: 'var(--brand)',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    padding: '4px 8px',
                                                    textDecoration: 'underline',
                                                    textUnderlineOffset: '2px',
                                                }}
                                            >
                                                {t.undo.label}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={function () { removeToast(t.id); }}
                                aria-label="Melding sluiten"
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--muted)',
                                    cursor: 'pointer',
                                    padding: '2px',
                                    flexShrink: 0,
                                    borderRadius: 4,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <X size={14} aria-hidden="true" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}
