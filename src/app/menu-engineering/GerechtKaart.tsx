/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React from 'react';
import { Check } from 'lucide-react';

export const GANGEN = [
  { slug: 'bite', label: 'Bites', icon: '🍢', kleur: '#a78bfa' },
  { slug: 'voorgerecht', label: 'Voorgerechten', icon: '🥗', kleur: '#60a5fa' },
  { slug: 'hoofdgerecht', label: 'Hoofdgerechten', icon: '🥩', kleur: '#f97316' },
  { slug: 'vegetarisch', label: 'Vegetarisch', icon: '🌿', kleur: '#4ade80' },
  { slug: 'dessert', label: 'Desserts', icon: '🍮', kleur: '#f472b6' },
  { slug: 'bijgerecht', label: 'Bijgerechten', icon: '🫙', kleur: '#94a3b8' },
  { slug: 'borrelhap', label: 'Borrelhapjes', icon: '🧀', kleur: '#fbbf24' },
  { slug: 'anders', label: 'Overig', icon: '📦', kleur: '#6b7280' },
];

export interface GangConfig {
  slug: string;
  label: string;
  icon: string;
  kleur: string;
}

export interface GerechtData {
  id: number;
  naam: string;
  gang_slug: string;
  beschrijving?: string;
  tags?: string[];
  allergenen?: string[];
  kostprijs_pp?: number;
  actief?: boolean;
  ingredienten?: string;
  bereidingswijze?: string;
  ingredients_list?: string;
  preparation_steps?: string;
}

export function getGang(slug: string): GangConfig {
  return GANGEN.find(function (g) { return g.slug === slug; }) || GANGEN[GANGEN.length - 1];
}

export function scoreColor(pct: number): string {
  if (pct >= 75) return '#4ade80';
  if (pct >= 55) return '#fbbf24';
  return '#f87171';
}

export default function GerechtKaart({ gerecht, onMoveToMap, geselecteerd, onViewDetails, selectionMode, isSelected, onToggleSelect }: {
  gerecht: GerechtData;
  onMoveToMap: (g: GerechtData) => void;
  geselecteerd: boolean;
  onViewDetails?: (g: GerechtData) => void;
  selectionMode: boolean;
  isSelected: (id: number) => boolean;
  onToggleSelect: (id: number) => void;
}) {
  const gang = getGang(gerecht.gang_slug);
  const marge = gerecht.kostprijs_pp
    ? Math.round((1 - gerecht.kostprijs_pp / 45) * 100)
    : null;

  const selected = selectionMode && isSelected(gerecht.id);

  return (
    <div
      onClick={function () {
        if (selectionMode) onToggleSelect(gerecht.id);
        else if (onViewDetails) onViewDetails(gerecht);
      }}
      style={{
        background: selected ? 'rgba(59,130,246,.1)' : (geselecteerd ? 'rgba(167,139,250,.05)' : 'var(--card)'),
        border: selected ? '1px solid var(--blue)' : (geselecteerd ? '1px solid rgba(167,139,250,.25)' : '1px solid var(--border)'),
        borderRadius: 12,
        padding: '16px',
        transition: 'all .15s',
        position: 'relative',
        cursor: 'pointer'
      }}
      onMouseEnter={function (e: React.MouseEvent<HTMLDivElement>) { (e.currentTarget as HTMLDivElement).style.borderColor = selected ? 'var(--blue)' : 'rgba(255,255,255,.2)'; }}
      onMouseLeave={function (e: React.MouseEvent<HTMLDivElement>) { (e.currentTarget as HTMLDivElement).style.borderColor = selected ? 'var(--blue)' : (geselecteerd ? 'rgba(167,139,250,.25)' : 'var(--border)'); }}
    >
      {selectionMode && (
        <div
          onClick={function (e: React.MouseEvent) { e.stopPropagation(); onToggleSelect(gerecht.id); }}
          style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}
        >
          <div style={{
            width: 24, height: 24, borderRadius: 6,
            border: selected ? 'none' : '1px solid rgba(255,255,255,.2)',
            background: selected ? 'var(--blue)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 12
          }}>
            {selected && <Check size={16} />}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: gang.kleur, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {gang.icon} {gang.label}
        </span>
        {gerecht.actief && !selectionMode && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#4ade80', background: 'rgba(74,222,128,.1)', padding: '2px 8px', borderRadius: 4 }}>actief</span>
        )}
      </div>

      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4, lineHeight: 1.3 }}>{gerecht.naam}</div>
      {gerecht.beschrijving && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', lineHeight: 1.45, marginBottom: 10 }}>
          {gerecht.beschrijving.slice(0, 80)}{gerecht.beschrijving.length > 80 ? '…' : ''}
        </div>
      )}

      {gerecht.kostprijs_pp && gerecht.kostprijs_pp > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,.4)', marginBottom: 4 }}>
            <span>kostprijs p.p.</span>
            <span style={{ color: marge ? scoreColor(marge) : 'rgba(255,255,255,.5)', fontWeight: 700 }}>
              {marge ? marge + '% marge' : '—'}
            </span>
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,.08)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: (marge || 0) + '%', background: scoreColor(marge || 0), borderRadius: 2, transition: 'width .4s' }} />
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginTop: 4 }}>€{Number(gerecht.kostprijs_pp).toFixed(2)} / persoon</div>
        </div>
      )}

      {gerecht.tags && gerecht.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
          {gerecht.tags.slice(0, 3).map(function (tag: string) {
            return (
              <span key={tag} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 10, background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.5)', border: '1px solid rgba(255,255,255,.08)' }}>
                {tag}
              </span>
            );
          })}
        </div>
      )}

      {!selectionMode && (
        <button
          onClick={function (e: React.MouseEvent) { e.stopPropagation(); onMoveToMap(gerecht); }}
          style={{
            width: '100%', background: 'rgba(167,139,250,.08)', border: '1px solid rgba(167,139,250,.15)',
            color: 'var(--purple)', padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', transition: 'all .15s', marginTop: 4
          }}
          onMouseEnter={function (e: React.MouseEvent<HTMLButtonElement>) { (e.target as HTMLButtonElement).style.background = 'rgba(167,139,250,.16)'; }}
          onMouseLeave={function (e: React.MouseEvent<HTMLButtonElement>) { (e.target as HTMLButtonElement).style.background = 'rgba(167,139,250,.08)'; }}
        >
          → Zet in map
        </button>
      )}
    </div>
  );
}
