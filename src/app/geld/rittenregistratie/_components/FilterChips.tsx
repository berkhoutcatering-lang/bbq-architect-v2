'use client';

import { useMemo } from 'react';
import {
  List,
  PartyPopper,
  ShoppingCart,
  HeartHandshake,
  Fuel,
  Home,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { Rit } from '@/types';
import { CATEGORIEEN, categoriseerRit, type Categorie } from '@/lib/ritten-aggregaties';

const ICONS: Record<string, LucideIcon> = {
  list: List,
  'party-popper': PartyPopper,
  'shopping-cart': ShoppingCart,
  'heart-handshake': HeartHandshake,
  fuel: Fuel,
  home: Home,
  'user-round': UserRound,
};

export type FilterValue = 'all' | Categorie;

interface Props {
  active: FilterValue;
  onChange: (f: FilterValue) => void;
  ritten: Rit[];
}

export default function FilterChips({ active, onChange, ritten }: Props) {
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: ritten.length };
    for (const cat of CATEGORIEEN) {
      c[cat.id] = ritten.filter((r) => categoriseerRit(r) === cat.id).length;
    }
    return c;
  }, [ritten]);

  const chips: { id: FilterValue; label: string; icon: string; color: string }[] = [
    { id: 'all', label: 'Alle ritten', icon: 'list', color: 'var(--brand)' },
    ...CATEGORIEEN.map((c) => ({ id: c.id as FilterValue, label: c.label, icon: c.icon, color: c.color })),
  ];

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
      {chips.map((c) => {
        const isActive = active === c.id;
        const Icon = ICONS[c.icon] || List;
        return (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '7px 12px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              border: '1px solid ' + (isActive ? c.color : 'var(--border)'),
              background: isActive
                ? `color-mix(in oklab, ${c.color} 14%, transparent)`
                : 'transparent',
              color: isActive ? c.color : 'var(--muted)',
              transition: '.15s',
              fontFamily: 'inherit',
            }}
            aria-pressed={isActive}
          >
            <Icon size={12} />
            {c.label}
            <span
              style={{
                fontSize: 10,
                fontVariantNumeric: 'tabular-nums',
                padding: '1px 6px',
                borderRadius: 999,
                background: isActive ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.04)',
              }}
            >
              {counts[c.id] || 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
