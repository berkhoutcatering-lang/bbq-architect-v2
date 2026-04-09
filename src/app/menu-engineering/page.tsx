/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import PageHint from '@/components/PageHint';
import MetallicCard from '@/components/MetallicCard';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell, ZAxis } from 'recharts';
import { safeJsonParse } from '@/lib/utils';

const GANGEN = [
  { slug: 'bite', label: 'Bites', icon: '🍢', kleur: '#a78bfa' },
  { slug: 'voorgerecht', label: 'Voorgerechten', icon: '🥗', kleur: '#60a5fa' },
  { slug: 'hoofdgerecht', label: 'Hoofdgerechten', icon: '🥩', kleur: '#f97316' },
  { slug: 'vegetarisch', label: 'Vegetarisch', icon: '🌿', kleur: '#4ade80' },
  { slug: 'dessert', label: 'Desserts', icon: '🍮', kleur: '#f472b6' },
  { slug: 'bijgerecht', label: 'Bijgerechten', icon: '🫙', kleur: '#94a3b8' },
  { slug: 'borrelhap', label: 'Borrelhapjes', icon: '🧀', kleur: '#fbbf24' },
  { slug: 'anders', label: 'Overig', icon: '📦', kleur: '#6b7280' },
];

interface GangConfig {
  slug: string;
  label: string;
  icon: string;
  kleur: string;
}

