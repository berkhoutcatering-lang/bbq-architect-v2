'use client';
import React, { useEffect, useCallback, useId } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface SlideOverPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}

const WIDTH_MAP = {
  sm: '400px',
  md: '520px',
  lg: '680px',
  xl: '860px',
};

export default function SlideOverPanel({ isOpen, onClose, title, subtitle, width = 'md', children }: SlideOverPanelProps) {
  const titleId = useId();
  const subtitleId = useId();
  const trapRef = useFocusTrap(isOpen);

  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEsc]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="slide-over-backdrop"
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 200,
          animation: 'fadeIn .2s ease',
        }}
      />

      {/* Panel */}
      <div
        ref={trapRef}
        className="slide-over-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          maxWidth: WIDTH_MAP[width],
          background: 'var(--color-bg-deep)',
          borderLeft: '1px solid rgba(130,130,130,.12)',
          zIndex: 201,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight .3s ease',
          boxShadow: '-8px 0 32px rgba(0,0,0,.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <div>
            <h3 id={titleId} style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{title}</h3>
            {subtitle && <p id={subtitleId} style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Sluiten"
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              width: 44,
              height: 44,
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              transition: 'all .15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--muted)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
