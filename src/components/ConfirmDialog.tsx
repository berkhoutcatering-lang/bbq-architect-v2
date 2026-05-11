'use client';
import { createContext, useContext, useState, useCallback, useId, type ReactNode } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

/**
 * useConfirm — supports two APIs:
 *
 * Legacy (callback): confirm("Verwijderen?", () => doDelete())
 * Promise:           const ok = await confirm({ title, description, confirmText, danger })
 *                    if (!ok) return
 *
 * Both work side-by-side. Migration is optional.
 */

export interface ConfirmOptions {
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
}

type ConfirmInput = string | ConfirmOptions;

type ShowConfirmFn = {
    (msg: string, onConfirm: () => void): void;
    (options: ConfirmOptions): Promise<boolean>;
};

interface DialogState {
    title: string;
    description?: string;
    confirmText: string;
    cancelText: string;
    danger: boolean;
    onResolve: (ok: boolean) => void;
}

const ConfirmContext = createContext<ShowConfirmFn | null>(null);

const noop: any = function () { /* fallback when context not mounted */ };

export function useConfirm(): ShowConfirmFn {
    const ctx = useContext(ConfirmContext);
    if (!ctx) return noop;
    return ctx;
}

function ConfirmDialogInner({ dialog, onConfirm, onCancel }: {
    dialog: DialogState;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const titleId = useId();
    const descId = useId();
    const trapRef = useFocusTrap(true);

    return (
        <div className="modal-bg" onClick={onCancel} role="presentation">
            <div
                ref={trapRef}
                className="modal-box"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descId}
                onClick={function (e) { e.stopPropagation(); }}
            >
                <h3 id={titleId}>{dialog.title}</h3>
                {dialog.description && <p id={descId}>{dialog.description}</p>}
                <div className="modal-actions">
                    <button className="btn btn-ghost" onClick={onCancel}>{dialog.cancelText}</button>
                    <button className={'btn ' + (dialog.danger ? 'btn-red' : 'btn-primary')} onClick={onConfirm}>
                        {dialog.confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ConfirmProvider({ children }: { children: ReactNode }) {
    const [dialog, setDialog] = useState<DialogState | null>(null);

    const showConfirm = useCallback(function (input: ConfirmInput, onConfirmCb?: () => void): void | Promise<boolean> {
        if (typeof input === 'string') {
            // Legacy callback API
            setDialog({
                title: 'Bevestigen',
                description: input,
                confirmText: 'Verwijderen',
                cancelText: 'Annuleren',
                danger: true,
                onResolve: function (ok) { if (ok && onConfirmCb) onConfirmCb(); },
            });
            return;
        }
        // Promise API
        return new Promise<boolean>(function (resolve) {
            setDialog({
                title: input.title,
                description: input.description,
                confirmText: input.confirmText || 'Bevestigen',
                cancelText: input.cancelText || 'Annuleren',
                danger: input.danger ?? false,
                onResolve: resolve,
            });
        });
    }, []) as ShowConfirmFn;

    function handleConfirm() {
        if (dialog) dialog.onResolve(true);
        setDialog(null);
    }

    function handleCancel() {
        if (dialog) dialog.onResolve(false);
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
