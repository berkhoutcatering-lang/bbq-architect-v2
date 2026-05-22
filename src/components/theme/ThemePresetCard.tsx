'use client';

// Sprint 2-deel-2 — één preset-card in de picker.
// Toont mini-preview (bg + card-strip + primary-chip), audience-badge,
// preset-naam en contrast-verdict pill.

import { useMemo } from 'react';
import { getContrast } from '@/lib/contrast';
import type { ThemePreset } from '@/lib/branding';

interface Props {
  preset: ThemePreset;
  isSelected: boolean;
  onClick: () => void;
  onHover: () => void;
  onHoverEnd: () => void;
}

// Compact WCAG-verdict — gebruikt text/bg pair (de zwaarste body-check).
function contrastVerdict(preset: ThemePreset): { label: string; tone: 'good' | 'ok' | 'weak' } {
  const ratio = getContrast(preset.tokens.text, preset.tokens.bg);
  if (ratio >= 7) return { label: 'AAA leesbaar', tone: 'good' };
  if (ratio >= 4.5) return { label: 'AA leesbaar', tone: 'ok' };
  return { label: 'Lage contrast', tone: 'weak' };
}

export function ThemePresetCard({ preset, isSelected, onClick, onHover, onHoverEnd }: Props) {
  const verdict = useMemo(() => contrastVerdict(preset), [preset]);
  const verdictColor =
    verdict.tone === 'good' ? '#10b981'
      : verdict.tone === 'ok' ? '#84cc16'
        : '#f59e0b';

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      onFocus={onHover}
      onMouseLeave={onHoverEnd}
      onBlur={onHoverEnd}
      aria-pressed={isSelected}
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 14,
        overflow: 'hidden',
        background: 'var(--card)',
        border: isSelected
          ? `2px solid ${preset.tokens.primary}`
          : '1px solid var(--border)',
        transition: 'transform .15s ease, border-color .15s ease, box-shadow .15s ease',
        boxShadow: isSelected
          ? `0 0 0 4px color-mix(in oklch, ${preset.tokens.primary}, transparent 80%)`
          : '0 1px 2px rgba(0,0,0,.04)',
      }}
      onMouseDownCapture={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* Mini-preview surface */}
      <div
        aria-hidden
        style={{
          background: preset.tokens.bg,
          padding: 14,
          minHeight: 96,
          display: 'grid',
          gap: 8,
          alignContent: 'space-between',
        }}
      >
        <div
          style={{
            background: preset.tokens.card,
            borderRadius: 8,
            padding: '8px 10px',
            boxShadow: `0 1px 2px color-mix(in oklch, ${preset.tokens.text}, transparent 92%)`,
            display: 'grid',
            gap: 4,
          }}
        >
          <div style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: preset.tokens.primary,
          }}>Event</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: preset.tokens.text }}>
            BBQ Bruiloft Lars
          </div>
          <div style={{ fontSize: 10, color: preset.tokens.muted }}>vrij 18 jul · 80 pers</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <span style={{
            display: 'inline-block',
            padding: '3px 8px',
            borderRadius: 4,
            background: preset.tokens.primary,
            color: preset.mode === 'dark' ? preset.tokens.bg : '#fff',
            fontSize: 9,
            fontWeight: 700,
          }}>OFFERTE</span>
          <span style={{
            display: 'inline-block',
            padding: '3px 8px',
            borderRadius: 4,
            border: `1px solid ${preset.tokens.accent}`,
            color: preset.tokens.accent,
            fontSize: 9,
            fontWeight: 700,
          }}>FACTUUR</span>
        </div>
      </div>

      {/* Meta-block */}
      <div style={{ padding: '10px 14px 12px', display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            padding: '2px 6px',
            borderRadius: 3,
            background: 'color-mix(in oklch, var(--muted), transparent 88%)',
          }}>
            {preset.audience}
          </span>
          {isSelected && (
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.06em',
              color: preset.tokens.primary,
            }}>✓ ACTIEF</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            {preset.name}
          </span>
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '.06em',
            color: verdictColor,
            padding: '2px 6px',
            borderRadius: 3,
            background: `color-mix(in oklch, ${verdictColor}, transparent 88%)`,
            whiteSpace: 'nowrap',
          }}>{verdict.label}</span>
        </div>
      </div>
    </button>
  );
}