interface GerechtData {
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

function getGang(slug: string): GangConfig {
  return GANGEN.find(function (g) { return g.slug === slug; }) || GANGEN[GANGEN.length - 1];
}

function scoreColor(pct: number): string {
  if (pct >= 75) return '#4ade80';
  if (pct >= 55) return '#fbbf24';
  return '#f87171';
}

function GerechtKaart({ gerecht, onMoveToMap, geselecteerd, onViewDetails, selectionMode, isSelected, onToggleSelect }: {
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
        border: selected ? '1px solid #3b82f6' : (geselecteerd ? '1px solid rgba(167,139,250,.25)' : '1px solid var(--border)'),
        borderRadius: 12,
        padding: '16px',
        transition: 'all .15s',
        position: 'relative',
        cursor: 'pointer'
      }}
      onMouseEnter={function (e: React.MouseEvent<HTMLDivElement>) { (e.currentTarget as HTMLDivElement).style.borderColor = selected ? '#3b82f6' : 'rgba(255,255,255,.2)'; }}
      onMouseLeave={function (e: React.MouseEvent<HTMLDivElement>) { (e.currentTarget as HTMLDivElement).style.borderColor = selected ? '#3b82f6' : (geselecteerd ? 'rgba(167,139,250,.25)' : 'var(--border)'); }}
    >
      {selectionMode && (
        <div
          onClick={function (e: React.MouseEvent) { e.stopPropagation(); onToggleSelect(gerecht.id); }}
          style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}
        >
          <div style={{
            width: 20, height: 20, borderRadius: 6,
            border: selected ? 'none' : '1px solid rgba(255,255,255,.2)',
            background: selected ? '#3b82f6' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 12
          }}>
            {selected && <i className="fa-solid fa-check"></i>}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: gang.kleur, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {gang.icon} {gang.label}
        </span>
        {gerecht.actief && !selectionMode && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4ade80', background: 'rgba(74,222,128,.1)', padding: '1px 6px', borderRadius: 4 }}>actief</span>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 4 }}>
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
              <span key={tag} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.5)', border: '1px solid rgba(255,255,255,.08)' }}>
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
            color: '#a78bfa', padding: '6px', borderRadius: 7, fontSize: 11, fontWeight: 600,
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

function GerechtDetailsModal({ gerecht, onSave, onDelete, onClose, onError, supabase: sb }: {
  gerecht: GerechtData | null;
  onSave: (id: number, data: any) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
  onError: (msg: string) => void;
  supabase: any;
}) {
  const showConfirm = useConfirm();
  if (!gerecht) return null;

  function normalizeIngs(val: any): string {
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return stringifyArray(val);
    return '';
  }

  function stringifyArray(arr: any): string {
    if (!Array.isArray(arr)) return typeof arr === 'string' ? arr : '';
    return arr.map(function (i: any) {
      if (typeof i === 'object' && i !== null) return (i.hoeveelheid ? i.hoeveelheid + (i.eenheid ? ' ' + i.eenheid + ' ' : ' ') : '') + (i.naam || JSON.stringify(i));
      return i;
    }).join(', ');
  }

  const [form, setForm] = useState({
    naam: gerecht.naam || '',
    beschrijving: gerecht.beschrijving || '',
    ingredienten: normalizeIngs(gerecht.ingredients_list || gerecht.ingredienten),
    bereidingswijze: gerecht.preparation_steps || gerecht.bereidingswijze || '',
    allergenen: stringifyArray(gerecht.allergenen),
    kostprijs_pp: gerecht.kostprijs_pp || '',
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const updateData = {
      naam: form.naam,
      beschrijving: form.beschrijving,
      ingredients_list: form.ingredienten,
      preparation_steps: form.bereidingswijze,
      allergenen: form.allergenen.split(',').map(function (s: string) { return s.trim(); }).filter(Boolean),
      kostprijs_pp: parseFloat(String(form.kostprijs_pp)) || 0,
    };
    const { error } = await sb.from('gerechten').update(updateData).eq('id', gerecht.id);
    setSaving(false);
    if (!error) onSave(gerecht.id, updateData);
    else onError('Fout bij opslaan: ' + error.message);
  }

  function handleDelete() {
    showConfirm('Let op: weet je zeker dat je dit gerecht permanent wilt verwijderen?', async function () {
      setSaving(true);
      const { error } = await sb.from('gerechten').delete().eq('id', gerecht.id);
      setSaving(false);
      if (!error) onDelete(gerecht.id);
      else onError('Fout bij verwijderen: ' + error.message);
    });
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '24px 28px', width: 600, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={function (e: React.MouseEvent) { e.stopPropagation(); }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, color: 'var(--brand)' }}>{gerecht.naam} Bewerken</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 4 }}>Naam</label>
            <input value={form.naam} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { naam: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: 13 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 4 }}>Beschrijving (Smaakprofiel)</label>
            <textarea rows={2} value={form.beschrijving} onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setForm(Object.assign({}, form, { beschrijving: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: 13, resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 4 }}>Ingrediënten (komma-gescheiden)</label>
            <textarea rows={2} value={form.ingredienten} onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setForm(Object.assign({}, form, { ingredienten: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: 13, resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#B48C14', textTransform: 'uppercase', marginBottom: 4 }}>Allergenen (volgens warenwet, komma-gescheiden)</label>
            <input value={form.allergenen} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { allergenen: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'rgba(180,140,20,.1)', border: '1px solid rgba(180,140,20,.3)', borderRadius: 8, color: '#fff', fontSize: 13 }} placeholder="bijv. Gluten, Melk, Noten" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 4 }}>Bereidingswijze (Stappenplan)</label>
            <textarea rows={5} value={form.bereidingswijze} onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setForm(Object.assign({}, form, { bereidingswijze: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: 13, resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 4 }}>Foodcost p.p. (€)</label>
            <input type="number" step="0.01" value={form.kostprijs_pp} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { kostprijs_pp: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: 13 }} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <button onClick={handleDelete} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,.1)', color: '#ef4444', fontWeight: 600, cursor: 'pointer', transition: '0.2s' }} onMouseEnter={function (e: React.MouseEvent<HTMLButtonElement>) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,.2)'; }} onMouseLeave={function (e: React.MouseEvent<HTMLButtonElement>) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,.1)'; }}>
            <i className="fa-solid fa-trash"></i> Verwijderen
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: 'rgba(255,255,255,.5)', fontWeight: 600, cursor: 'pointer' }}>Annuleren</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#000', fontWeight: 800, cursor: 'pointer' }}>
              {saving ? 'Laden...' : 'Wijzigingen Opslaan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MapStation({ gang, gerechten, onRemove, onPublish, onDrop }: {
  gang: GangConfig;
  gerechten: GerechtData[];
  onRemove: (id: number) => void;
  onPublish: (gang: GangConfig, gerechten: GerechtData[]) => void;
  onDrop: (id: string) => void;
}) {
  const kleur = gang.kleur;
  const isEmpty = gerechten.length === 0;
  const [dragOver, setDragOver] = React.useState(false);

  return (
    <div
      onDragOver={function (e: React.DragEvent) { e.preventDefault(); setDragOver(true); }}
      onDragLeave={function () { setDragOver(false); }}
      onDrop={function (e: React.DragEvent) {
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData('gerecht_id');
        if (id) onDrop(id);
      }}
      style={{
        background: dragOver ? 'rgba(255,255,255,.04)' : 'var(--card)',
        border: dragOver ? '1px solid ' + kleur + '80' : '1px solid var(--border)',
        borderTop: '2px solid ' + kleur,
        borderRadius: 12,
        padding: '14px',
        minHeight: 120,
        transition: 'border-color .15s, background .15s',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>{gang.icon}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{gang.label}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)' }}>{gerechten.length} gerecht{gerechten.length !== 1 ? 'en' : ''}</div>
        </div>
        {gerechten.length > 0 && (
          <button
            onClick={function () { onPublish(gang, gerechten); }}
            style={{
              marginLeft: 'auto', background: kleur + '18', border: '1px solid ' + kleur + '40',
              color: kleur, padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer'
            }}
          >
            Publiceer {gerechten.length} →
          </button>
        )}
      </div>

      {isEmpty ? (
        <div style={{
          border: '1px dashed rgba(255,255,255,.1)', borderRadius: 8, padding: '16px 10px',
          textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,.2)'
        }}>
          Sleep of klik "→ Zet in map"
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {gerechten.map(function (g) {
            return (
              <div key={g.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', background: 'rgba(255,255,255,.04)',
                borderRadius: 7, fontSize: 12
              }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.naam}</span>
                {g.kostprijs_pp && g.kostprijs_pp > 0 && (
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,.35)', flexShrink: 0 }}>€{Number(g.kostprijs_pp).toFixed(2)}</span>
                )}
                <button
                  onClick={function () { onRemove(g.id); }}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.25)', cursor: 'pointer', fontSize: 13, padding: '0 2px', flexShrink: 0 }}
                  title="Uit map verwijderen"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GangPickerModal({ gerecht, onPick, onClose }: {
  gerecht: GerechtData | null;
  onPick: (gerecht: GerechtData, slug: string) => void;
  onClose: () => void;
}) {
  if (!gerecht) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center'
    }} onClick={onClose}>
      <div
        style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: 360, maxWidth: '90vw' }}
        onClick={function (e: React.MouseEvent) { e.stopPropagation(); }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
          Zet <span style={{ color: 'var(--brand)' }}>{gerecht.naam}</span> in:
        </div>
        <div className="grid grid-cols-2 gap-2">
          {GANGEN.map(function (g) {
            return (
              <button
                key={g.slug}
                onClick={function () { onPick(gerecht, g.slug); }}
                style={{
                  background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '10px', cursor: 'pointer',
                  textAlign: 'left', transition: 'border-color .15s',
                  display: 'flex', alignItems: 'center', gap: 8
                }}
                onMouseEnter={function (e: React.MouseEvent<HTMLButtonElement>) { (e.currentTarget as HTMLButtonElement).style.borderColor = g.kleur + '60'; }}
                onMouseLeave={function (e: React.MouseEvent<HTMLButtonElement>) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; }}
              >
                <span style={{ fontSize: 18 }}>{g.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: g.kleur }}>{g.label}</div>
                </div>
              </button>
            );
          })}
        </div>
        <button onClick={onClose} style={{ marginTop: 14, width: '100%', background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontSize: 12 }}>
          Annuleren
        </button>
      </div>
    </div>
  );
}

