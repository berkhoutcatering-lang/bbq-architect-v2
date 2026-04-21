'use client';

import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
  Image, Type, User, BadgeCheck, Table, ChefHat, Calculator,
  CreditCard, Minus, ArrowDownUp, ImagePlus, PanelBottom, Thermometer,
  Search, Building2, FileText, DollarSign, Calendar, X,
  Square, Star, Stamp, Frame
} from 'lucide-react';
import type { BlockPaletteItem } from '@/types/template.types';
import { TEMPLATE_VARIABLES, CATEGORY_LABELS, type TemplateVariable } from '@/lib/templateVariables';

const ICON_MAP: Record<string, typeof Image> = {
  Image, Type, User, Badge: BadgeCheck, Table, ChefHat, Calculator,
  CreditCard, Minus, ArrowDownUp, ImagePlus, PanelBottom, Thermometer,
  Square, Star, Stamp, Frame,
};

const CATEGORY_LABEL_MAP: Record<string, string> = {
  layout: 'Layout',
  content: 'Inhoud',
  data: 'Data',
  special: 'Speciaal',
};

const VAR_CATEGORY_ICONS: Record<string, typeof Building2> = {
  bedrijf: Building2,
  klant: User,
  document: FileText,
  financieel: DollarSign,
  event: Calendar,
  menu: ChefHat,
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
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
        borderRadius: 6, cursor: 'grab', fontSize: 11, fontWeight: 500,
        background: 'var(--bg)', border: '1px solid var(--border)',
        color: 'var(--text)', opacity: isDragging ? 0.4 : 1,
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <Icon size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
      {item.label}
    </div>
  );
}

function DataFieldItem({ variable }: { variable: TemplateVariable }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'datafield-' + variable.key,
    data: { type: 'datafield', variable },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 6, padding: '5px 10px', borderRadius: 6, cursor: 'grab', fontSize: 11,
        background: 'var(--bg)', border: '1px solid var(--border)',
        color: 'var(--text)', opacity: isDragging ? 0.4 : 1,
        transition: 'border-color 0.15s',
      }}
    >
      <span style={{ fontWeight: 500 }}>{variable.label}</span>
      <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'monospace', flexShrink: 0 }}>
        {'{{'}{variable.key}{'}}'}
      </span>
    </div>
  );
}

interface Props {
  items: BlockPaletteItem[];
  documentType: string;
}

export default function BlockPalette({ items, documentType }: Props) {
  const [activeTab, setActiveTab] = useState<'components' | 'data'>('components');
  const [search, setSearch] = useState('');

  // Group components by category
  const groups: Record<string, BlockPaletteItem[]> = {};
  items.forEach(function (item) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  });

  // Filter and group data fields
  const filteredVars = TEMPLATE_VARIABLES.filter(function (v) {
    return v.availableIn.includes(documentType as TemplateVariable['availableIn'][0]);
  }).filter(function (v) {
    if (!search) return true;
    const q = search.toLowerCase();
    return v.label.toLowerCase().includes(q) || v.key.toLowerCase().includes(q);
  });

  const varGroups: Record<string, TemplateVariable[]> = {};
  filteredVars.forEach(function (v) {
    if (!varGroups[v.category]) varGroups[v.category] = [];
    varGroups[v.category].push(v);
  });

  // Filter components by search
  const filteredGroups: Record<string, BlockPaletteItem[]> = {};
  if (search) {
    const q = search.toLowerCase();
    Object.entries(groups).forEach(function ([cat, catItems]) {
      const filtered = catItems.filter(function (item) { return item.label.toLowerCase().includes(q); });
      if (filtered.length > 0) filteredGroups[cat] = filtered;
    });
  }

  return (
    <div style={{
      width: 220, flexShrink: 0, borderRight: '1px solid var(--border)',
      background: 'var(--card)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {[
          { id: 'components' as const, label: 'Componenten' },
          { id: 'data' as const, label: 'Data Velden' },
        ].map(function (tab) {
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={function () { setActiveTab(tab.id); setSearch(''); }}
              style={{
                flex: 1, padding: '8px 4px', fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.04em',
                border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                background: isActive ? 'var(--bg)' : 'transparent',
                color: isActive ? 'var(--brand)' : 'var(--muted)',
                borderBottom: isActive ? '2px solid var(--brand)' : '2px solid transparent',
              }}>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ padding: '8px 10px 4px', flexShrink: 0, position: 'relative' }}>
        <Search size={12} style={{ position: 'absolute', left: 18, top: 17, color: 'var(--muted)' }} />
        <input
          value={search}
          onChange={function (e) { setSearch(e.target.value); }}
          placeholder={activeTab === 'components' ? 'Zoek component...' : 'Zoek variabele...'}
          style={{
            width: '100%', padding: '5px 8px 5px 24px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: 'var(--text)', fontSize: 11, outline: 'none',
          }}
        />
        {search && (
          <button onClick={function () { setSearch(''); }}
            style={{ position: 'absolute', right: 18, top: 15, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}>
            <X size={12} />
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 12px' }}>
        {activeTab === 'components' && (
          <>
            {Object.entries(search ? filteredGroups : groups).map(function ([category, categoryItems]) {
              return (
                <div key={category} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5, padding: '4px 2px 0' }}>
                    {CATEGORY_LABEL_MAP[category] || category}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {categoryItems.map(function (item) {
                      return <PaletteItem key={item.type} item={item} />;
                    })}
                  </div>
                </div>
              );
            })}
            {search && Object.keys(filteredGroups).length === 0 && (
              <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                Geen resultaten
              </div>
            )}
          </>
        )}

        {activeTab === 'data' && (
          <>
            {Object.entries(varGroups).map(function ([category, vars]) {
              const CatIcon = VAR_CATEGORY_ICONS[category] || FileText;
              return (
                <div key={category} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5, padding: '4px 2px 0' }}>
                    <CatIcon size={10} />
                    {CATEGORY_LABELS[category] || category}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {vars.map(function (v) {
                      return <DataFieldItem key={v.key} variable={v} />;
                    })}
                  </div>
                </div>
              );
            })}
            {filteredVars.length === 0 && (
              <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                Geen resultaten
              </div>
            )}
            <div style={{ marginTop: 8, padding: '8px 2px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.5 }}>
              Sleep een data veld naar het canvas om automatisch een tekst-blok aan te maken.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
