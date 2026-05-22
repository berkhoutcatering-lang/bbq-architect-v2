'use client';

// Sprint 2-deel-3 C7 — top filter-pills voor de integraties-grid.
// Linear/Slack patroon: één-rij horizontale pills met active state.

import { CATEGORY_LABELS, type IntegrationCategory } from '@/lib/integrations';

export type FilterValue = IntegrationCategory | 'all';

interface Props {
  value: FilterValue;
  onChange: (next: FilterValue) => void;
  counts: Record<FilterValue, number>;
}

const FILTER_ORDER: FilterValue[] = [
  'all',
  'boekhouding',
  'communicatie',
  'betalingen',
  'data',
  'compliance',
];

export function CategoryFilter({ value, onChange, counts }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Filter integraties per categorie"
      style={{
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        marginBottom: 18,
      }}
    >
      {FILTER_ORDER.map(key => {
        const isActive = value === key;
        const label = key === 'all' ? 'Alles' : CATEGORY_LABELS[key];
        const count = counts[key] ?? 0;

        return (
          <button
            key={key}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(key)}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: `1px solid ${isActive ? 'var(--brand)' : 'var(--border)'}`,
              background: isActive
                ? 'color-mix(in oklch, var(--brand), transparent 85%)'
                : 'var(--card)',
              color: isActive ? 'var(--brand)' : 'var(--text)',
              fontWeight: isActive ? 700 : 500,
              fontSize: 12,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'background .1s, border-color .1s, color .1s',
            }}
          >
            {label}
            <span style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 6,
              background: isActive ? 'var(--brand)' : 'color-mix(in oklch, var(--muted), transparent 88%)',
              color: isActive ? '#fff' : 'var(--muted)',
              fontWeight: 600,
            }}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