// ── BCG Matrix types & helpers ──
type Quadrant = 'star' | 'puzzle' | 'plowhorse' | 'dog';

interface DishAnalysis {
  id: number;
  naam: string;
  gang_slug: string;
  popularity: number;          // count of appearances in events + offertes
  foodcostPP: number;          // ingredient cost per portion
  margePct: number;            // margin % based on avg selling price
  revenue: number;             // total revenue contribution (popularity * selling price)
  quadrant: Quadrant;
}

const QUADRANT_CONFIG: Record<Quadrant, { label: string; icon: string; color: string; bg: string; border: string; advies: string }> = {
  star:      { label: 'Stars',      icon: '\u2B50', color: '#4ade80', bg: 'rgba(74,222,128,.08)',  border: 'rgba(74,222,128,.25)',  advies: 'Behoud en promoot' },
  puzzle:    { label: 'Puzzles',    icon: '\uD83E\uDDE9', color: '#60a5fa', bg: 'rgba(96,165,250,.08)',  border: 'rgba(96,165,250,.25)',  advies: 'Verhoog zichtbaarheid \u2014 overweeg promotie' },
  plowhorse: { label: 'Plowhorses', icon: '\uD83D\uDC0E', color: '#fbbf24', bg: 'rgba(251,191,36,.08)',  border: 'rgba(251,191,36,.25)',  advies: 'Verhoog prijs of verlaag kosten' },
  dog:       { label: 'Dogs',       icon: '\uD83D\uDC15', color: '#f87171', bg: 'rgba(248,113,113,.08)', border: 'rgba(248,113,113,.25)', advies: 'Overweeg verwijdering of herontwerp' },
};

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const d: DishAnalysis = payload[0].payload;
  return (
    <div style={{
      background: '#1a1a1e', border: '1px solid #2a2a30', borderRadius: 10,
      padding: '12px 16px', boxShadow: '0 8px 24px rgba(0,0,0,.5)', maxWidth: 240
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{d.naam}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'rgba(255,255,255,.5)' }}>Populariteit</span>
          <span style={{ color: '#fff', fontWeight: 600 }}>{d.popularity}x ingezet</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'rgba(255,255,255,.5)' }}>Marge</span>
          <span style={{ color: QUADRANT_CONFIG[d.quadrant].color, fontWeight: 600 }}>{d.margePct.toFixed(1)}%</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'rgba(255,255,255,.5)' }}>Foodcost p.p.</span>
          <span style={{ color: '#fff', fontWeight: 600 }}>\u20ac{d.foodcostPP.toFixed(2)}</span>
        </div>
      </div>
      <div style={{
        marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.08)',
        fontSize: 10, color: QUADRANT_CONFIG[d.quadrant].color, fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 4
      }}>
        {QUADRANT_CONFIG[d.quadrant].icon} {QUADRANT_CONFIG[d.quadrant].label}
      </div>
    </div>
  );
}

function BCGMatrix({ dishes, medianPop, medianMargin }: { dishes: DishAnalysis[]; medianPop: number; medianMargin: number }) {
  if (dishes.length === 0) {
    return (
      <MetallicCard className="p-6" hover={false}>
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,.35)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Onvoldoende data voor matrix</div>
          <div style={{ fontSize: 12 }}>Voeg ingredient_costs toe aan gerechten en koppel ze aan events of offertes</div>
        </div>
      </MetallicCard>
    );
  }

  const maxPop = Math.max(...dishes.map(function (d) { return d.popularity; }), 1);
  const maxMargin = Math.max(...dishes.map(function (d) { return d.margePct; }), 1);
  const maxRevenue = Math.max(...dishes.map(function (d) { return d.revenue; }), 1);

  return (
    <MetallicCard className="p-4 md:p-6" hover={false}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Menu Engineering Matrix</h3>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,.4)' }}>
          BCG-analyse: {dishes.length} gerechten op populariteit vs. winstgevendheid
        </p>
      </div>

      {/* Quadrant labels */}
      <div style={{ position: 'relative' }}>
        <ResponsiveContainer width="100%" height={420} minWidth={100} minHeight={100}>
          <ScatterChart margin={{ top: 30, right: 30, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
            <XAxis
              type="number"
              dataKey="popularity"
              name="Populariteit"
              domain={[0, Math.ceil(maxPop * 1.15)]}
              tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,.1)' }}
              tickLine={{ stroke: 'rgba(255,255,255,.1)' }}
              label={{ value: 'Populariteit (aantal keer ingezet)', position: 'insideBottom', offset: -10, style: { fill: 'rgba(255,255,255,.35)', fontSize: 11 } }}
            />
            <YAxis
              type="number"
              dataKey="margePct"
              name="Marge %"
              domain={[0, Math.ceil(maxMargin * 1.15)]}
              tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,.1)' }}
              tickLine={{ stroke: 'rgba(255,255,255,.1)' }}
              label={{ value: 'Marge %', angle: -90, position: 'insideLeft', offset: 4, style: { fill: 'rgba(255,255,255,.35)', fontSize: 11 } }}
            />
            <ZAxis type="number" dataKey="revenue" range={[40, 400]} name="Omzet" />
            <ReferenceLine
              x={medianPop}
              stroke="rgba(255,255,255,.15)"
              strokeDasharray="6 4"
              label={{ value: 'Mediaan pop.', position: 'insideTopRight', style: { fill: 'rgba(255,255,255,.2)', fontSize: 10 } }}
            />
            <ReferenceLine
              y={medianMargin}
              stroke="rgba(255,255,255,.15)"
              strokeDasharray="6 4"
              label={{ value: 'Mediaan marge', position: 'insideTopRight', style: { fill: 'rgba(255,255,255,.2)', fontSize: 10 } }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: 'rgba(255,255,255,.1)' }} />
            <Scatter data={dishes} isAnimationActive={true}>
              {dishes.map(function (d, i) {
                return <Cell key={i} fill={QUADRANT_CONFIG[d.quadrant].color} fillOpacity={0.8} stroke={QUADRANT_CONFIG[d.quadrant].color} strokeWidth={1} />;
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>

        {/* Quadrant corner labels */}
        <div style={{ position: 'absolute', top: 8, left: 50, fontSize: 10, color: 'rgba(96,165,250,.5)', fontWeight: 700 }}>🧩 Puzzles</div>
        <div style={{ position: 'absolute', top: 8, right: 30, fontSize: 10, color: 'rgba(74,222,128,.5)', fontWeight: 700 }}>\u2B50 Stars</div>
        <div style={{ position: 'absolute', bottom: 28, left: 50, fontSize: 10, color: 'rgba(248,113,113,.5)', fontWeight: 700 }}>🐕 Dogs</div>
        <div style={{ position: 'absolute', bottom: 28, right: 30, fontSize: 10, color: 'rgba(251,191,36,.5)', fontWeight: 700 }}>🐎 Plowhorses</div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        {(['star', 'puzzle', 'plowhorse', 'dog'] as Quadrant[]).map(function (q) {
          const cfg = QUADRANT_CONFIG[q];
          const count = dishes.filter(function (d) { return d.quadrant === q; }).length;
          return (
            <div key={q} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.color }} />
              <span style={{ color: 'rgba(255,255,255,.5)' }}>{cfg.icon} {cfg.label}</span>
              <span style={{ color: cfg.color, fontWeight: 700 }}>({count})</span>
            </div>
          );
        })}
      </div>
    </MetallicCard>
  );
}

