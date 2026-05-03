'use client';

import { Leaf, Sprout, Beef } from 'lucide-react';

interface CountMap {
  [key: string]: number;
}

interface Props {
  diet: CountMap; // bv. { Vegan: 4, Vegetarisch: 5, Vlees: 3 }
  allergens: CountMap; // bv. { Gluten: 4, Noten: 2, Lactose: 5, Soja: 2, Ei: 1 }
}

const DIET_CONFIG = [
  { key: 'Vegan', icon: Sprout, color: '#22c55e' },
  { key: 'Vegetarisch', icon: Leaf, color: '#22c55e' },
  { key: 'Vlees', icon: Beef, color: '#ef4444' },
];

export default function DietAllergensOverview({ diet, allergens }: Props) {
  // Hide if no data
  const totalDiet = Object.values(diet).reduce((s, n) => s + n, 0);
  const totalAllergens = Object.values(allergens).reduce((s, n) => s + n, 0);
  if (totalDiet === 0 && totalAllergens === 0) return null;

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '14px 18px',
        marginBottom: 22,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: '.22em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          fontWeight: 700,
          marginRight: 4,
        }}
      >
        Dieet & allergenen overzicht
      </div>

      {/* Diet pills (groen-getint) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {DIET_CONFIG.map(({ key, icon: Icon, color }) => {
          const count = diet[key] || 0;
          if (count === 0) return null;
          return (
            <span
              key={key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '5px 10px 5px 8px',
                borderRadius: 999,
                background: `color-mix(in oklab, ${color} 10%, transparent)`,
                border: `1px solid color-mix(in oklab, ${color} 28%, transparent)`,
                fontSize: 12,
                color: 'var(--text)',
                fontWeight: 500,
              }}
            >
              <Icon size={12} color={color} />
              {key}
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--muted)',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 600,
                }}
              >
                {count}
              </span>
            </span>
          );
        })}
      </div>

      {/* Separator */}
      {totalDiet > 0 && totalAllergens > 0 && (
        <div style={{ width: 1, height: 22, background: 'var(--border)' }} />
      )}

      {/* Allergen pills (rood-cirkel) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {Object.entries(allergens)
          .filter(([, n]) => n > 0)
          .map(([key, count]) => (
            <span
              key={key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px 5px 8px',
                borderRadius: 999,
                background: 'rgba(239,68,68,.06)',
                border: '1px solid rgba(239,68,68,.20)',
                fontSize: 12,
                color: 'var(--text)',
                fontWeight: 500,
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: 'rgba(239,68,68,.55)',
                  border: '1px solid rgba(239,68,68,.7)',
                }}
              />
              {key}
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--muted)',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 600,
                }}
              >
                {count}
              </span>
            </span>
          ))}
      </div>
    </div>
  );
}
