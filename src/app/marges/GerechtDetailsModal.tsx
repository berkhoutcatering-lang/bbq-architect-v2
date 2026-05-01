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
  // KRITIEK: useState moet ALTIJD aangeroepen worden — niet na een early return.
  // Voorheen stond `if (!gerecht) return null` boven useState wat de Rules of Hooks
  // brak en "change in the order of Hooks" errors gaf bij mount/unmount.
  const [form, setForm] = useState({
    naam: gerecht?.naam || '',
    beschrijving: gerecht?.beschrijving || '',
    ingredienten: normalizeIngs(gerecht?.ingredients_list || gerecht?.ingredienten),
    bereidingswijze: gerecht?.preparation_steps || gerecht?.bereidingswijze || '',
    allergenen: stringifyArray(gerecht?.allergenen),
    kostprijs_pp: gerecht?.kostprijs_pp || '',
  });
  const [saving, setSaving] = useState(false);
  if (!gerecht) return null;

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
            <input value={form.naam} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { naam: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 4 }}>Beschrijving (Smaakprofiel)</label>
            <textarea rows={2} value={form.beschrijving} onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setForm(Object.assign({}, form, { beschrijving: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 4 }}>Ingrediënten (komma-gescheiden)</label>
            <textarea rows={2} value={form.ingredienten} onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setForm(Object.assign({}, form, { ingredienten: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#B48C14', textTransform: 'uppercase', marginBottom: 4 }}>Allergenen (volgens warenwet, komma-gescheiden)</label>
            <input value={form.allergenen} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { allergenen: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'rgba(180,140,20,.1)', border: '1px solid rgba(180,140,20,.3)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }} placeholder="bijv. Gluten, Melk, Noten" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 4 }}>Bereidingswijze (Stappenplan)</label>
            <textarea rows={5} value={form.bereidingswijze} onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setForm(Object.assign({}, form, { bereidingswijze: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 4 }}>Foodcost p.p. (€)</label>
            <input type="number" step="0.01" value={form.kostprijs_pp} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { kostprijs_pp: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }} />
          </div>

          {/* AI-INZICHTEN sectie — toont marge/pijn/top als de AI ze heeft gevuld,
              foto-prompt knop verschijnt ALTIJD (regenereer-knop maakt nieuwe prompt voor oude gerechten zonder). */}
          {(true) && (
            <div style={{ padding: 14, borderRadius: 10, background: 'rgba(167,139,250,.06)', border: '1px solid rgba(167,139,250,.25)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--purple, #a78bfa)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
                ✨ AI-inzichten
              </div>

              {gerecht.marge_pct != null && (
                <div style={{ marginBottom: 10, fontSize: 12 }}>
                  <span style={{ color: 'rgba(255,255,255,.5)' }}>Marge: </span>
                  <strong style={{ color: gerecht.marge_pct >= 70 ? '#4ade80' : gerecht.marge_pct >= 60 ? '#fbbf24' : '#f87171' }}>
                    {gerecht.marge_pct >= 70 ? '🟢' : gerecht.marge_pct >= 60 ? '🟠' : '🔴'} {gerecht.marge_pct}%
                  </strong>
                </div>
              )}

              {gerecht.toppunten && gerecht.toppunten.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', marginBottom: 4 }}>↑ TOPPUNTEN</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
                    {gerecht.toppunten.map(function (p, i) { return <li key={i}>{p}</li>; })}
                  </ul>
                </div>
              )}

              {gerecht.pijnpunten && gerecht.pijnpunten.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#f87171', marginBottom: 4 }}>↓ PIJNPUNTEN</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
                    {gerecht.pijnpunten.map(function (p, i) { return <li key={i}>{p}</li>; })}
                  </ul>
                </div>
              )}

              <FotoPromptKnop initialText={gerecht.foto_prompt || ''} gerechtId={gerecht.id} />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <button onClick={handleDelete} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,.1)', color: 'var(--red)', fontWeight: 600, cursor: 'pointer', transition: '0.2s' }} onMouseEnter={function (e: React.MouseEvent<HTMLButtonElement>) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,.2)'; }} onMouseLeave={function (e: React.MouseEvent<HTMLButtonElement>) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,.1)'; }}>
            <Trash2 size={16} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} /> Verwijderen
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: 'rgba(255,255,255,.5)', fontWeight: 600, cursor: 'pointer' }}>Annuleren</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: 'var(--brand-background, #000)', fontWeight: 800, cursor: 'pointer' }}>
              {saving ? 'Laden...' : 'Wijzigingen Opslaan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Foto-prompt knop met Kopieer + Toon + 🔄 Regenereer.
// Regenereer roept /api/gerechten/regenerate-prompt aan — schrijft nieuwe craft-style
// realistische prompt naar DB en updatet de UI live (geen reload nodig).
function FotoPromptKnop({ initialText, gerechtId }: { initialText: string; gerechtId: number }): React.ReactElement {
  const [text, setText] = useState(initialText);
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function copy(): void {
    if (!text) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        setCopied(true);
        setTimeout(function () { setCopied(false); }, 1800);
      }).catch(function () { /* noop */ });
    }
  }

  async function regenerate(): Promise<void> {
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/gerechten/regenerate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: gerechtId }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Regenereren mislukt');
      setText(json.foto_prompt);
      setShow(true);
    } catch (err: any) {
      setError(err.message || 'Onbekende fout');
    } finally {
      setRegenerating(false);
    }
  }

  const hasText = !!text;
  return (
    <div style={{ marginTop: 6, padding: 10, borderRadius: 8, background: 'rgba(167,139,250,.07)', border: '1px dashed rgba(167,139,250,.4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--purple, #a78bfa)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          📸 AI foto-prompt (Poe / GPT Image 2)
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" onClick={regenerate} disabled={regenerating}
            title="Schrijf een nieuwe craft-style realistische prompt voor dit gerecht"
            style={{ background: 'none', border: '1px solid rgba(167,139,250,.4)', color: 'var(--purple, #a78bfa)', padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: regenerating ? 'wait' : 'pointer', opacity: regenerating ? 0.6 : 1 }}>
            {regenerating ? '⏳ AI bezig…' : (hasText ? '🔄 Regenereer' : '✨ Genereer prompt')}
          </button>
          {hasText && (
            <>
              <button type="button" onClick={() => setShow(function (v) { return !v; })}
                style={{ background: 'none', border: '1px solid rgba(167,139,250,.4)', color: 'var(--purple, #a78bfa)', padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                {show ? 'Verberg' : 'Toon'}
              </button>
              <button type="button" onClick={copy}
                style={{ background: copied ? 'var(--purple, #a78bfa)' : 'none', border: '1px solid rgba(167,139,250,.4)', color: copied ? '#000' : 'var(--purple, #a78bfa)', padding: '4px 12px', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                {copied ? '✓ Gekopieerd' : '📋 Kopieer prompt'}
              </button>
            </>
          )}
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', marginTop: 6 }}>
        {hasText
          ? 'Plak deze prompt in Poe (GPT Image 2) of een andere image-AI. Niet tevreden? Klik 🔄 Regenereer voor een verse versie.'
          : 'Nog geen prompt voor dit gerecht. Klik ✨ Genereer prompt — de AI maakt een craft-style realistische beschrijving op basis van de ingrediënten.'}
      </div>
      {error && (
        <div style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>❌ {error}</div>
      )}
      {show && hasText && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', lineHeight: 1.6, fontFamily: 'var(--font-mono, monospace)', marginTop: 8, padding: '8px 10px', background: 'rgba(0,0,0,.3)', borderRadius: 5, maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{text}</div>
      )}
    </div>
  );
}
