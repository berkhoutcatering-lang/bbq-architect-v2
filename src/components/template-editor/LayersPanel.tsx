'use client';

import {
  Eye, EyeOff, Copy, Trash2, GripVertical, ChevronUp, ChevronDown,
  Image, Type, User, BadgeCheck, Table, ChefHat, Calculator,
  CreditCard, Minus, ArrowDownUp, ImagePlus, PanelBottom, Thermometer
} from 'lucide-react';
import type { TemplateBlock } from '@/types/template.types';

const ICON_MAP: Record<string, typeof Image> = {
  logo: Image, text: Type, client_info: User, document_badge: BadgeCheck,
  items_table: Table, menu: ChefHat, totals: Calculator, payment_details: CreditCard,
  divider: Minus, spacer: ArrowDownUp, image: ImagePlus, footer: PanelBottom,
  haccp_table: Thermometer,
};

const LABEL_MAP: Record<string, string> = {
  logo: 'Logo', text: 'Tekst', client_info: 'Klantgegevens', document_badge: 'Badge',
  items_table: 'Items Tabel', menu: 'Menu', totals: 'Totalen', payment_details: 'Betaling',
  divider: 'Lijn', spacer: 'Ruimte', image: 'Afbeelding', footer: 'Footer',
  haccp_table: 'HACCP Tabel',
};

interface Props {
  blocks: TemplateBlock[];
  selectedBlockId: string | null;
  hiddenBlockIds: Set<string>;
  onSelectBlock: (id: string | null) => void;
  onToggleVisibility: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveBlock: (id: string, direction: 'up' | 'down') => void;
}

export default function LayersPanel({
  blocks, selectedBlockId, hiddenBlockIds,
  onSelectBlock, onToggleVisibility, onDuplicate, onDelete, onMoveBlock
}: Props) {
  return (
    <div style={{
      borderBottom: '1px solid var(--border)', maxHeight: 240, overflowY: 'auto',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, background: 'var(--card)', zIndex: 2,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Lagen
        </span>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{blocks.length}</span>
      </div>

      {blocks.length === 0 && (
        <div style={{ padding: '16px 12px', fontSize: 11, color: 'var(--muted)', textAlign: 'center', fontStyle: 'italic' }}>
          Geen blokken
        </div>
      )}

      {blocks.map(function (block, index) {
        const Icon = ICON_MAP[block.type] || Type;
        const isSelected = block.id === selectedBlockId;
        const isHidden = hiddenBlockIds.has(block.id);
        const label = LABEL_MAP[block.type] || block.type;

        return (
          <div
            key={block.id}
            onClick={function () { onSelectBlock(block.id); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 8px 5px 12px', cursor: 'pointer', fontSize: 11,
              background: isSelected ? 'color-mix(in srgb, var(--blue) 10%, transparent)' : 'transparent',
              borderLeft: isSelected ? '2px solid var(--blue)' : '2px solid transparent',
              opacity: isHidden ? 0.4 : 1,
              transition: 'background 0.1s',
            }}
          >
            <Icon size={12} style={{ color: isSelected ? 'var(--blue)' : 'var(--muted)', flexShrink: 0 }} />
            <span style={{ flex: 1, color: isSelected ? 'var(--blue)' : 'var(--text)', fontWeight: isSelected ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label}
            </span>

            {/* Layer controls - show on hover/selection */}
            <div className="layer-controls" style={{
              display: 'flex', gap: 1, opacity: isSelected ? 1 : 0,
              transition: 'opacity 0.1s',
            }}>
              <button onClick={function (e) { e.stopPropagation(); onMoveBlock(block.id, 'up'); }} disabled={index === 0}
                title="Omhoog" style={{ padding: 2, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', opacity: index === 0 ? 0.3 : 1 }}>
                <ChevronUp size={11} />
              </button>
              <button onClick={function (e) { e.stopPropagation(); onMoveBlock(block.id, 'down'); }} disabled={index === blocks.length - 1}
                title="Omlaag" style={{ padding: 2, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', opacity: index === blocks.length - 1 ? 0.3 : 1 }}>
                <ChevronDown size={11} />
              </button>
              <button onClick={function (e) { e.stopPropagation(); onToggleVisibility(block.id); }}
                title={isHidden ? 'Tonen' : 'Verbergen'} style={{ padding: 2, background: 'none', border: 'none', cursor: 'pointer', color: isHidden ? 'var(--amber)' : 'var(--muted)' }}>
                {isHidden ? <EyeOff size={11} /> : <Eye size={11} />}
              </button>
              <button onClick={function (e) { e.stopPropagation(); onDuplicate(block.id); }}
                title="Dupliceer" style={{ padding: 2, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                <Copy size={11} />
              </button>
              <button onClick={function (e) { e.stopPropagation(); onDelete(block.id); }}
                title="Verwijder" style={{ padding: 2, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}>
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        );
      })}

      <style>{`
        div:hover > .layer-controls { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