function QuadrantCards({ dishes }: { dishes: DishAnalysis[] }) {
  const grouped = useMemo(function () {
    const result: Record<Quadrant, DishAnalysis[]> = { star: [], puzzle: [], plowhorse: [], dog: [] };
    dishes.forEach(function (d) { result[d.quadrant].push(d); });
    // Sort each group: stars/puzzles by margin desc, plowhorses/dogs by popularity desc
    result.star.sort(function (a, b) { return b.margePct - a.margePct; });
    result.puzzle.sort(function (a, b) { return b.margePct - a.margePct; });
    result.plowhorse.sort(function (a, b) { return b.popularity - a.popularity; });
    result.dog.sort(function (a, b) { return b.popularity - a.popularity; });
    return result;
  }, [dishes]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ marginTop: 20 }}>
      {(['star', 'puzzle', 'plowhorse', 'dog'] as Quadrant[]).map(function (q) {
        const cfg = QUADRANT_CONFIG[q];
        const items = grouped[q];
        return (
          <MetallicCard key={q} hover={false} accent={cfg.color}>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 20 }}>{cfg.icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: cfg.color }}>{cfg.label}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>{items.length} gerechten</div>
                </div>
              </div>
              <div style={{
                fontSize: 11, color: cfg.color, background: cfg.bg,
                border: '1px solid ' + cfg.border, borderRadius: 6,
                padding: '6px 10px', marginBottom: 12, fontWeight: 600
              }}>
                💡 {cfg.advies}
              </div>

              {items.length === 0 ? (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.2)', textAlign: 'center', padding: '12px 0' }}>
                  Geen gerechten in dit kwadrant
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                  {items.map(function (d) {
                    const gang = getGang(d.gang_slug);
                    return (
                      <div key={d.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', background: 'rgba(255,255,255,.03)',
                        borderRadius: 8, border: '1px solid rgba(255,255,255,.05)'
                      }}>
                        <span style={{ fontSize: 12 }}>{gang.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.naam}
                          </div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)' }}>
                            {gang.label}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: cfg.color }}>
                            {d.margePct.toFixed(0)}% marge
                          </div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)' }}>
                            {d.popularity}x \u00b7 \u20ac{d.foodcostPP.toFixed(2)}/pp
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </MetallicCard>
        );
      })}
    </div>
  );
}

// ── Helpers for BCG data calc ──
function calcDishFoodcost(gerecht: any, inventoryData: any[]): number {
  const costs = gerecht.ingredient_costs;
  if (!costs || !Array.isArray(costs) || costs.length === 0) return 0;
  return costs.reduce(function (sum: number, it: any) {
    const inv = inventoryData.find(function (i: any) { return i.naam && it.naam && i.naam.toLowerCase() === it.naam.toLowerCase(); });
    const p = inv ? (inv.purchase_price || 0) : 0;
    const y = it.yield || (inv ? inv.yield_factor : 1.0) || 1.0;
    let f = 1;
    if (it.unit === 'g' && inv && inv.unit === 'kg') f = 0.001;
    if (it.unit === 'ml' && inv && inv.unit === 'L') f = 0.001;
    return sum + ((it.qty_pp || 0) * f / y) * p;
  }, 0);
}

