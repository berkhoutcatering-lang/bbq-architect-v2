'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { useToast } from '@/components/Toast';
import { X, Plus, Save, Loader2 } from 'lucide-react';

export interface DishDraft {
  id?: number;
  naam: string;
  gang_slug: string;
  beschrijving?: string;
  kostprijs_pp?: number;
  verkoopprijs?: number;
  marge_pct?: number;
  ingredienten?: string[];
  allergenen?: string[];
  foto_url?: string;
  actief?: boolean;
  is_in_wizard?: boolean;
}

interface DishQuickEditorProps {
  mode: 'create' | 'edit';
  gangSlug?: string;
  gangOptions?: Array<{ slug: string; naam: string }>;
  existing?: DishDraft | null;
  onSave: (dish: DishDraft) => void;
  onClose: () => void;
}

const ALLERGENEN_OPTIES = [
  'Gluten', 'Melk', 'Eieren', 'Vis', 'Noten', 'Soja', 'Selderij',
  'Mosterd', 'Sulfiet', 'Lupine', 'Weekdieren', 'Sesamzaad', 'Pinda',
];

export default function DishQuickEditor({ mode, gangSlug, gangOptions, existing, onSave, onClose }: DishQuickEditorProps) {
  const showToast = useToast();
  const { orgId } = useOrg();
  const [naam, setNaam] = useState(existing?.naam || '');
  const [slug, setSlug] = useState(existing?.gang_slug || gangSlug || 'hoofdgerechten');
  const [beschrijving, setBeschrijving] = useState(existing?.beschrijving || '');
  const [kostprijs, setKostprijs] = useState(existing?.kostprijs_pp ?? 0);
  const [verkoopprijs, setVerkoopprijs] = useState(existing?.verkoopprijs ?? 0);
  const [ingredienten, setIngredienten] = useState((existing?.ingredienten || []).join(', '));
  const [allergenen, setAllergenen] = useState<string[]>(existing?.allergenen || []);
  const [fotoUrl, setFotoUrl] = useState(existing?.foto_url || '');
  const [syncToCatalog, setSyncToCatalog] = useState(true);
  const [saving, setSaving] = useState(false);

  // Auto-bereken marge
  const marge = (() => {
    if (verkoopprijs <= 0 || kostprijs < 0) return null;
    return ((verkoopprijs - kostprijs) / verkoopprijs) * 100;
  })();

  function toggleAllergeen(a: string) {
    setAllergenen(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  }

  async function handleSave() {
    if (!naam.trim()) {
      showToast('Naam is verplicht');
      return;
    }
    setSaving(true);
    const draft: DishDraft = {
      ...(existing?.id ? { id: existing.id } : {}),
      naam: naam.trim(),
      gang_slug: slug,
      beschrijving: beschrijving.trim() || undefined,
      kostprijs_pp: kostprijs > 0 ? kostprijs : undefined,
      verkoopprijs: verkoopprijs > 0 ? verkoopprijs : undefined,
      marge_pct: marge !== null ? Math.round(marge) : undefined,
      ingredienten: ingredienten.split(',').map(s => s.trim()).filter(Boolean),
      allergenen,
      foto_url: fotoUrl.trim() || undefined,
      actief: true,
      is_in_wizard: true,
    };

    // Sync to catalog: insert (create) of update (edit + sync aan)
    const shouldPersist = mode === 'create' || (mode === 'edit' && syncToCatalog);
    if (shouldPersist && supabase) {
      try {
        if (mode === 'create') {
          // RLS vereist organization_id op nieuwe rijen
          if (!orgId) {
            showToast('Geen organisatie gevonden — ververs de pagina en probeer opnieuw.');
            setSaving(false);
            return;
          }
          const { data, error } = await supabase.from('gerechten').insert({ ...draft, organization_id: orgId }).select().single();
          if (error) throw error;
          if (data) {
            draft.id = (data as any).id;
            showToast('Gerecht opgeslagen in catalog');
          }
        } else if (existing?.id) {
          const { error } = await supabase.from('gerechten').update(draft).eq('id', existing.id);
          if (error) throw error;
          showToast('Gerecht bijgewerkt in catalog');
        }
      } catch (err: any) {
        showToast('Opslaan mislukt: ' + (err?.message || 'onbekende fout'));
        setSaving(false);
        return;
      }
    } else {
      showToast('Wijziging alleen op deze offerte');
    }

    setSaving(false);
    onSave(draft);
  }

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box dish-quick-editor" style={{ maxWidth: 560, width: '95%', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>
            {mode === 'create' ? 'Nieuw gerecht' : 'Gerecht aanpassen'}
          </h3>
          <button onClick={onClose} className="btn-icon" aria-label="Sluiten" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 6 }}>
            <X size={18} />
          </button>
        </div>

        <div className="form-grid">
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Naam *</label>
            <input value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="bv. Pulled Pork Slider" autoFocus />
          </div>

          {gangOptions && gangOptions.length > 0 ? (
            <div className="field">
              <label>Gang</label>
              <select value={slug} onChange={(e) => setSlug(e.target.value)}>
                {gangOptions.map(g => <option key={g.slug} value={g.slug}>{g.naam}</option>)}
              </select>
            </div>
          ) : (
            <div className="field">
              <label>Gang</label>
              <input value={slug} onChange={(e) => setSlug(e.target.value)} />
            </div>
          )}

          <div className="field">
            <label>Foto-URL (optioneel)</label>
            <input value={fotoUrl} onChange={(e) => setFotoUrl(e.target.value)} placeholder="https://..." />
          </div>

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Beschrijving</label>
            <textarea
              value={beschrijving}
              onChange={(e) => setBeschrijving(e.target.value)}
              placeholder="Korte smaak/serveer-beschrijving voor de offerte"
              rows={2}
              style={{ resize: 'vertical', minHeight: 60 }}
            />
          </div>

          <div className="field">
            <label>Kostprijs p.p. (€)</label>
            <input type="number" step="0.10" min="0" value={kostprijs} onChange={(e) => setKostprijs(parseFloat(e.target.value) || 0)} />
          </div>

          <div className="field">
            <label>Verkoopprijs (€)</label>
            <input type="number" step="0.10" min="0" value={verkoopprijs} onChange={(e) => setVerkoopprijs(parseFloat(e.target.value) || 0)} />
          </div>

          {marge !== null && (
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <div style={{ padding: '6px 10px', borderRadius: 6, fontSize: 12, background: marge >= 65 ? 'rgba(34,197,94,.08)' : marge >= 55 ? 'rgba(245,158,11,.08)' : 'rgba(239,68,68,.08)', color: marge >= 65 ? 'var(--green)' : marge >= 55 ? 'var(--amber)' : 'var(--red)', border: '1px solid currentColor' }}>
                Marge: {marge.toFixed(1)}% {marge >= 65 ? '🟢 boven streefwaarde' : marge >= 55 ? '🟠 onder doel' : '🔴 te laag'}
              </div>
            </div>
          )}

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Ingrediënten (komma-gescheiden)</label>
            <input value={ingredienten} onChange={(e) => setIngredienten(e.target.value)} placeholder="bv. buikspek, koffie-rub, honing, brioche" />
          </div>

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Allergenen (NL Warenwet)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ALLERGENEN_OPTIES.map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleAllergeen(a)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 14,
                    fontSize: 11,
                    fontWeight: 600,
                    border: '1px solid',
                    cursor: 'pointer',
                    background: allergenen.includes(a) ? 'rgba(239,68,68,.12)' : 'transparent',
                    borderColor: allergenen.includes(a) ? 'rgba(239,68,68,.4)' : 'var(--border)',
                    color: allergenen.includes(a) ? 'var(--red)' : 'var(--muted)',
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {mode === 'edit' && (
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={syncToCatalog}
                  onChange={(e) => setSyncToCatalog(e.target.checked)}
                />
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  Ook in gerechten-catalog opslaan
                </span>
              </label>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, marginLeft: 24 }}>
                {syncToCatalog
                  ? 'Wijziging is overal zichtbaar (volgende offertes zien deze ook).'
                  : 'Wijziging blijft alleen op deze offerte.'}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>
            Annuleren
          </button>
          <button
            className="btn btn-brand"
            onClick={handleSave}
            disabled={saving || !naam.trim()}
            style={{ flex: 1, justifyContent: 'center', opacity: saving || !naam.trim() ? 0.5 : 1 }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : (mode === 'create' ? <Plus size={14} /> : <Save size={14} />)}
            {mode === 'create' ? 'Toevoegen' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  );
}
