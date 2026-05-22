'use client';

// Sprint 2-deel-2 — mock /q/[id] klantportaal preview.
// White-label-leak guard: deze preview gebruikt PRESET bg, niet hardcoded #111.

import type { ThemePreset } from '@/lib/branding';

interface Props {
  preset: ThemePreset;
}

export function PreviewPortal({ preset }: Props) {
  const { bg, card, text, muted, primary, accent, border } = preset.tokens;
  const onPrimaryText = preset.mode === 'dark' ? bg : '#ffffff';

  return (
    <div style={{
      background: `radial-gradient(140% 60% at 50% 0%, color-mix(in oklch, ${primary}, transparent 88%), transparent 65%), ${bg}`,
      color: text,
      borderRadius: 12,
      border: `1px solid ${border}`,
      overflow: 'hidden',
      minHeight: 340,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: 20,
      display: 'grid',
      gap: 14,
      alignContent: 'start',
    }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 6,
          background: card, border: `1px solid ${border}`,
          display: 'grid', placeItems: 'center',
          fontSize: 10, fontWeight: 700, color: primary,
        }}>LOGO</div>
        <div style={{ fontSize: 10, color: muted, textAlign: 'right' }}>
          Geldig tot 5 juni 2026
        </div>
      </header>

      {/* Hero */}
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '.1em',
          color: primary,
          textTransform: 'uppercase',
        }}>Offerte 2026-001</div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: text }}>
          BBQ Bruiloft Lars &amp; Anke
        </h2>
        <div style={{ fontSize: 11, color: muted }}>
          80 personen · vrijdag 18 juli · 17:00–22:00
        </div>
      </div>

      {/* Pricing card */}
      <div style={{
        background: card,
        borderRadius: 10,
        padding: 14,
        border: `1px solid ${border}`,
        display: 'grid',
        gap: 6,
      }}>
        {[
          { label: 'Signature Menu × 80', amount: '€2.880,00' },
          { label: 'Pulled pork (extra)', amount: '€240,00' },
          { label: 'Service & opbouw', amount: '€680,00' },
        ].map(row => (
          <div key={row.label} style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 11, color: text,
          }}>
            <span>{row.label}</span>
            <span style={{ fontWeight: 600 }}>{row.amount}</span>
          </div>
        ))}
        <div style={{
          height: 1, background: border, margin: '6px 0',
        }} />
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 13, color: text, fontWeight: 700,
        }}>
          <span>Totaal incl. BTW</span>
          <span style={{ color: primary }}>€3.800,00</span>
        </div>
      </div>

      {/* CTA */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" style={{
          flex: 1,
          padding: '11px 14px',
          borderRadius: 8,
          background: primary,
          color: onPrimaryText,
          border: 'none',
          fontWeight: 700,
          fontSize: 12,
          cursor: 'default',
        }}>Akkoord &amp; 30% aanbetalen via iDEAL</button>
        <button type="button" style={{
          padding: '11px 14px',
          borderRadius: 8,
          background: 'transparent',
          color: accent,
          border: `1px solid ${accent}`,
          fontWeight: 700,
          fontSize: 12,
          cursor: 'default',
        }}>Vragen?</button>
      </div>
    </div>
  );
}
