'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { useSupabase } from '@/lib/useSupabase';
import { bedragAftrekbaar } from '@/lib/ritten-tarieven';
import { ScanKmButton } from './ScanKmButton';
import type { DbVoertuig, DbRit, DbEvent } from '@/types/database.types';

interface PrefilledFromEvent {
  event_id: number;
  aankomst_adres: string;
  datum: string;
}

interface Props {
  rit: DbRit | null;
  voertuigen: DbVoertuig[];
  onClose: () => void;
  prefilledFromEvent?: PrefilledFromEvent;
}

function fmtEUR(n: number): string {
  return n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function RitDialog({ rit, voertuigen, onClose, prefilledFromEvent }: Props) {
  const { orgId } = useOrg();
  const { data: events } = useSupabase<DbEvent>('events', []);
  const { data: alleRitten } = useSupabase<DbRit>('ritten', []);

  const eersteActiefId = voertuigen.find((v) => v.actief)?.id ?? voertuigen[0]?.id ?? '';

  const [voertuigId, setVoertuigId] = useState<number | ''>(rit?.voertuig_id ?? eersteActiefId);
  const [datum, setDatum] = useState<string>(
    rit?.datum ?? prefilledFromEvent?.datum ?? new Date().toISOString().slice(0, 10),
  );
  const [vertrekAdres, setVertrekAdres] = useState<string>(rit?.vertrek_adres ?? '');
  const [aankomstAdres, setAankomstAdres] = useState<string>(
    rit?.aankomst_adres ?? prefilledFromEvent?.aankomst_adres ?? '',
  );
  const [routeOmleiding, setRouteOmleiding] = useState<string>(rit?.route_omleiding ?? '');
  const [kmBegin, setKmBegin] = useState<number>(rit?.km_begin ?? 0);
  const [kmEind, setKmEind] = useState<number>(rit?.km_eind ?? 0);
  const [zakelijk, setZakelijk] = useState<boolean>(rit?.zakelijk ?? true);
  const [priveOmleidingKm, setPriveOmleidingKm] = useState<number>(rit?.prive_omleiding_km ?? 0);
  const [doel, setDoel] = useState<string>(rit?.doel ?? '');
  const [eventId, setEventId] = useState<number | null>(rit?.event_id ?? prefilledFromEvent?.event_id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanLowConfidence, setScanLowConfidence] = useState(false);
  const [scanConfirmed, setScanConfirmed] = useState(false);

  // Pre-fill begin-km uit laatste rit van dit voertuig
  useEffect(() => {
    if (!voertuigId || rit) return;
    const laatste = alleRitten
      .filter((r) => r.voertuig_id === voertuigId && r.datum <= datum)
      .sort((a, b) => b.datum.localeCompare(a.datum))[0];
    if (laatste && kmBegin === 0) setKmBegin(laatste.km_eind);
  }, [voertuigId, datum, alleRitten, rit, kmBegin]);

  const kilometers = Math.max(0, kmEind - kmBegin);
  const aftrek = bedragAftrekbaar({ kilometers, zakelijk, priveOmleidingKm, datum });

  async function save() {
    setError(null);
    if (!voertuigId) return setError('Kies een voertuig.');
    if (kmEind < kmBegin) return setError('Eindstand kan niet lager zijn dan beginstand.');
    if (priveOmleidingKm > kilometers) return setError('Privé-omleiding kan niet groter zijn dan totaal.');
    if (!vertrekAdres.trim() || !aankomstAdres.trim())
      return setError('Vertrek- en aankomstadres zijn verplicht.');
    if (scanLowConfidence && !scanConfirmed)
      return setError('Bevestig dat je de km-stand handmatig hebt gecontroleerd.');
    if (!supabase || !orgId) return setError('Niet ingelogd.');

    setSaving(true);
    const payload = {
      organization_id: orgId,
      voertuig_id: Number(voertuigId),
      event_id: eventId,
      datum,
      vertrek_adres: vertrekAdres.trim(),
      aankomst_adres: aankomstAdres.trim(),
      route_omleiding: routeOmleiding.trim() || null,
      km_begin: kmBegin,
      km_eind: kmEind,
      zakelijk,
      prive_omleiding_km: priveOmleidingKm,
      doel: doel.trim() || null,
    };
    const res = rit
      ? await supabase.from('ritten').update(payload).eq('id', rit.id)
      : await supabase.from('ritten').insert(payload);
    setSaving(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    onClose();
  }

  function handleScanResult(target: 'begin' | 'eind', km: number, vertrouwen: 'hoog' | 'midden' | 'laag') {
    if (target === 'begin') setKmBegin(km);
    else setKmEind(km);
    if (vertrouwen !== 'hoog') {
      setScanLowConfidence(true);
      setScanConfirmed(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--card, #fff)' }}
      >
        <h2 className="text-lg font-semibold mb-4">{rit ? 'Rit bewerken' : 'Rit toevoegen'}</h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Voertuig" required>
            <select
              value={voertuigId}
              onChange={(e) => setVoertuigId(Number(e.target.value))}
              className="w-full rounded-md border px-3 py-2"
              style={{ background: 'var(--bg, #fff)' }}
            >
              <option value="">Kies…</option>
              {voertuigen.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.kenteken} · {v.merk ?? ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Datum" required>
            <input
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
              style={{ background: 'var(--bg, #fff)' }}
            />
          </Field>
          <Field label="Vertrek-adres" required className="col-span-2">
            <input
              value={vertrekAdres}
              onChange={(e) => setVertrekAdres(e.target.value)}
              placeholder="Bijv. Schoonoord, Hoofdstraat 12"
              autoComplete="off"
              className="w-full rounded-md border px-3 py-2"
              style={{ background: 'var(--bg, #fff)' }}
            />
          </Field>
          <Field label="Aankomst-adres" required className="col-span-2">
            <input
              value={aankomstAdres}
              onChange={(e) => setAankomstAdres(e.target.value)}
              placeholder="Bijv. Drachten, Burg. Wuiteweg 1"
              autoComplete="off"
              className="w-full rounded-md border px-3 py-2"
              style={{ background: 'var(--bg, #fff)' }}
            />
          </Field>
          <Field label="Begin km-stand" required>
            <input
              type="number"
              inputMode="numeric"
              value={kmBegin}
              onChange={(e) => setKmBegin(Number(e.target.value))}
              className="w-full rounded-md border px-3 py-2"
              style={{ background: 'var(--bg, #fff)' }}
            />
          </Field>
          <Field label="Eind km-stand" required>
            <input
              type="number"
              inputMode="numeric"
              value={kmEind}
              onChange={(e) => setKmEind(Number(e.target.value))}
              className="w-full rounded-md border px-3 py-2"
              style={{ background: 'var(--bg, #fff)' }}
            />
          </Field>
          <Field label="" className="col-span-2">
            <div className="flex flex-wrap gap-2">
              <ScanKmButton
                label="Foto begin-stand"
                onScan={(km, v) => handleScanResult('begin', km, v)}
              />
              <ScanKmButton
                label="Foto eind-stand"
                onScan={(km, v) => handleScanResult('eind', km, v)}
              />
            </div>
          </Field>
          <Field label="Doel" className="col-span-2">
            <input
              value={doel}
              onChange={(e) => setDoel(e.target.value)}
              placeholder="Bijv. BBQ event Smit / Leverancier / Klantbezoek"
              className="w-full rounded-md border px-3 py-2"
              style={{ background: 'var(--bg, #fff)' }}
            />
          </Field>
          <Field label="Gekoppeld event (optioneel)" className="col-span-2">
            <select
              value={eventId ?? ''}
              onChange={(e) => setEventId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-md border px-3 py-2"
              style={{ background: 'var(--bg, #fff)' }}
            >
              <option value="">— Geen event —</option>
              {events.slice(0, 50).map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.date} · {ev.name || ev.location}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type" className="col-span-2">
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={zakelijk} onChange={() => setZakelijk(true)} />
                Zakelijk
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={!zakelijk} onChange={() => setZakelijk(false)} />
                Privé
              </label>
            </div>
          </Field>
          {zakelijk && (
            <Field label="Privé-omleiding (km)" className="col-span-2">
              <input
                type="number"
                inputMode="numeric"
                value={priveOmleidingKm}
                onChange={(e) => setPriveOmleidingKm(Number(e.target.value))}
                className="w-full rounded-md border px-3 py-2"
                style={{ background: 'var(--bg, #fff)' }}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--muted, #888)' }}>
                Bij gemengde rit: km dat privé was. Wordt afgetrokken van aftrekbaar bedrag.
              </p>
            </Field>
          )}
          {/* Route-veld is alleen relevant voor zakelijke ritten — privé hoeft
              dit niet voor de Belastingdienst. State blijft behouden bij toggle. */}
          {zakelijk && (
            <Field label="Route (alleen invullen als afwijkend)" className="col-span-2">
              <input
                value={routeOmleiding}
                onChange={(e) => setRouteOmleiding(e.target.value)}
                placeholder="Bijv. via Beilen i.p.v. snelweg"
                className="w-full rounded-md border px-3 py-2"
                style={{ background: 'var(--bg, #fff)' }}
              />
            </Field>
          )}
        </div>

        <div
          className="mt-4 p-3 rounded-md text-sm"
          style={{ background: 'var(--bg-soft, #f5f5f5)' }}
        >
          <strong>{kilometers} km</strong> · {zakelijk ? 'zakelijk' : 'privé'}
          {zakelijk && (
            <>
              {' '}
              · aftrekbaar: <strong>€ {fmtEUR(aftrek)}</strong>
            </>
          )}
        </div>

        {scanLowConfidence && (
          <label className="mt-3 flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
            <input
              type="checkbox"
              checked={scanConfirmed}
              onChange={(e) => setScanConfirmed(e.target.checked)}
            />
            Ik heb de km-stand handmatig gecontroleerd (de AI was niet zeker).
          </label>
        )}

        {error && (
          <p className="mt-2 text-sm" style={{ color: 'var(--danger, #c00)' }}>
            {error}
          </p>
        )}

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
            {saving ? 'Opslaan…' : rit ? 'Bijwerken' : 'Opslaan'}
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
