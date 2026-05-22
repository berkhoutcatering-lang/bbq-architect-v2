'use client';

import { useState } from 'react';
import { X, Car, Save } from 'lucide-react';
import Button from '@/components/Button';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import type { Voertuig } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: (v: Voertuig) => void;
  initial?: Voertuig | null;
}

const TODAY_ISO = () => new Date().toISOString().slice(0, 10);

export default function VoertuigModal({ open, onClose, onSaved, initial }: Props) {
  const { insert, update } = useSupabase<Voertuig>('voertuigen', []);
  const showToast = useToast();
  const [saving, setSaving] = useState(false);

  const [kenteken, setKenteken] = useState(initial?.kenteken || '');
  const [merk, setMerk] = useState(initial?.merk || '');
  const [type, setType] = useState(initial?.type || '');
  const [ingangsdatum, setIngangsdatum] = useState(initial?.ingangsdatum || TODAY_ISO());
  const [beginKm, setBeginKm] = useState<string>(String(initial?.begin_km ?? 0));
  const [notitie, setNotitie] = useState(initial?.notitie || '');

  if (!open) return null;

  async function save() {
    if (!kenteken.trim()) {
      showToast({ type: 'error', message: 'Kenteken is verplicht' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        kenteken: kenteken.trim().toUpperCase(),
        merk: merk.trim() || null,
        type: type.trim() || null,
        ingangsdatum,
        begin_km: parseInt(beginKm) || 0,
        notitie: notitie.trim() || null,
        actief: true,
      };
      const saved = initial ? await update(initial.id, payload) : await insert(payload);
      if (!saved) throw new Error('Opslaan mislukt');
      showToast({ type: 'success', message: initial ? 'Voertuig bijgewerkt' : 'Voertuig toegevoegd' });
      onSaved?.(saved);
      onClose();
    } catch (e) {
      showToast({ type: 'error', title: 'Fout bij opslaan', message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="metal"
        style={{ width: '100%', maxWidth: 520, padding: 0, overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Car size={18} color="var(--brand)" />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              {initial ? 'Voertuig bewerken' : 'Voertuig toevoegen'}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Sluiten"
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: 20, display: 'grid', gap: 14 }}>
          <Field label="Kenteken">
            <input
              type="text"
              className="form-input"
              value={kenteken}
              onChange={(e) => setKenteken(e.target.value)}
              placeholder="8-VKL-23"
              style={textboxStyle}
              autoFocus
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Merk">
              <input
                type="text"
                value={merk}
                onChange={(e) => setMerk(e.target.value)}
                placeholder="VW"
                style={textboxStyle}
              />
            </Field>
            <Field label="Type">
              <input
                type="text"
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="Crafter (Smoker-bus)"
                style={textboxStyle}
              />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Begin km-stand">
              <input
                type="number"
                min={0}
                value={beginKm}
                onChange={(e) => setBeginKm(e.target.value)}
                placeholder="124530"
                style={textboxStyle}
              />
            </Field>
            <Field label="Ingangsdatum">
              <input
                type="date"
                value={ingangsdatum}
                onChange={(e) => setIngangsdatum(e.target.value)}
                style={textboxStyle}
              />
            </Field>
          </div>

          <Field label="Notitie (optioneel)">
            <textarea
              value={notitie}
              onChange={(e) => setNotitie(e.target.value)}
              placeholder="Bv. Hoofd-bus voor events"
              rows={2}
              style={{ ...textboxStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </Field>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Annuleren
          </Button>
          <Button variant="brand" onClick={save} loading={saving} icon={<Save size={14} />}>
            {initial ? 'Bijwerken' : 'Toevoegen'}
          </Button>
        </div>
      </div>
    </div>
  );
}

const textboxStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  );
}