function countDishPopularity(dishName: string, dishId: number, eventsData: any[], offertesData: any[]): number {
  let count = 0;
  // Count in events (menu field is number[] of gerecht IDs, or JSON string)
  eventsData.forEach(function (ev: any) {
    const menu = typeof ev.menu === 'string' ? safeJsonParse(ev.menu, []) : (ev.menu || []);
    if (Array.isArray(menu)) {
      if (menu.includes(dishId) || menu.includes(String(dishId))) count++;
    }
  });
  // Count in offertes (menu_selectie)
  offertesData.forEach(function (off: any) {
    const parsed = typeof off.menu_selectie === 'string' ? safeJsonParse(off.menu_selectie, {}) : (off.menu_selectie || {});
    let items: any[] = [];
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed && typeof parsed === 'object') {
      Object.values(parsed).forEach(function (arr: any) {
        if (Array.isArray(arr)) {
          arr.forEach(function (item: any) {
            items.push(typeof item === 'string' ? { naam: item } : item);
          });
        }
      });
    }
    const found = items.some(function (it: any) {
      const name = it.gerecht_naam || it.naam || '';
      return name === dishName;
    });
    if (found) count++;
  });
  return count;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort(function (a, b) { return a - b; });
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export default function MenuEngineering() {
  const showConfirm = useConfirm();
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gerechten, setGerechten] = useState<GerechtData[]>([]);
  const [gangen, setGangen] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [gangFilter, setGangFilter] = useState('alle');
  const [view, setView] = useState('kaarten');

  // BCG Matrix data
  const [eventsData, setEventsData] = useState<any[]>([]);
  const [offertesData, setOffertesData] = useState<any[]>([]);
  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const [fullGerechten, setFullGerechten] = useState<any[]>([]);

  const [mapData, setMapData] = useState<Record<string, GerechtData[]>>({});

  const [picking, setPicking] = useState<GerechtData | null>(null);

  const [viewingGerecht, setViewingGerecht] = useState<GerechtData | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectLimit, setSelectLimit] = useState(20);

  const [toast, setToast] = useState<string | null>(null);

  function toggleSelect(id: number) {
    setSelectedIds(function (prev) {
      if (prev.includes(id)) return prev.filter(function (x) { return x !== id; });
      if (prev.length >= selectLimit) return prev;
      return prev.concat([id]);
    });
  }

  function selectVisible() {
    setSelectedIds(function (prev) {
      const next = prev.slice();
      for (let i = 0; i < filtered.length; i++) {
        if (next.length >= selectLimit) break;
        if (!next.includes(filtered[i].id)) next.push(filtered[i].id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function deleteSelected() {
    if (selectedIds.length === 0) return;
    showConfirm('Let op: weet je zeker dat je ' + selectedIds.length + ' geselecteerde gerechten permanent wilt verwijderen?', async function () {
      setLoading(true);
      const { error } = await supabase.from('gerechten').delete().in('id', selectedIds);
      setLoading(false);

      if (!error) {
        setGerechten(function (prev) { return prev.filter(function (g) { return !selectedIds.includes(g.id); }); });
        clearSelection();
        showToast('✅ ' + selectedIds.length + ' gerechten verwijderd!');
      } else {
        showToast('❌ Fout bij verwijderen: ' + error.message);
      }
    });
  }

  useEffect(function () {
    if (!supabase) { setLoading(false); return; }
    Promise.all([
      supabase.from('gangen').select('*').order('volgorde'),
      supabase.from('gerechten').select('id,naam,gang_slug,beschrijving,tags,allergenen,kostprijs_pp,actief,ingredienten,bereidingswijze').order('volgorde'),
      supabase.from('events').select('id,menu'),
      supabase.from('offertes').select('id,menu_selectie,basis_prijs_pp,aantal_gasten'),
      supabase.from('inventory').select('id,naam,unit,purchase_price,yield_factor'),
      supabase.from('gerechten').select('id,naam,gang_slug,ingredient_costs,kostprijs_pp'),
    ]).then(function (results: any[]) {
      const gangenData = results[0].data || [];
      const gerechtenData = results[1].data || [];

      setGangen(gangenData);

      const initMap: Record<string, GerechtData[]> = {};
      GANGEN.forEach(function (g) { initMap[g.slug] = []; });
      setMapData(initMap);

      setGerechten(gerechtenData);

      // BCG Matrix data
      setEventsData(results[2].data || []);
      setOffertesData(results[3].data || []);
      setInventoryData(results[4].data || []);
      setFullGerechten(results[5].data || []);

      setLoading(false);
    });
    return function () {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const filtered = useMemo(function () {
    const q = search.toLowerCase();
    return gerechten.filter(function (g) {
      if (gangFilter !== 'alle' && g.gang_slug !== gangFilter) return false;
      if (q && !g.naam.toLowerCase().includes(q) && !(g.beschrijving || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [gerechten, gangFilter, search]);

  const inMap = useMemo(function () {
    const ids = new Set<number>();
    Object.values(mapData).forEach(function (lijst) {
      lijst.forEach(function (g) { ids.add(g.id); });
    });
    return ids;
  }, [mapData]);

  const ongemapt = useMemo(function () {
    return filtered.filter(function (g) { return !inMap.has(g.id); });
  }, [filtered, inMap]);

  function openGangPicker(gerecht: GerechtData) {
    setPicking(gerecht);
  }

  function placeInMap(gerecht: GerechtData, gangSlug: string) {
    setPicking(null);
    setMapData(function (prev) {
      const next = Object.assign({}, prev);
      Object.keys(next).forEach(function (slug) {
        next[slug] = next[slug].filter(function (g) { return g.id !== gerecht.id; });
      });
      if (!next[gangSlug]) next[gangSlug] = [];
      next[gangSlug] = next[gangSlug].concat([gerecht]);
      return next;
    });
  }

  function removeFromMap(gerechthId: number) {
    setMapData(function (prev) {
      const next = Object.assign({}, prev);
      Object.keys(next).forEach(function (slug) {
        next[slug] = next[slug].filter(function (g) { return g.id !== gerechthId; });
      });
      return next;
    });
  }

  function aiAutoSort() {
    const keywordMap = [
      { slug: 'dessert', words: ['dessert', 'panna cotta', 'mousse', 'ijs', 'sorbet', 'cake', 'tart', 'brownie', 'cheesecake', 'macaron', 'mille-feuille', 'sticky rice', 'crème brûlée', 'tiramisu', 'parfait', 'gelato', 'pudding', 'waffle', 'stroopwafel'] },
      { slug: 'borrelhap', words: ['borrelhap', 'borrel', 'amuse', 'nootje', 'chip', 'dip', 'spread', 'toast', 'crostini', 'bruschetta', 'blini'] },
      { slug: 'bite', words: ['bite', 'bites', 'gyoza', 'tataki', 'tartaar', 'tartare', 'carpaccio', 'skewer', 'sate', 'saté', 'lolly', 'slider', 'wrap', 'roll', 'rollup', 'spring roll', 'dumpling', 'bao', 'taco', 'pintxo', 'croqueta', 'kroket', 'bitterbal', 'fingerfood', 'finger food', 'mini ', 'hapje'] },
      { slug: 'voorgerecht', words: ['salade', 'soep', 'ceviche', 'gazpacho', 'bisque', 'carpaccio', 'voorgerecht', 'starter', 'amuse', 'poke', 'bowl'] },
      { slug: 'vegetarisch', words: ['vegan', 'vegetarisch', 'veggie', 'tofu', 'tempeh', 'halloumi', 'portobello', 'paddenstoel', 'bloemkool', 'aubergine', 'courgette', 'groenten', 'biet', 'linze', 'kikkererwt', 'falafel', 'gnocchi'] },
      { slug: 'bijgerecht', words: ['frites', 'friet', 'coleslaw', 'slaw', 'saus', 'relish', 'chutney', 'bread', 'brood', 'brioche', 'rice', 'rijst', 'pasta', 'noodle', 'aardappel', 'puree', 'tzatziki', 'guacamole', 'salsa', 'hummus', 'aioli', 'mayo'] },
      { slug: 'hoofdgerecht', words: ['brisket', 'ribeye', 'entrecote', 'bavette', 'striploin', 'tomahawk', 'côte de boeuf', 'cote de boeuf', 't-bone', 'picanha', 'pulled pork', 'spare rib', 'spareribs', 'rack', 'lam', 'lamskotelet', 'kip', 'kipfilet', 'kipdij', 'zalm', 'tonijn', 'zeebaars', 'ossenhaas', 'wagyu', 'burger', 'karbonnade', 'varkenshaas', 'eend', 'parelhoen'] },
    ];

    const next: Record<string, GerechtData[]> = {};
    GANGEN.forEach(function (g) { next[g.slug] = []; });

    gerechten.forEach(function (g) {
      const tekst = ((g.naam || '') + ' ' + (g.beschrijving || '')).toLowerCase();
      let bestSlug: string | null = null;

      for (let ki = 0; ki < keywordMap.length; ki++) {
        const entry = keywordMap[ki];
        for (let wi = 0; wi < entry.words.length; wi++) {
          if (tekst.includes(entry.words[wi])) {
            bestSlug = entry.slug;
            break;
          }
        }
        if (bestSlug) break;
      }

      if (!bestSlug) {
        bestSlug = next.hasOwnProperty(g.gang_slug) ? g.gang_slug : 'anders';
      }

      if (!next[bestSlug]) next[bestSlug] = [];
      next[bestSlug].push(g);
    });

    setMapData(next);
    showToast('✨ AI heeft ' + gerechten.length + ' gerechten gesorteerd op gang');
  }

  async function publishGang(gang: GangConfig, gerechtenLijst: GerechtData[]) {
    if (!supabase || gerechtenLijst.length === 0) return;
    const ids = gerechtenLijst.map(function (g) { return g.id; });

    const { error } = await supabase.from('gerechten').update({ gang_slug: gang.slug, actief: true }).in('id', ids);
    if (error) {
      showToast('❌ Fout bij publiceren: ' + error.message);
      return;
    }
    setGerechten(function (prev) {
      return prev.map(function (g) {
        if (ids.includes(g.id)) return Object.assign({}, g, { gang_slug: gang.slug, actief: true });
        return g;
      });
    });
    showToast('✅ ' + gerechtenLijst.length + ' gerechten gepubliceerd als ' + gang.label);
  }

  function handleSaveDetails(id: number, updateData: any) {
    setGerechten(function (prev) {
      return prev.map(function (g) {
        if (g.id === id) return Object.assign({}, g, updateData);
        return g;
      });
    });
    setViewingGerecht(null);
    showToast('✅ Gerecht succcesvol gewijzigd!');
  }

  function handleDeleteDetails(id: number) {
    setGerechten(function (prev) { return prev.filter(function (g) { return g.id !== id; }); });
    setViewingGerecht(null);
    showToast('❌ Gerecht verwijderd!');
  }

  function showToast(msg: string) {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(msg);
    toastTimeoutRef.current = setTimeout(function () { setToast(null); toastTimeoutRef.current = null; }, 3500);
  }

  const alleMapGerechten = useMemo(function () {
    let count = 0;
    Object.values(mapData).forEach(function (l) { count += l.length; });
    return count;
  }, [mapData]);

  const stats = useMemo(function () {
    const metKostprijs = gerechten.filter(function (g) { return g.kostprijs_pp && g.kostprijs_pp > 0; });
    const gemMarge = metKostprijs.length > 0
      ? metKostprijs.reduce(function (s, g) { return s + (1 - (g.kostprijs_pp || 0) / 45); }, 0) / metKostprijs.length * 100
      : 0;
    return {
      totaal: gerechten.length,
      actief: gerechten.filter(function (g) { return g.actief; }).length,
      gemMarge: gemMarge.toFixed(0),
      metKostprijs: metKostprijs.length,
    };
  }, [gerechten]);

  const gangOptions = useMemo(function () {
    const slugs = Array.from(new Set(gerechten.map(function (g) { return g.gang_slug; }).filter(Boolean)));
    const result = GANGEN.filter(function (g) { return slugs.includes(g.slug); });
    return result;
  }, [gerechten]);

  // ── BCG Matrix analysis ──
  const bcgAnalysis = useMemo(function () {
    if (fullGerechten.length === 0) return { dishes: [] as DishAnalysis[], medianPop: 0, medianMargin: 0 };

    // Average selling price across offertes (for margin calc)
    const prices = offertesData.filter(function (o: any) { return o.basis_prijs_pp && o.basis_prijs_pp > 0; }).map(function (o: any) { return o.basis_prijs_pp; });
    const avgSellingPrice = prices.length > 0 ? prices.reduce(function (s: number, p: number) { return s + p; }, 0) / prices.length : 45;

    const dishes: DishAnalysis[] = [];
    fullGerechten.forEach(function (g: any) {
      const foodcost = calcDishFoodcost(g, inventoryData);
      // Also fall back to kostprijs_pp if ingredient_costs not set
      const effectiveCost = foodcost > 0 ? foodcost : (g.kostprijs_pp || 0);
      if (effectiveCost <= 0) return; // skip dishes with no cost data

      const pop = countDishPopularity(g.naam, g.id, eventsData, offertesData);
      const marge = avgSellingPrice > 0 ? ((avgSellingPrice - effectiveCost) / avgSellingPrice) * 100 : 0;
      const revenue = pop * avgSellingPrice;

      dishes.push({
        id: g.id,
        naam: g.naam,
        gang_slug: g.gang_slug || 'anders',
        popularity: pop,
        foodcostPP: effectiveCost,
        margePct: Math.max(0, marge),
        revenue: revenue,
        quadrant: 'dog', // placeholder, set below
      });
    });

    if (dishes.length === 0) return { dishes: [], medianPop: 0, medianMargin: 0 };

    const medPop = median(dishes.map(function (d) { return d.popularity; }));
    const medMargin = median(dishes.map(function (d) { return d.margePct; }));

    // Classify into quadrants
    dishes.forEach(function (d) {
      const highPop = d.popularity >= medPop;
      const highMargin = d.margePct >= medMargin;
      if (highPop && highMargin) d.quadrant = 'star';
      else if (!highPop && highMargin) d.quadrant = 'puzzle';
      else if (highPop && !highMargin) d.quadrant = 'plowhorse';
      else d.quadrant = 'dog';
    });

    return { dishes, medianPop: medPop, medianMargin: medMargin };
  }, [fullGerechten, eventsData, offertesData, inventoryData]);

  // BCG summary stats
  const bcgStats = useMemo(function () {
    const d = bcgAnalysis.dishes;
    if (d.length === 0) return null;
    return {
      totaal: d.length,
      stars: d.filter(function (x) { return x.quadrant === 'star'; }).length,
      puzzles: d.filter(function (x) { return x.quadrant === 'puzzle'; }).length,
      plowhorses: d.filter(function (x) { return x.quadrant === 'plowhorse'; }).length,
      dogs: d.filter(function (x) { return x.quadrant === 'dog'; }).length,
      avgMargin: d.reduce(function (s, x) { return s + x.margePct; }, 0) / d.length,
    };
  }, [bcgAnalysis]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'rgba(255,255,255,.4)', fontSize: 14 }}>
        <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} /> Menu laden...
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 40 }}>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a1a', border: '1px solid var(--border)', borderRadius: 10,
          padding: '10px 20px', fontSize: 13, fontWeight: 600, zIndex: 999,
          boxShadow: '0 8px 24px rgba(0,0,0,.5)', whiteSpace: 'nowrap'
        }}>
          {toast}
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Menu Engineering</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,.4)' }}>Beoordeel, sorteer en publiceer je gerechten via het Map Station</p>
      </div>

      <PageHint id="menu-engineering" title="Menu Engineering" description="Analyseer je menu op populariteit en marge. Gebruik de BCG Matrix om Stars en Dogs te identificeren." />

      {gerechten.length === 0 && <EmptyState page="/menu-engineering" />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Totaal', value: stats.totaal, sub: 'gerechten' },
          { label: 'Actief', value: stats.actief, sub: 'gepubliceerd' },
          { label: 'Met kostprijs', value: stats.metKostprijs, sub: 'berekend' },
          { label: 'Gem. marge', value: stats.gemMarge + '%', sub: 'op €45 menu' },
        ].map(function (s) {
          return (
            <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', marginTop: 2 }}>{s.sub}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,.3)', fontSize: 12 }} />
          <input
            type="text"
            value={search}
            onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setSearch(e.target.value); }}
            placeholder="Zoek gerechten..."
            style={{
              width: '100%', paddingLeft: 34, padding: '9px 12px 9px 34px',
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <button
            onClick={function () { setGangFilter('alle'); }}
            style={{ padding: '7px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', background: gangFilter === 'alle' ? 'rgba(59,130,246,.15)' : 'transparent', color: gangFilter === 'alle' ? '#3b82f6' : 'rgba(255,255,255,.5)' }}
          >
            Alle
          </button>
          {GANGEN.map(function (g) {
            const active = gangFilter === g.slug;
            return (
              <button
                key={g.slug}
                onClick={function () { setGangFilter(active ? 'alle' : g.slug); }}
                style={{ padding: '7px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (active ? '#3b82f6' : 'var(--border)'), background: active ? 'rgba(59,130,246,.15)' : 'transparent', color: active ? '#3b82f6' : 'rgba(255,255,255,.5)' }}
              >
                {g.icon} {g.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', background: 'rgba(255,255,255,.06)', borderRadius: 8, padding: 3, gap: 2 }}>
          {([['kaarten', '⊞ Kaarten'], ['matrix', '📈 BCG Matrix'], ['map', '🗂 Map Station']] as [string, string][]).map(function (pair) {
            const isActive = view === pair[0];
            return (
              <button
                key={pair[0]}
                onClick={function () { setView(pair[0]); }}
                style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: isActive ? 'rgba(255,255,255,.12)' : 'transparent', color: isActive ? '#fff' : 'rgba(255,255,255,.45)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                {pair[1]}
              </button>
            );
          })}
        </div>

        <button
          onClick={function () {
            setSelectionMode(!selectionMode);
            if (selectionMode) setSelectedIds([]);
          }}
          style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            border: '1px solid ' + (selectionMode ? '#3b82f6' : 'var(--border)'),
            background: selectionMode ? 'rgba(59,130,246,.15)' : 'transparent',
            color: selectionMode ? '#3b82f6' : 'rgba(255,255,255,.5)',
            display: 'flex', alignItems: 'center', gap: 6, transition: '0.2s'
          }}
        >
          <i className={`fa-solid ${selectionMode ? 'fa-check-double' : 'fa-square-check'}`}></i>
          {selectionMode ? 'Selectie aan' : 'Selectiemodus'}
        </button>

        {selectionMode && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.05)',
              border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', height: 32
            }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', fontWeight: 700 }}>Max</span>
              <input
                type="number"
                min={1}
                max={200}
                value={selectLimit}
                onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setSelectLimit(Math.max(1, Math.min(200, Number(e.target.value) || 1))); }}
                style={{
                  width: 40, background: 'transparent', border: 'none', color: '#fff',
                  fontSize: 12, fontWeight: 700, outline: 'none', textAlign: 'center'
                }}
              />
            </div>

            <button
              onClick={selectVisible}
              style={{ padding: '0 12px', height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,.05)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              Selecteer {selectLimit}
            </button>

            <button
              onClick={clearSelection}
              style={{ padding: '0 12px', height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,.05)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              Deselecteer
            </button>

            {selectedIds.length > 0 && (
              <button
                onClick={deleteSelected}
                style={{ padding: '0 12px', height: 32, borderRadius: 8, border: 'none', background: 'rgba(239,68,68,.15)', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                <i className="fa-solid fa-trash" style={{ marginRight: 6 }}></i>
                Verwijder ({selectedIds.length})
              </button>
            )}
          </div>
        )}
      </div>

      {view === 'kaarten' && (
        <div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', marginBottom: 14 }}>
            {filtered.length} gerechten
            {inMap.size > 0 && <span style={{ marginLeft: 8 }}>• <span style={{ color: '#a78bfa' }}>{inMap.size} in Map Station</span></span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
            {filtered.map(function (g) {
              return (
                <GerechtKaart
                  key={g.id}
                  gerecht={g}
                  geselecteerd={inMap.has(g.id)}
                  onMoveToMap={openGangPicker}
                  onViewDetails={setViewingGerecht}
                  selectionMode={selectionMode}
                  isSelected={function (id: number) { return selectedIds.includes(id); }}
                  onToggleSelect={toggleSelect}
                />
              );
            })}
          </div>
          {filtered.length === 0 && (
            <EmptyState page="/menu-engineering" />
          )}
        </div>
      )}

      {view === 'matrix' && (
        <div>
          {/* BCG Summary Stats */}
          {bcgStats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3" style={{ marginBottom: 20 }}>
              {[
                { label: 'Geanalyseerd', value: bcgStats.totaal, color: '#c4a35a' },
                { label: 'Stars', value: bcgStats.stars, color: '#4ade80' },
                { label: 'Puzzles', value: bcgStats.puzzles, color: '#60a5fa' },
                { label: 'Plowhorses', value: bcgStats.plowhorses, color: '#fbbf24' },
                { label: 'Dogs', value: bcgStats.dogs, color: '#f87171' },
              ].map(function (s) {
                return (
                  <div key={s.label} style={{ background: '#1a1a1e', border: '1px solid #2a2a30', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* BCG Scatter Plot */}
          <BCGMatrix dishes={bcgAnalysis.dishes} medianPop={bcgAnalysis.medianPop} medianMargin={bcgAnalysis.medianMargin} />

          {/* Quadrant Classification Cards */}
          <QuadrantCards dishes={bcgAnalysis.dishes} />
        </div>
      )}

      {view === 'map' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>🗂 Map Station</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)' }}>
                {alleMapGerechten} gerechten ingedeeld • {gerechten.length - alleMapGerechten} nog niet
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                onClick={aiAutoSort}
                style={{ background: 'rgba(167,139,250,.1)', border: '1px solid rgba(167,139,250,.2)', color: '#a78bfa', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                ✨ AI auto-sort
              </button>
              <button
                onClick={function () { const m: Record<string, GerechtData[]> = {}; GANGEN.forEach(function (g) { m[g.slug] = []; }); setMapData(m); }}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'rgba(255,255,255,.4)', padding: '8px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}
              >
                Reset
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.35)', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10 }}>
                Pool — {ongemapt.length} gerechten
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 600, overflowY: 'auto', paddingRight: 4 }}>
                {ongemapt.map(function (g) {
                  const gang = getGang(g.gang_slug);
                  return (
                    <div
                      key={g.id}
                      draggable
                      onDragStart={function (e: React.DragEvent) { e.dataTransfer.setData('gerecht_id', String(g.id)); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 9, cursor: 'grab', transition: 'border-color .15s' }}
                      onClick={function () { openGangPicker(g); }}
                    >
                      <span style={{ fontSize: 14 }}>{gang.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.naam}</div>
                        <div style={{ fontSize: 10, color: gang.kleur, fontWeight: 600 }}>{gang.label}</div>
                      </div>
                      <i className="fa-solid fa-arrow-right" style={{ fontSize: 10, color: 'rgba(255,255,255,.2)' }} />
                    </div>
                  );
                })}
                {ongemapt.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px', fontSize: 12, color: 'rgba(255,255,255,.2)', border: '1px dashed var(--border)', borderRadius: 9 }}>
                    ✅ Alle gerechten zijn ingedeeld!
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {GANGEN.map(function (gang) {
                const lijst = mapData[gang.slug] || [];
                return (
                  <MapStation
                    key={gang.slug}
                    gang={gang}
                    gerechten={lijst}
                    onRemove={removeFromMap}
                    onPublish={publishGang}
                    onDrop={function (gerechthId: string) {
                      const g = gerechten.find(function (x) { return String(x.id) === String(gerechthId); });
                      if (g) placeInMap(g, gang.slug);
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      <GangPickerModal
        gerecht={picking}
        onPick={placeInMap}
        onClose={function () { setPicking(null); }}
      />

      <GerechtDetailsModal
        gerecht={viewingGerecht}
        onSave={handleSaveDetails}
        onDelete={handleDeleteDetails}
        onClose={function () { setViewingGerecht(null); }}
        onError={function (msg: string) { showToast('❌ ' + msg); }}
        supabase={supabase}
      />
    </div>
  );
}
