'use client';

// Sprint 2-deel-2 — mock iPhone-frame preview met BottomNav + Vandaag-hub.
// Lars-persona-gate: 44px touch-targets check, theming op kleinere schermen.

import type { ThemePreset } from '@/lib/branding';

interface Props {
  preset: ThemePreset;
}

export function PreviewMobile({ preset }: Props) {
  const { bg, card, text, muted, primary, accent, border } = preset.tokens;
  const onPrimaryText = preset.mode === 'dark' ? bg : '#ffffff';

  const navItems = [
    { icon: '⌂', label: 'Vandaag', active: true },
    { icon: '◫', label: 'Plannen', active: false },
    { icon: '€', label: 'Geld', active: false },
    { icon: '▤', label: 'Meer', active: false },
  ];

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 8, minHeight: 340 }}>
      <div style={{
        // iPhone-frame
        width: 260,
        background: '#0a0a0a',
        borderRadius: 32,
        padding: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,.2)',
      }}>
        {/* Screen */}
        <div style={{
          background: bg,
          color: text,
          borderRadius: 24,
          overflow: 'hidden',
          minHeight: 460,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
          {/* Notch */}
          <div style={{
            display: 'flex', justifyContent: 'center', padding: '4px 0',
          }}>
            <div style={{
              width: 60, height: 6, background: '#0a0a0a', borderRadius: 3,
            }} />
          </div>

          {/* Header */}
          <header style={{ padding: '8px 14px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: text }}>Vandaag</h2>
            <span style={{ fontSize: 9, color: muted }}>22 mei</span>
          </header>

          {/* Next event card */}
          <div style={{ padding: '8px 14px', flex: 1 }}>
            <div style={{
              background: card,
              borderRadius: 10,
              padding: 12,
              border: `1px solid ${border}`,
              display: 'grid',
              gap: 4,
              marginBottom: 8,
            }}>
              <div style={{
                fontSize: 8, fontWeight: 700, letterSpacing: '.08em',
                color: primary, textTransform: 'uppercase',
              }}>Volgend event</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: text }}>
                BBQ Bruiloft Lars
              </div>
              <div style={{ fontSize: 9, color: muted }}>80 pers · 18 jul</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {['4 offertes', '€2.341 marge'].map(s => (
                <div key={s} style={{
                  background: card,
                  borderRadius: 8,
                  padding: 8,
                  border: `1px solid ${border}`,
                  fontSize: 9, color: muted,
                }}>{s}</div>
              ))}
            </div>
            <button type="button" style={{
              width: '100%',
              marginTop: 10,
              padding: '11px 0',
              borderRadius: 8,
              background: primary,
              color: onPrimaryText,
              border: 'none',
              fontWeight: 700, fontSize: 11,
              cursor: 'default',
            }}>+ Nieuwe offerte</button>
            <div style={{ marginTop: 6, fontSize: 9, color: accent, textAlign: 'center' }}>
              of importeer via WhatsApp
            </div>
          </div>

          {/* BottomNav */}
          <nav style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            borderTop: `1px solid ${border}`,
            background: card,
            padding: '6px 0 10px',
          }}>
            {navItems.map(n => (
              <div key={n.label} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 2,
                color: n.active ? primary : muted,
                fontWeight: n.active ? 700 : 500,
              }}>
                <span style={{ fontSize: 16 }}>{n.icon}</span>
                <span style={{ fontSize: 9 }}>{n.label}</span>
              </div>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
