'use client';

import { useDraggable } from '@dnd-kit/core';
import {
  Image, Type, User, BadgeCheck, Table, ChefHat, Calculator,
  CreditCard, Minus, ArrowDownUp, ImagePlus, PanelBottom, Thermometer
} from 'lucide-react';
import type { BlockPaletteItem } from '@/types/template.types';

const ICON_MAP: Record<string, typeof Image> = {
  Image, Type, User, Badge: BadgeCheck, Table, ChefHat, Calculator,
  CreditCard, Minus, ArrowDownUp, ImagePlus, PanelBottom, Thermometer,
};

const CATEGORY_LABELS: Record<string, string> = {
  layout: 'Layout',
  content: 'Inhoud',
  data: 'Data',
  special: 'Speciaal',
};

function PaletteItem({ item }: { item: BlockPaletteItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'palette-' + item.type,
  });

  const Icon = ICON_MAP[item.icon] || Type;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
        borderRadius: 8, cursor: 'grab', fontSize: 12, fontWeight: 500,
        background: 'var(--bg)', border: '1px solid var(--border)',
        color: 'var(--text)', opacity: isDragging ? 0.4 : 1,
        transition: 'border-color 0.15s',
      }}
    >
      <Icon size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
      {item.label}
    </div>
  );
}

export default function BlockPalette({ items }: { items: BlockPaletteItem[] }) {
  // Group by category
  const groups: Record<string, BlockPaletteItem[]> = {};
  items.forEach(function (item) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  });

  return (
    <div style={{
      width: 180, flexShrink: 0, borderRight: '1px solid var(--border)',
      background: 'var(--card)', padding: '16px 10px', overflowY: 'auto',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, padding: '0 2px' }}>
        Blokken
      </div>

      {Object.entries(groups).map(function ([category, categoryItems]) {
        return (
          <div key={category} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, padding: '0 2px' }}>
              {CATEGORY_LABELS[category] || category}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {categoryItems.map(function (item) {
                return <PaletteItem key={item.type} item={item} />;
              })}
            </div>
          </div>
        );
      })}

      <div style={{ fontSize: 10, color: 'var(--muted)', padding: '12px 2px 0', borderTop: '1px solid var(--border)', lineHeight: 1.5 }}>
        Sleep een blok naar het canvas om het toe te voegen.
      </div>
    </div>
  );
}
