'use client';
import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function useToast() {
    return useContext(ToastContext);
}

export default function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const showToast = useCallback(function (msg, type) {
        var id = Date.now();
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
