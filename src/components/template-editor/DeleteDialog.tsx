'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

const dialogScrim: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 99999,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.5)',
};

const dialogStyle: React.CSSProperties = {
  background: 'var(--surface)', borderRadius: 8, padding: '20px 24px', maxWidth: 360,
  boxShadow: '0 8px 32px rgba(0,0,0,.45)',
  border: '1px solid var(--border-strong)',
};

const dialogCancelBtn: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 4, border: '1px solid var(--border-strong)',
  background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text)',
};

const dialogConfirmBtn: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 4, border: 'none',
  background: 'var(--danger)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
};

export default function DeleteDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(function () {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return function () {
      try { previousFocusRef.current?.focus(); } catch { /* noop */ }
    };
  }, []);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
    if (e.key === 'Enter' && document.activeElement === confirmRef.current) {
      e.preventDefault(); onConfirm(); return;
    }
    if (e.key === 'Tab') {
      const focusables = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[];
      if (focusables.length === 0) return;
      const idx = focusables.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      if (e.shiftKey) {
        const next = idx <= 0 ? focusables[focusables.length - 1] : focusables[idx - 1];
        next?.focus();
      } else {
        const next = idx === -1 || idx >= focusables.length - 1 ? focusables[0] : focusables[idx + 1];
        next?.focus();
      }
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      style={dialogScrim}
      onClick={onCancel}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-desc"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        onClick={function (e) { e.stopPropagation(); }}
        onKeyDown={handleKey}
        style={dialogStyle}
      >
        <h2 id="delete-dialog-title" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
          Blok verwijderen?
        </h2>
        <p id="delete-dialog-desc" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
          Dit kan ongedaan worden gemaakt met Ctrl+Z.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button ref={cancelRef} onClick={onCancel} style={dialogCancelBtn}>Annuleren</button>
          <button ref={confirmRef} onClick={onConfirm} style={dialogConfirmBtn}>Verwijderen</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
