'use client';

import { useState } from 'react';
import { Flame, Check, RotateCcw, Circle, AlertTriangle, Package, Utensils } from 'lucide-react';
import type { MepComponentItem, MepStatus } from './KookbordClient';
import { pal, formatQty, nextStatus, btnSpec, ACCENT_DARK } from './mep-ui';

interface MepItemCardProps {
  item: MepComponentItem;
  guests: number;
  onTap: () => void;
  onStatusToggle: (itemId: number, newStatus: MepStatus) => void | Promise<void>;
}

function asStatus(v: string): MepStatus {
  return v === 'bezig' || v === 'klaar' ? v : 'todo';
}

export default function MepItemCard({ item, guests, onTap, onStatusToggle }: MepItemCardProps) {
  const [flash, setFlash] = useState(false);

  const status = asStatus(item.status);
  const p = pal(status);
  const q = formatQty(item.base_quantity, item.base_unit, guests);
  const allergenen = (item.allergens ?? []).map(a => a.allergen_code?.toUpperCase?.() ?? '').filter(Boolean);
  const isIngekocht = item.type === 'bought_in';
  const bs = btnSpec(status);
  const next = nextStatus(status);

  const TypeIcon = isIngekocht ? Package : Utensils;
  const PillIcon = status === 'bezig' ? Flame : status === 'klaar' ? Check : Circle;
  const BtnIcon = status === 'todo' ? Flame : status === 'bezig' ? Check : RotateCcw;

  return (
    <article
      className={`mep-card${flash ? ' mep-flash' : ''}`}
      onClick={onTap}
      style={{
        display: 'flex', flexDirection: 'row', alignItems: 'stretch',
        background: `linear-gradient(180deg,${p.tintTop},rgba(26,26,30,.72))`,
        border: `1px solid ${p.border}`, borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
        boxShadow: flash
          ? '0 0 0 1px rgba(34,197,94,.6),0 12px 38px rgba(34,197,94,.28)'
          : p.glow
            ? '0 8px 30px rgba(249,115,22,.15),0 4px 14px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.05)'
            : '0 4px 14px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.03)',
      }}
    >
      <div
        style={{
          flex: '0 0 5px', width: 5, alignSelf: 'stretch', background: p.rail,
          ...(p.glow ? { boxShadow: '0 0 16px 1px rgba(249,115,22,.55)', animation: 'mepEmber 2.4s ease-in-out infinite' } : {}),
        }}
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 11, padding: '15px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9.5, fontWeight: 700, letterSpacing: '.15em', textTransform: 'uppercase', color: '#83838a' }}>
              <TypeIcon size={12} color="#83838a" strokeWidth={2} />
              <span>{isIngekocht ? 'Ingekocht' : 'Bereid'}</span>
            </span>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 17, fontWeight: 600, lineHeight: 1.22, color: '#f4f4f4' }}>{item.name}</span>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 10px 0 8px', borderRadius: 999, background: p.pillBg, border: `1px solid ${p.pillBd}`, color: p.pillFg, fontSize: 11, fontWeight: 700, letterSpacing: '.02em', flex: '0 0 auto', whiteSpace: 'nowrap' }}>
            <PillIcon size={12} color={p.pillFg} strokeWidth={status === 'klaar' ? 2.4 : 2} {...(status === 'bezig' ? { fill: p.pillFg } : {})} />
            <span>{p.label}</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 1 }}>
          <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 36, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 0.92, letterSpacing: '.005em', color: '#ffffff' }}>{q.value}</span>
          <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 16, fontWeight: 500, color: '#9aa0a8' }}>{q.unit}</span>
        </div>

        {allergenen.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {allergenen.map(code => (
              <span key={code} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 23, padding: '0 8px', borderRadius: 6, background: 'rgba(130,130,130,.09)', border: '1px solid rgba(130,130,130,.2)', fontSize: 10, fontWeight: 700, letterSpacing: '.07em', color: '#b3b3b9' }}>
                <AlertTriangle size={10} color="#8b8b8f" strokeWidth={2} />
                <span>{code}</span>
              </span>
            ))}
          </div>
        )}

        <button
          type="button"
          className="mep-cta"
          onClick={(e) => {
            e.stopPropagation();
            if (next === 'klaar') { setFlash(true); window.setTimeout(() => setFlash(false), 600); }
            void onStatusToggle(item.mep_item_id, next);
          }}
          style={{ height: 56, marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, border: bs.border, background: bs.bg, color: bs.fg, boxShadow: bs.shadow, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: 14.5, fontWeight: 700, letterSpacing: '.01em', width: '100%' }}
        >
          <BtnIcon size={status === 'bezig' ? 20 : status === 'todo' ? 19 : 18} color={bs.fg} strokeWidth={status === 'bezig' ? 2.6 : status === 'todo' ? 2.2 : 2.1} {...(status === 'todo' ? { fill: ACCENT_DARK } : {})} />
          <span>{bs.label}</span>
        </button>
      </div>
    </article>
  );
}
