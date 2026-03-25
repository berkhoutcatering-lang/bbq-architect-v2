'use client';
// ─── Global Toast / Notification Bus ─────────────────────────────────────────
// Luistert naar AppContext notifications en toont ze als branded toasts.
// Automatisch ingebouwd in layout.js.

import { useApp } from '@/lib/AppContext';

var typeConfig = {
    success: { icon: '✅', border: 'var(--brand)', label: 'Succes' },
    error: { icon: '❌', border: '#ef4444', label: 'Fout' },
    warning: { icon: '⚠️', border: '#f59e0b', label: 'Let op' },
    info: { icon: '💡', border: 'var(--muted)', label: 'Info' },
    sync: { icon: '🔄', border: '#3b82f6', label: 'Sync' },
};

export default function GlobalToast() {
    var { notifications, dismissNotification } = useApp();

    if (!notifications || notifications.length === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '1.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            alignItems: 'center',
            pointerEvents: 'none',
        }}>
            {notifications.map(function (n) {
                var cfg = typeConfig[n.type] || typeConfig.info;
                return (
                    <div key={n.id} style={{
                        pointerEvents: 'all',
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
                        animation: 'slideUp 0.25s ease',
                        backdropFilter: 'blur(8px)',
                    }}>
                        <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{cfg.icon}</span>
                        <span style={{ color: 'var(--text)', fontSize: '0.875rem', lineHeight: 1.4, flex: 1 }}>
                            {n.message}
                        </span>
                        <button
                            onClick={function () { dismissNotification(n.id); }}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--muted)',
                                cursor: 'pointer',
                                fontSize: '1rem',
                                padding: '0 0.25rem',
                                flexShrink: 0,
                            }}
                        >×</button>
                    </div>
                );
            })}
            <style>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(12px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
