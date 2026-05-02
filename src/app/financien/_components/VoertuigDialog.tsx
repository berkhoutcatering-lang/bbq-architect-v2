'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import type { DbVoertuig } from '@/types/database.types';

interface Props {
  voertuig: DbVoertuig | null;
  onClose: () => void;
}

export function VoertuigDialog({ voertuig, onClose }: Props) {
  const { orgId } = useOrg();
  const [kenteken, setKenteken] = useState(voertuig?.kenteken ?? '');
  const [merk, setMerk] = useState(voertuig?.merk ?? '');
  const [type, setType] = useState(voertuig?.type ?? '');
  const [ingangsdatum, setIngangsdatum] = useState(voertuig?.ingangsdatum ?? new Date().toISOString().slice(0, 10));
  const [einddatum, setEinddatum] = useState(voertuig?.einddatum ?? '');
  const [beginKm, setBeginKm] = useState<number>(voertuig?.begin_km ?? 0);
  const [actief, setActief] = useState<boolean>(voertuig?.actief ?? true);
  const [notitie, setNotitie] = useState(voertuig?.notitie ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    if (!kenteken.trim()) return setError('Kenteken is verplicht.');
    if (!ingangsdatum) return setError('Ingangsdatum is verplicht.');
    if (!supabase || !orgId) return setError('Niet ingelogd.');

    setSaving(true);
    const payload = {
      organization_id: orgId,
      kenteken: kenteken.trim().toUpperCase(),
      merk: merk.trim() || null,
      type: type.trim() || null,
      ingangsdatum,
      einddatum: einddatum || null,
      begin_km: beginKm,
      actief,
      notitie: notitie.trim() || null,
    };
    const res = voertuig
      ? await supabase.from('voertuigen').update(payload).eq('id', voertuig.id)
      : await supabase.from('voertuigen').insert(payload);
    setSaving(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg shadow-xl p-6 max-w-xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--card, #fff)' }}
      >
        <h2 className="text-lg font-semibold mb-4">
          {voertuig ? 'Voertuig bewerken' : 'Voertuig toevoegen'}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Kenteken" required className="col-span-2">
            <input
              value={kenteken}
              onChange={(e) => setKenteken(e.target.value)}
              placeholder="00-XXX-00"
              className="w-full rounded-md border px-3 py-2 bg-background font-mono uppercase"
              autoFocus
            />
          </Field>
          <Field label="Merk">
            <input
              value={merk}
              onChange={(e) => setMerk(e.target.value)}
              placeholder="VW"
              className="w-full rounded-md border px-3 py-2 bg-background"
            />
          </Field>
          <Field label="Type">
            <input
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="Crafter"
              className="w-full rounded-md border px-3 py-2 bg-background"
            />
          </Field>
          <Field label="Ingangsdatum" required>
            <input
              type="date"
              value={ingangsdatum}
              onChange={(e) => setIngangsdatum(e.target.value)}
              className="w-full rounded-md border px-3 py-2 bg-background"
            />
          </Field>
          <Field label="Einddatum (optioneel)">
            <input
              type="date"
              value={einddatum}
              onChange={(e) => setEinddatum(e.target.value)}
              className="w-full rounded-md border px-3 py-2 bg-background"
            />
          </Field>
          <Field label="Begin km-stand op ingangsdatum" className="col-span-2">
            <input
              type="number"
              inputMode="numeric"
              value={beginKm}
              onChange={(e) => setBeginKm(Number(e.target.value))}
              className="w-full rounded-md border px-3 py-2 bg-background"
            />
          </Field>
          <Field label="Notitie" className="col-span-2">
            <input
              value={notitie}
              onChange={(e) => setNotitie(e.target.value)}
              placeholder="Bijv. Bedrijfsbus, alleen door Mathijs"
              className="w-full rounded-md border px-3 py-2 bg-background"
            />
          </Field>
          <Field label="" className="col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={actief}
                onChange={(e) => setActief(e.target.checked)}
              />
              Voertuig is actief in gebruik
            </label>
          </Field>
        </div>

        {error && <p className="mt-2 text-sm text-destructive" style={{ color: 'var(--danger, #c00)' }}>{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-md border text-sm hover:bg-muted">
            Annuleren
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--brand, #111)', color: 'var(--brand-foreground, #fff)' }}
          >
            {saving ? 'Opslaan…' : voertuig ? 'Bijwerken' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      {label && (
        <span className="text-sm font-medium block mb-1">
          {label}
          {required && (
            <span className="ml-0.5" style={{ color: 'var(--danger, #c00)' }} aria-hidden>
              *
            </span>
          )}
        </span>
      )}
      {children}
    </label>
  );
}
