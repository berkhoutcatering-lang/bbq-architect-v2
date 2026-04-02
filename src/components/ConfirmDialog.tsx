'use client';
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type ShowConfirmFn = (msg: string, onConfirm: () => void) => void;

interface DialogState {
    msg: string;
    onConfirm: () => void;
}

const ConfirmContext = createContext<ShowConfirmFn | null>(null);

export function useConfirm(): ShowConfirmFn {
    const ctx = useContext(ConfirmContext);
    if (!ctx) return function () {};
    return ctx;
}

export default function ConfirmProvider({ children }: { children: ReactNode }) {
    const [dialog, setDialog] = useState<DialogState | null>(null);

    const showConfirm: ShowConfirmFn = useCallback(function (msg, onConfirm) {
        setDialog({ msg, onConfirm });
    }, []);

    function handleConfirm() {
        if (dialog && dialog.onConfirm) dialog.onConfirm();
        setDialog(null);
    }

    function handleCancel() {
        setDialog(null);
    }

    return (
        <ConfirmContext.Provider value={showConfirm}>
            {children}
            {dialog && (
                <div className="modal-bg" onClick={handleCancel}>
                    <div className="modal-box" onClick={function (e) { e.stopPropagation(); }}>
                        <h3>Bevestigen</h3>
                        <p>{dialog.msg}</p>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={handleCancel}>Annuleren</button>
                            <button className="btn btn-red" onClick={handleConfirm}>Verwijderen</button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
}
