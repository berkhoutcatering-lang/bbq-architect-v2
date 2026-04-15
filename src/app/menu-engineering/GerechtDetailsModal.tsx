/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { Trash2 } from 'lucide-react';
import type { GerechtData } from './GerechtKaart';

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

export default function GerechtDetailsModal({ gerecht, onSave, onDelete, onClose, onError, supabase: sb }: {
  gerecht: GerechtData | null;
  onSave: (id: number, data: any) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
  onError: (msg: string) => void;
  supabase: any;
}) {
  const showConfirm = useConfirm();
  if (!gerecht) return null;

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
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 4 }}>Naam</label>
            <input value={form.naam} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { naam: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: 13 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 4 }}>Beschrijving (Smaakprofiel)</label>
            <textarea rows={2} value={form.beschrijving} onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setForm(Object.assign({}, form, { beschrijving: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: 13, resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 4 }}>Ingrediënten (komma-gescheiden)</label>
            <textarea rows={2} value={form.ingredienten} onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setForm(Object.assign({}, form, { ingredienten: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: 13, resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#B48C14', textTransform: 'uppercase', marginBottom: 4 }}>Allergenen (volgens warenwet, komma-gescheiden)</label>
            <input value={form.allergenen} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { allergenen: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'rgba(180,140,20,.1)', border: '1px solid rgba(180,140,20,.3)', borderRadius: 8, color: '#fff', fontSize: 13 }} placeholder="bijv. Gluten, Melk, Noten" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 4 }}>Bereidingswijze (Stappenplan)</label>
            <textarea rows={5} value={form.bereidingswijze} onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setForm(Object.assign({}, form, { bereidingswijze: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: 13, resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 4 }}>Foodcost p.p. (€)</label>
            <input type="number" step="0.01" value={form.kostprijs_pp} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { kostprijs_pp: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: 13 }} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <button onClick={handleDelete} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,.1)', color: 'var(--red)', fontWeight: 600, cursor: 'pointer', transition: '0.2s' }} onMouseEnter={function (e: React.MouseEvent<HTMLButtonElement>) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,.2)'; }} onMouseLeave={function (e: React.MouseEvent<HTMLButtonElement>) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,.1)'; }}>
            <Trash2 size={16} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} /> Verwijderen
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
