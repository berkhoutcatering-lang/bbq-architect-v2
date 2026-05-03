'use client';

import { Info } from 'lucide-react';

export default function HowItWorksStrip({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '14px 18px',
        background: 'linear-gradient(90deg, rgba(167,139,250,.06), rgba(167,139,250,.02))',
        border: '1px solid rgba(167,139,250,.20)',
        borderRadius: 12,
        marginBottom: 22,
        fontSize: 12.5,
        color: 'var(--muted)',
      }}
    >
      <Info size={16} color="#a78bfa" />
      <div style={{ flex: 1, lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Speelplaats, geen productie.</strong>{' '}
        Concepten staan los — pas wanneer jij op{' '}
        <span style={{ color: 'var(--brand)', fontWeight: 600 }}>&ldquo;Bewaar als concept&rdquo;</span> klikt landen
        ze in /gerechten met label{' '}
        <em style={{ color: '#c4b5fd', fontStyle: 'normal' }}>concept</em>. Niets komt automatisch in offertes of
        events.
      </div>
      <button
        onClick={onDismiss}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--muted)',
          fontSize: 11,
          opacity: 0.6,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Verbergen
      </button>
    </div>
  );
}
