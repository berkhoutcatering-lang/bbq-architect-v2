'use client';

// Sprint 2-deel-2 — mock app preview voor de theme picker.
// Toont sidebar + page-header + HubCard + button-row, allemaal puur inline-styled
// vanaf preset.tokens. Geen externe CSS, geen DB-call. Pure render.

import type { ThemePreset } from '@/lib/branding';

interface Props {
  preset: ThemePreset;
}

export function PreviewApp({ preset }: Props) {
  const { bg, card, text, muted, primary, accent, border } = preset.tokens;
  const onPrimaryText = preset.mode === 'dark' ? bg : '#ffffff';

  const navItems = ['Vandaag', 'Plannen', 'Verkoop', 'Keuken', 'Voorraad', 'Geld'];

  return (
    <div style={{
      background: bg,
      color: text,
      borderRadius: 12,
      border: `1px solid ${border}`,
      overflow: 'hidden',
      display: 'grid',
      gridTemplateColumns: '140px 1fr',
      minHeight: 340,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Sidebar */}
      <aside style={{
        background: card,
        borderRight: `1px solid ${border}`,
        padding: '12px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}>
        <div style={{
          padding: '8px 10px',
          marginBottom: 8,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.08em',
          color: primary,
        }}>
          BBQ ARCHITECT
        </div>
        {navItems.map((item, i) => (
          <div key={item} style={{
            padding: '7px 10px',
            borderRadius: 6,
            fontSize: 12,
            color: i === 0 ? text : muted,
            background: i === 0 ? `color-mix(in oklch, ${primary}, transparent 88%)` : 'transparent',
            fontWeight: i === 0 ? 600 : 500,
            position: 'relative',
          }}>
            {i === 0 && (
              <span style={{
                position: 'absolute',
                left: 0,
                top: 8,
                bottom: 8,
                width: 2,
                background: primary,
                borderRadius: 1,
              }} />
            )}
            {item}
          </div>
        ))}
      </aside>

      {/* Main area */}
      <main style={{ padding: 16, display: 'grid', gap: 12, alignContent: 'start' }}>
        {/* Page header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            color: text,
          }}>Vandaag</h2>
          <span style={{ fontSize: 10, color: muted }}>vrijdag 22 mei</span>
        </header>

        {/* HubCard */}
        <div style={{
          background: card,
          borderRadius: 10,
          padding: 12,
          border: `1px solid ${border}`,
          display: 'grid',
          gap: 6,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '.08em',
              color: primary,
              textTransform: 'uppercase',
            }}>Volgend event</span>
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 3,
              background: `color-mix(in oklch, ${accent}, transparent 80%)`,
              color: accent,
            }}>over 26 dagen</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: text }}>
            BBQ Bruiloft Lars &amp; Anke
          </div>
          <div style={{ fontSize: 11, color: muted }}>80 personen · Signature Menu</div>
        </div>

        {/* Stat-tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { label: 'Open offertes', value: '4' },
            { label: 'Marge MTD', value: '€2.341' },
            { label: 'Te factureren', value: '€1.820' },
          ].map(stat => (
            <div key={stat.label} style={{
              background: card,
              borderRadius: 8,
              padding: '8px 10px',
              border: `1px solid ${border}`,
            }}>
              <div style={{ fontSize: 10, color: muted, marginBottom: 2 }}>{stat.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: text }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Buttons row */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" style={{
            padding: '8px 14px',
            borderRadius: 6,
            background: primary,
            color: onPrimaryText,
            border: 'none',
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '.02em',
            cursor: 'default',
          }}>+ Nieuwe offerte</button>
          <button type="button" style={{
            padding: '8px 14px',
            borderRadius: 6,
            background: 'transparent',
            color: accent,
            border: `1px solid ${accent}`,
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '.02em',
            cursor: 'default',
          }}>Importeer klant</button>
        </div>
      </main>
    </div>
  );
}
