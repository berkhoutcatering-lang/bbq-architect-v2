'use client';

// Sprint 2-deel-2 — master preset picker.
// 2-koloms layout: links 8 preset cards (4×2 grid op desktop), rechts sticky preview.
// Hover op card schakelt preview; klik bevestigt selectie. Save pas via "Opslaan"-knop.

import { useState, useMemo } from 'react';
import { THEME_PRESETS, findPreset, type ThemePreset } from '@/lib/branding';
import { ThemePresetCard } from './ThemePresetCard';
import { ThemePreviewTabs } from './ThemePreviewTabs';

interface Props {
  currentPresetId: string | null;
  onChange: (presetId: string) => void;
}

export function ThemePresetPicker({ currentPresetId, onChange }: Props) {
  // Selected = wat de user actueel zou opslaan (initialiseert op currentPresetId of eerste preset)
  const [selectedId, setSelectedId] = useState<string>(
    currentPresetId && findPreset(currentPresetId) ? currentPresetId : THEME_PRESETS[0].id,
  );
  // Hover = wat de preview NU toont (transient, niet opgeslagen)
  const [hoverId, setHoverId] = useState<string | null>(null);

  const displayed: ThemePreset = useMemo(() => {
    return findPreset(hoverId ?? selectedId) ?? THEME_PRESETS[0];
  }, [hoverId, selectedId]);

  function handleSelect(id: string) {
    setSelectedId(id);
    onChange(id);
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1.4fr) minmax(320px, 1fr)',
      gap: 20,
      alignItems: 'start',
    }}>
      {/* Left column — preset cards */}
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
          Kies een thema. Hover om de preview rechts te wisselen tussen <strong>app</strong>,{' '}
          <strong>klantportaal</strong>, <strong>PDF</strong> en <strong>mobile</strong>. Klik om te selecteren,
          klik dan onderaan op &quot;Opslaan&quot; om toe te passen.
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12,
        }}>
          {THEME_PRESETS.map(preset => (
            <ThemePresetCard
              key={preset.id}
              preset={preset}
              isSelected={selectedId === preset.id}
              onClick={() => handleSelect(preset.id)}
              onHover={() => setHoverId(preset.id)}
              onHoverEnd={() => setHoverId(null)}
            />
          ))}
        </div>
      </div>

      {/* Right column — sticky preview */}
      <aside style={{
        position: 'sticky',
        top: 16,
        display: 'grid',
        gap: 10,
        paddingTop: 4,
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            Preview: {displayed.name}
          </h3>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>
            {displayed.audience}
          </span>
        </div>
        <ThemePreviewTabs preset={displayed} />
      </aside>
    </div>
  );
}
