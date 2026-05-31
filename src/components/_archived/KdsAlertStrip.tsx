'use client';

import { AlertTriangle, X } from 'lucide-react';

interface Props {
  message: string;
  severity?: 'critical' | 'warning' | 'info';
  onDismiss?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Alert-strip onder de top-bar — alleen zichtbaar bij actieve P0/P1 alert.
 * Critical = rood (allergeen), warning = amber (timing), info = blue (Rook tip).
 */
export default function KdsAlertStrip({ message, severity = 'warning', onDismiss, actionLabel, onAction }: Props) {
  const color =
    severity === 'critical' ? 'var(--red)' :
    severity === 'warning' ? 'var(--amber)' :
    'var(--blue)';

  return (
    <div
      className="kds-alert-strip"
      style={{
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        borderBottom: `2px solid ${color}`,
      }}
      role="alert"
    >
      <AlertTriangle size={18} style={{ color, flexShrink: 0 }} />
      <span className="kds-alert-strip__message" style={{ color: 'var(--text)' }}>{message}</span>
      {actionLabel && onAction && (
        <button onClick={onAction} className="kds-alert-strip__action" style={{ color, borderColor: color }}>
          {actionLabel}
        </button>
      )}
      {onDismiss && (
        <button onClick={onDismiss} className="kds-alert-strip__close" aria-label="Sluit alert">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
