'use client';
import { createContext, useContext, useState, useCallback, useId, type ReactNode } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

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

function ConfirmDialogInner({ dialog, onConfirm, onCancel }: { dialog: DialogState; onConfirm: () => void; onCancel: () => void }) {
    const titleId = useId();
    const descId = useId();
    const trapRef = useFocusTrap(true);

    return (
        <div
            className="modal-bg"
            onClick={onCancel}
            role="presentation"
        >
            <div
                ref={trapRef}
                className="modal-box"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descId}
                onClick={function (e) { e.stopPropagation(); }}
            >
                <h3 id={titleId}>Bevestigen</h3>
                <p id={descId}>{dialog.msg}</p>
                <div className="modal-actions">
                    <button className="btn btn-ghost" onClick={onCancel}>Annuleren</button>
                    <button className="btn btn-red" onClick={onConfirm}>Verwijderen</button>
                </div>
            </div>
        </div>
    );
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
                <ConfirmDialogInner dialog={dialog} onConfirm={handleConfirm} onCancel={handleCancel} />
            )}
        </ConfirmContext.Provider>
    );
}
