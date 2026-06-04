'use client';

import { Drawer } from 'vaul';
import { AlertTriangle, Loader2, X } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: 'danger' | 'primary';
  pending?: boolean;
  onConfirm: () => void;
}

export default function ConfirmDrawer({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmVariant = 'danger',
  pending = false,
  onConfirm,
}: Props) {
  const accent = confirmVariant === 'danger' ? 'var(--red)' : 'var(--brand)';

  return (
    <Drawer.Root direction="right" open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Drawer.Content
          className="fixed top-0 right-0 bottom-0 z-50 flex flex-col w-full max-w-md"
          style={{
            background: 'var(--card)',
            borderLeft: '1px solid var(--border)',
          }}
        >
          <Drawer.Title className="sr-only">{title}</Drawer.Title>

          <header style={{ padding: 20, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: 'color-mix(in srgb, ' + accent + ' 10%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <AlertTriangle size={20} style={{ color: accent }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>{title}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{description}</div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Sluiten"
              style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4, flexShrink: 0 }}
            >
              <X size={18} />
            </button>
          </header>

          <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
            <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
              Deze actie kan {confirmVariant === 'danger' ? 'niet ongedaan worden gemaakt' : 'gevolgen hebben'}. Bevestig hieronder als je zeker bent.
            </p>
          </div>

          <footer style={{
            padding: 16, borderTop: '1px solid var(--border)',
            display: 'flex', gap: 8, justifyContent: 'flex-end',
          }}>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              style={{
                padding: '8px 16px', borderRadius: 8,
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: 13, fontWeight: 600,
                cursor: pending ? 'not-allowed' : 'pointer',
              }}
            >
              Annuleer
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8,
                background: accent, border: 'none',
                color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: pending ? 'not-allowed' : 'pointer',
                opacity: pending ? 0.7 : 1,
              }}
            >
              {pending && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
              {confirmLabel}
            </button>
          </footer>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
