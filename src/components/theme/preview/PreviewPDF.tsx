'use client';

// Sprint 2-deel-2 — mock offerte-PDF voor de theme picker.
// Gebruikt PDF-safe primary_print (altijd dark genoeg voor wit papier),
// niet de UI-primary die op dark-mode lichter is.

import type { ThemePreset } from '@/lib/branding';

interface Props {
  preset: ThemePreset;
}

export function PreviewPDF({ preset }: Props) {
  // PDF is altijd op wit papier — gebruik primary_print
  const { primary_print, accent } = preset.tokens;

  return (
    <div style={{
      // Papier-look met subtiele schaduw — onafhankelijk van app-theme
      background: '#ffffff',
      color: '#1a1a1a',
      borderRadius: 6,
      boxShadow: '0 4px 24px rgba(0,0,0,.12), 0 1px 2px rgba(0,0,0,.08)',
      overflow: 'hidden',
      minHeight: 340,
      fontFamily: 'Georgia, "Times New Roman", serif',
      padding: 26,
      display: 'grid',
      gap: 16,
      alignContent: 'start',
    }}>
      {/* Header met logo-placeholder + offerte-nummer */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingBottom: 14,
        borderBottom: `2px solid ${primary_print}`,
      }}>
        <div>
          <div style={{
            width: 44, height: 44, borderRadius: 4,
            background: primary_print, color: '#fff',
            display: 'grid', placeItems: 'center',
            fontSize: 11, fontWeight: 700, letterSpacing: '.06em',
            marginBottom: 6,
          }}>LOGO</div>
          <div style={{ fontSize: 11, color: '#444' }}>Hop &amp; Bites Catering</div>
          <div style={{ fontSize: 9, color: '#888' }}>KvK 12345678 · BTW NL000000000B01</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: 9, color: '#666', letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700,
          }}>Offerte</div>
          <div style={{ fontSize: 18, color: primary_print, fontWeight: 700, fontFamily: 'system-ui, sans-serif' }}>2026-001</div>
          <div style={{ fontSize: 9, color: '#666', marginTop: 2 }}>22 mei 2026</div>
        </div>
      </header>

      {/* Klantblok */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 3 }}>Aan</div>
          <div style={{ fontSize: 11, color: '#1a1a1a', fontWeight: 600 }}>Lars &amp; Anke de Vries</div>
          <div style={{ fontSize: 10, color: '#444' }}>Dorpsstraat 4, Schoonoord</div>
        </div>
        <div>
          <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 3 }}>Event</div>
          <div style={{ fontSize: 11, color: '#1a1a1a', fontWeight: 600 }}>BBQ Bruiloft · 80 personen</div>
          <div style={{ fontSize: 10, color: '#444' }}>vrijdag 18 juli 2026</div>
        </div>
      </div>

      {/* Pricing block */}
      <div style={{ display: 'grid', gap: 4 }}>
        {[
          { label: 'Signature Menu (8 gangen) × 80', amount: '€2.880,00' },
          { label: 'Pulled pork (extra portie)', amount: '€240,00' },
          { label: 'Service & opbouw (4 uur)', amount: '€680,00' },
        ].map(row => (
          <div key={row.label} style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 10, color: '#222',
            padding: '4px 0',
            borderBottom: '1px solid #eee',
            fontFamily: 'system-ui, sans-serif',
          }}>
            <span>{row.label}</span>
            <span>{row.amount}</span>
          </div>
        ))}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 13, fontWeight: 700,
          marginTop: 8,
          paddingTop: 8,
          borderTop: `2px solid ${primary_print}`,
          fontFamily: 'system-ui, sans-serif',
        }}>
          <span>Totaal incl. BTW</span>
          <span style={{ color: primary_print }}>€3.800,00</span>
        </div>
      </div>

      {/* Footer note */}
      <div style={{
        marginTop: 4,
        padding: 10,
        background: `color-mix(in srgb, ${accent}, transparent 92%)`,
        borderLeft: `3px solid ${accent}`,
        fontSize: 9,
        color: '#444',
        fontFamily: 'system-ui, sans-serif',
        lineHeight: 1.4,
      }}>
        Geldig tot 5 juni 2026. Aanbetaling 30% binnen 14 dagen. Resterend bedrag op event-datum.
      </div>
    </div>
  );
}
