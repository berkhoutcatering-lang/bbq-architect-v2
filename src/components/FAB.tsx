'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, X, PartyPopper, ScanLine, Bot } from 'lucide-react';

/**
 * Floating Action Button — desktop+tablet alleen.
 * Twee shortcuts altijd binnen handbereik: nieuw event aanmaken of een bon scannen.
 * Verbergt zich op mobiel omdat BottomNav daar al primaire acties biedt.
 */
export default function FAB() {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="fab-root"
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        zIndex: 80,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 12,
        pointerEvents: 'none',
      }}
    >
      {open && (
        <>
          <Link
            href="/inkoop"
            onClick={() => setOpen(false)}
            style={{
              pointerEvents: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 16px',
              borderRadius: 999,
              background: 'var(--card-solid)',
              border: '1px solid var(--border-strong)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              color: 'var(--text)',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 600,
              animation: 'fabFadeIn 0.15s ease',
            }}
          >
            <ScanLine size={16} style={{ color: 'var(--brand)' }} />
            Bon scannen
          </Link>
          <Link
            href="/events"
            onClick={() => setOpen(false)}
            style={{
              pointerEvents: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 16px',
              borderRadius: 999,
              background: 'var(--card-solid)',
              border: '1px solid var(--border-strong)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              color: 'var(--text)',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 600,
              animation: 'fabFadeIn 0.15s ease',
            }}
          >
            <PartyPopper size={16} style={{ color: 'var(--brand)' }} />
            Nieuw event
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new CustomEvent('open-chat'));
            }}
            style={{
              pointerEvents: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 16px',
              borderRadius: 999,
              background: 'var(--card-solid)',
              border: '1px solid var(--border-strong)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              color: 'var(--text)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              animation: 'fabFadeIn 0.15s ease',
            }}
          >
            <Bot size={16} style={{ color: 'var(--brand)' }} />
            Vraag Rook
          </button>
        </>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Sluit snelle acties' : 'Open snelle acties'}
        aria-expanded={open}
        style={{
          pointerEvents: 'auto',
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--brand)',
          color: '#0a0a0c',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(196,163,90,0.45), 0 2px 6px rgba(0,0,0,0.3)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 150ms ease, box-shadow 150ms ease',
          transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
        }}
      >
        {open ? <X size={22} /> : <Plus size={22} />}
      </button>
      <style jsx>{`
        @keyframes fabFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 768px) {
          .fab-root { display: none; }
        }
      `}</style>
    </div>
  );
}
