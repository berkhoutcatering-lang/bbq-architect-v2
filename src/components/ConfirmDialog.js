'use client';
import { createContext, useContext, useState, useCallback } from 'react';

const ConfirmContext = createContext(null);

export function useConfirm() {
    return useContext(ConfirmContext);
}

export default function ConfirmProvider({ children }) {
    const [dialog, setDialog] = useState(null);

    const showConfirm = useCallback(function (msg, onConfirm) {
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
