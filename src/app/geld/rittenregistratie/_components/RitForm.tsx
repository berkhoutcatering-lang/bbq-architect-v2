'use client';

/**
 * RitForm — gebruik voor zowel nieuwe rit als bewerken.
 * Validation native (geen zod). Tabel-RLS doet de auth.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Camera, Plus, Trash2 } from 'lucide-react';
import Button from '@/components/Button';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import type { Rit, Voertuig, DbEvent } from '@/types';
import VoertuigModal from './VoertuigModal';

interface Props {
  /** Bewerk-modus: bestaande rit. null = nieuwe rit. */
  rit?: Rit | null;
  /** Prefill via ?event= queryparam */
  prefilledEvent?: DbEvent | null;
}

export default function RitForm({ rit, prefilledEvent }: Props) {
  const router = useRouter();
  const showToast = useToast();
  const { data: voertuigen } = useSupabase<Voertuig>('voertuigen', []);
  const { data: ritten, insert, update, remove } = useSupabase<Rit>('ritten', []);
  const { data: events } = useSupabase<DbEvent>('events', []);

  const [voertuigModalOpen, setVoertuigModalOpen] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Kies meest recent gebruikt voertuig als default voor nieuwe rit
  const defaultVoertuigId = useMemo(() => {
    if (rit) return rit.voertuig_id;
    const recent = [...ritten].sort((a, b) => (a.datum < b.datum ? 1 : -1))[0];
    return recent?.voertuig_id ?? voertuigen[0]?.id ?? null;
  }, [rit, ritten, voertuigen]);

  const [voertuigId, setVoertuigId] = useState<number | null>(defaultVoertuigId);
  const [datum, setDatum] = useState(rit?.datum || new Date().toISOString().slice(0, 10));
  const [vertrekTijd, setVertrekTijd] = useState(rit?.vertrek_tijd?.slice(0, 5) || '');
  const [duurMinuten, setDuurMinuten] = useState<string>(rit?.duur_minuten ? String(rit.duur_minuten) : '');
  /* Default vertrek-adres: meest recente rit > leeg. Een hardcoded default
     hoort niet in een multi-tenant app (toonde "Hop & Bites HQ, Borger" voor
     elke tenant). */
  const lastVertrekAdres = useMemo(() => {
    const recent = [...ritten].sort((a, b) => (a.datum < b.datum ? 1 : -1))[0];
    return recent?.vertrek_adres || '';
  }, [ritten]);
  const [vertrekAdres, setVertrekAdres] = useState(rit?.vertrek_adres || lastVertrekAdres);
  const [aankomstAdres, setAankomstAdres] = useState(rit?.aankomst_adres || prefilledEvent?.location || '');
  const [routeOmleiding, setRouteOmleiding] = useState(rit?.route_omleiding || '');
  const [kmBegin, setKmBegin] = useState<string>(String(rit?.km_begin ?? ''));
  const [kmEind, setKmEind] = useState<string>(String(rit?.km_eind ?? ''));
  const [doel, setDoel] = useState(rit?.doel || prefilledEvent?.name || '');
  const [zakelijk, setZakelijk] = useState(rit?.zakelijk ?? true);
  const [priveOmleiding, setPriveOmleiding] = useState<string>(String(rit?.prive_omleiding_km ?? 0));
  const [eventId, setEventId] = useState<number | null>(rit?.event_id ?? prefilledEvent?.id ?? null);

  // Sync default voertuig wanneer ritten/voertuigen later laden
  useEffect(() => {
    if (voertuigId === null && defaultVoertuigId !== null) setVoertuigId(defaultVoertuigId);
  }, [defaultVoertuigId, voertuigId]);

  // Sync default vertrek-adres wanneer ritten async laden (nieuwe rit alleen)
  useEffect(() => {
    if (rit) return;
    if (vertrekAdres) return;
    if (lastVertrekAdres) setVertrekAdres(lastVertrekAdres);
  }, [lastVertrekAdres, rit, vertrekAdres]);

  // Auto-vullen km_begin vanuit laatste rit van geselecteerd voertuig (alleen nieuwe rit)
  useEffect(() => {
    if (rit) return;
    if (!voertuigId) return;
    if (kmBegin) return;
    const recent = [...ritten]
      .filter((r) => r.voertuig_id === voertuigId)
      .sort((a, b) => (a.datum < b.datum ? 1 : -1))[0];
    if (recent?.km_eind) setKmBegin(String(recent.km_eind));
    else {
      const v = voertuigen.find((vv) => vv.id === voertuigId);
      if (v?.begin_km) setKmBegin(String(v.begin_km));
    }
  }, [voertuigId, ritten, voertuigen, kmBegin, rit]);

  const upcomingEvents = useMemo(
    () => events.filter((e) => e.date >= new Date().toISOString().slice(0, 10)).slice(0, 50),
    [events],
  );

  const km = useMemo(() => {
    const b = parseInt(kmBegin) || 0;
    const e = parseInt(kmEind) || 0;
    return Math.max(0, e - b);
  }, [kmBegin, kmEind]);

  function validate(): string | null {
    if (!voertuigId) return 'Kies of voeg een voertuig toe';
    if (!datum) return 'Datum is verplicht';
    if (!vertrekAdres.trim()) return 'Vertrek-adres is verplicht';
    if (!aankomstAdres.trim()) return 'Aankomst-adres is verplicht';
    const b = parseInt(kmBegin);
    const e = parseInt(kmEind);
    if (!Number.isFinite(b) || b < 0) return 'Begin km-stand is verplicht';
    if (!Number.isFinite(e) || e < b) return 'Eind km-stand moet ≥ begin zijn';
    const po = parseInt(priveOmleiding) || 0;
    if (po < 0 || po > e - b) return 'Privé-omleiding moet tussen 0 en de afstand liggen';
    return null;
  }

  async function save() {
    const err = validate();
    if (err) {
      showToast({ type: 'error', message: err });
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<Rit> = {
        voertuig_id: voertuigId!,
        datum,
        vertrek_tijd: vertrekTijd ? vertrekTijd + ':00' : null,
        duur_minuten: duurMinuten ? parseInt(duurMinuten) : null,
        vertrek_adres: vertrekAdres.trim(),
        aankomst_adres: aankomstAdres.trim(),
        route_omleiding: routeOmleiding.trim() || null,
        km_begin: parseInt(kmBegin),
        km_eind: parseInt(kmEind),
        zakelijk,
        prive_omleiding_km: zakelijk ? parseInt(priveOmleiding) || 0 : 0,
        doel: doel.trim() || null,
        event_id: eventId,
        status: rit?.status ?? 'open',
      };
      const saved = rit ? await update(rit.id, payload) : await insert(payload);
      if (!saved) throw new Error('Opslaan mislukt');
      showToast({ type: 'success', message: rit ? 'Rit bijgewerkt' : 'Rit toegevoegd' });
      router.push(`/geld/rittenregistratie/${saved.id}`);
    } catch (e) {
      showToast({ type: 'error', title: 'Fout bij opslaan', message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!rit) return;
    if (!confirm(`Rit ${rit.id} verwijderen? Dit kan niet ongedaan gemaakt worden.`)) return;
    setDeleting(true);
    try {
      await remove(rit.id);
      showToast({ type: 'success', message: 'Rit verwijderd' });
      router.push('/geld/rittenregistratie');
    } catch (e) {
      showToast({ type: 'error', title: 'Fout bij verwijderen', message: (e as Error).message });
    } finally {
      setDeleting(false);
    }
  }

  async function handleScanKm(file: File) {
    setScanLoading(true);
    try {
      const reader = new FileReader();
      const dataUrl: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const r = await fetch('/api/ritten/scan-km', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });
      const j = await r.json();
      if (!r.ok || !j.kmStand) throw new Error(j.error || 'Geen km-stand herkend');
      setKmEind(String(j.kmStand));
      showToast({ type: 'success', message: `KM-stand herkend: ${j.kmStand}` });
    } catch (e) {
      showToast({
        type: 'error',
        title: 'Scan mislukt',
        message: (e as Error).message,
      });
    } finally {
      setScanLoading(false);
    }
  }

  return (
    <div className="main-content" style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 18 }}>
        <Link
          href={rit ? `/geld/rittenregistratie/${rit.id}` : '/geld/rittenregistratie'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 999,
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            fontSize: 12,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={13} />
          {rit ? 'Terug naar rit' : 'Alle ritten'}
        </Link>
      </div>

      <h1 style={{ fontWeight: 300, fontSize: 30, margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
        {rit ? `Rit r-${String(rit.id).padStart(3, '0')} bewerken` : 'Nieuwe rit'}
      </h1>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 24px 0' }}>
        {rit ? 'Pas de gegevens aan en bewaar.' : 'Vul de rit in. Belastingdienst-velden zijn vereist.'}
      </p>

      <div className="metal" style={{ padding: 22 }}>
        <Section title="Voertuig & datum">
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14 }}>
            <Field label="Voertuig">
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={voertuigId ?? ''}
                  onChange={(e) => setVoertuigId(e.target.value ? parseInt(e.target.value) : null)}
                  style={textboxStyle}
                >
                  {voertuigen.length === 0 && <option value="">Geen voertuig — voeg toe</option>}
                  {voertuigen.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.kenteken} {v.merk ? `· ${v.merk}` : ''} {v.type ? v.type : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setVoertuigModalOpen(true)}
                  style={addButtonStyle}
                  title="Voertuig toevoegen"
                >
                  <Plus size={14} />
                </button>
              </div>
            </Field>
            <Field label="Datum">
              <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} style={textboxStyle} />
            </Field>
            <Field label="Tijd (optioneel)">
              <input
                type="time"
                value={vertrekTijd}
                onChange={(e) => setVertrekTijd(e.target.value)}
                style={textboxStyle}
              />
            </Field>
          </div>
        </Section>

        <Section title="Route">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Vertrek-adres">
              <input
                type="text"
                value={vertrekAdres}
                onChange={(e) => setVertrekAdres(e.target.value)}
                placeholder="Bedrijfsadres"
                list="adres-suggesties"
                style={textboxStyle}
              />
            </Field>
            <Field label="Aankomst-adres">
              <input
                type="text"
                value={aankomstAdres}
                onChange={(e) => setAankomstAdres(e.target.value)}
                placeholder="Sligro Emmen, James Wattstraat 12"
                list="adres-suggesties"
                style={textboxStyle}
              />
            </Field>
          </div>
          <datalist id="adres-suggesties">
            {Array.from(new Set([...ritten.map((r) => r.vertrek_adres), ...ritten.map((r) => r.aankomst_adres)]))
              .filter(Boolean)
              .slice(0, 30)
              .map((a) => (
                <option key={a} value={a} />
              ))}
          </datalist>

          {zakelijk && (
            <Field label="Route-afwijking (optioneel — Belastingdienst-eis bij zakelijke ritten met privé-omleiding)">
              <input
                type="text"
                value={routeOmleiding}
                onChange={(e) => setRouteOmleiding(e.target.value)}
                placeholder="Via Westerbork omdat A28 dicht was"
                style={textboxStyle}
              />
            </Field>
          )}
        </Section>

        <Section title="Kilometers">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <Field label="Begin km-stand">
              <input
                type="number"
                min={0}
                value={kmBegin}
                onChange={(e) => setKmBegin(e.target.value)}
                placeholder="124530"
                style={textboxStyle}
              />
            </Field>
            <Field label={`Eind km-stand${km ? ` · ${km} km` : ''}`}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="number"
                  min={0}
                  value={kmEind}
                  onChange={(e) => setKmEind(e.target.value)}
                  placeholder="124549"
                  style={textboxStyle}
                />
                <label style={{ ...addButtonStyle, position: 'relative', cursor: 'pointer' }}>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleScanKm(f);
                      e.target.value = '';
                    }}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                    disabled={scanLoading}
                  />
                  {scanLoading ? (
                    <span style={{ fontSize: 11 }}>…</span>
                  ) : (
                    <Camera size={14} />
                  )}
                </label>
              </div>
            </Field>
            <Field label="Reistijd (min, optioneel)">
              <input
                type="number"
                min={0}
                value={duurMinuten}
                onChange={(e) => setDuurMinuten(e.target.value)}
                placeholder="24"
                style={textboxStyle}
              />
            </Field>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
            Tip: druk op het camera-icoon om een foto van je dashboard te scannen — AI vult de eind-km automatisch in.
          </div>
        </Section>

        <Section title="Doel & koppeling">
          <Field label="Doel / notitie">
            <input
              type="text"
              value={doel}
              onChange={(e) => setDoel(e.target.value)}
              placeholder="Brisket + rubs ophalen voor Velema 20-jun"
              style={textboxStyle}
            />
          </Field>
          {upcomingEvents.length > 0 && (
            <Field label="Gekoppeld event (optioneel)">
              <select
                value={eventId ?? ''}
                onChange={(e) => setEventId(e.target.value ? parseInt(e.target.value) : null)}
                style={textboxStyle}
              >
                <option value="">— Geen event —</option>
                {upcomingEvents.map((e) => (
                  <option key={e.id} value={e.id}>
                    #{e.id} · {e.name} · {e.date}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </Section>

        <Section title="Fiscaal">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={zakelijk}
              onChange={(e) => setZakelijk(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13 }}>Zakelijke rit (telt mee voor de €0,23/km Belastingdienst-vergoeding)</span>
          </label>
          {zakelijk && (
            <Field label="Privé-omleiding (km die NIET zakelijk waren)">
              <input
                type="number"
                min={0}
                max={km}
                value={priveOmleiding}
                onChange={(e) => setPriveOmleiding(e.target.value)}
                style={{ ...textboxStyle, maxWidth: 200 }}
              />
            </Field>
          )}
        </Section>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          marginTop: 18,
          flexWrap: 'wrap',
        }}
      >
        <div>
          {rit && (
            <Button variant="red" icon={<Trash2 size={14} />} onClick={handleDelete} loading={deleting}>
              Verwijder rit
            </Button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            href={rit ? `/geld/rittenregistratie/${rit.id}` : '/geld/rittenregistratie'}
            style={{ textDecoration: 'none' }}
          >
            <Button variant="ghost">Annuleren</Button>
          </Link>
          <Button variant="brand" icon={<Save size={14} />} onClick={save} loading={saving}>
            {rit ? 'Wijzigingen bewaren' : 'Rit toevoegen'}
          </Button>
        </div>
      </div>

      <VoertuigModal
        open={voertuigModalOpen}
        onClose={() => setVoertuigModalOpen(false)}
        onSaved={(v) => setVoertuigId(v.id)}
      />
    </div>
  );
}

const textboxStyle: React.CSSProperties = {
  flex: 1,
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

const addButtonStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 8,
  background: 'rgba(255,191,0,0.08)',
  border: '1px solid rgba(255,191,0,0.3)',
  color: 'var(--brand)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        {title}
      </div>
      <div style={{ display: 'grid', gap: 14 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  );
}
