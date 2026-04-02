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

export default function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const showToast: ShowToastFn = useCallback(function (msg, type) {
        const id = Date.now();
        setToasts(function (prev) { return prev.concat([{ id, msg, type: type || 'info' }]); });
        setTimeout(function () {
            setToasts(function (prev) { return prev.filter(function (t) { return t.id !== id; }); });
        }, 3000);
    }, []);

    return (
        <ToastContext.Provider value={showToast}>
            {children}
            <div className="toast-wrap">
                {toasts.map(function (t) {
                    return <div key={t.id} className={'toast toast-' + t.type}>
                        <i className={'fa-solid ' + (t.type === 'success' ? 'fa-check-circle' : t.type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle')}></i>
                        {t.msg}
                    </div>;
                })}
            </div>
        </ToastContext.Provider>
    );
}
