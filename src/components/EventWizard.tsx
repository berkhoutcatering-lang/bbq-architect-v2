/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useMemo } from 'react';
import {
  Users, Calendar, MapPin, ChevronRight, ChevronLeft,
  Check, Euro, FileText, Sparkles
} from 'lucide-react';
import SlideOverPanel from './SlideOverPanel';
import KlantAutocomplete from './KlantAutocomplete';
import MetallicCard from './MetallicCard';
import { useSupabase, useSettings } from '@/lib/useSupabase';
import { useToast } from './Toast';
import { fmt, today, addDays, genNummer, calcLineTotals } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

interface EventWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

const STEPS = [
  { label: 'Klant', icon: <Users size={16} /> },
  { label: 'Menu', icon: <FileText size={16} /> },
  { label: 'Details', icon: <Calendar size={16} /> },
  { label: 'Bevestig', icon: <Check size={16} /> },
];

export default function EventWizard({ isOpen, onClose, onComplete }: EventWizardProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const showToast = useToast();
  const { settings } = useSettings();
  const { data: gerechten } = useSupabase('gerechten', []);
  const { data: gangen } = useSupabase('gangen', []);
  const { data: offertes } = useSupabase('offertes', []);

  // Form state
  const [klant, setKlant] = useState({
    naam: '', adres: '', tel: '', email: '', bedrijf: ''
  });
  const [menuSelectie, setMenuSelectie] = useState<Record<string, string[]>>({});
  const [details, setDetails] = useState({
    naam: '', datum: today(), locatie: '', gasten: 50,
    ppp: 45, type: 'Particulier', notitie: ''
  });

  // Menu items for preview
  const menuItems = useMemo(() => {
    const items: { gang: string; naam: string }[] = [];
    const sortedGangen = [...gangen].sort((a: any, b: any) => (a.volgorde || 0) - (b.volgorde || 0));
    sortedGangen.forEach((g: any) => {
      const dishes = menuSelectie[g.slug] || [];
      dishes.forEach((d: string) => {
        items.push({ gang: g.naam, naam: d });
      });
    });
    return items;
  }, [menuSelectie, gangen]);

  const totalMenuDishes = menuItems.length;
  const estimatedOmzet = details.gasten * details.ppp;
  const geldigDagen = settings?.offerte_geldig || 30;

  function canProceed(): boolean {
    if (step === 0) return klant.naam.length > 0;
    if (step === 1) return totalMenuDishes > 0;
    if (step === 2) return details.datum.length > 0 && details.gasten > 0;
    return true;
  }

  async function handleComplete() {
    setSaving(true);
    try {
      // 1. Create offerte
      const nummer = genNummer(settings?.offerte_prefix || 'OFF-2026-', (offertes?.length || 0) + 1);
      const offerteData = {
        nummer,
        status: 'concept',
        client_naam: klant.naam,
        client_adres: klant.adres,
        datum: details.datum,
        geldig_tot: addDays(details.datum, geldigDagen),
        notitie: details.notitie || '',
        aantal_gasten: details.gasten,
        basis_prijs_pp: details.ppp,
        menu_selectie: menuSelectie,
        items: [{ desc: `BBQ Catering - ${details.naam || klant.naam}`, qty: details.gasten, prijs: details.ppp, btw: settings?.default_btw || 21 }],
      };

      const { data: offerte, error: offError } = await supabase!.from('offertes').insert(offerteData).select().single();
      if (offError) throw offError;

      // 2. Create event
      const eventData = {
        name: details.naam || klant.naam,
        date: details.datum,
        location: details.locatie,
        guests: details.gasten,
        ppp: details.ppp,
        status: 'optie',
        client_naam: klant.naam,
        client_adres: klant.adres,
        client_tel: klant.tel,
        client_email: klant.email,
        type: details.type,
        notitie: details.notitie,
        offerte_id: offerte?.id || null,
        menu: [],
      };

      const { error: evError } = await supabase!.from('events').insert(eventData);
      if (evError) throw evError;

      showToast('Event + Offerte aangemaakt!', 'success');
      onComplete?.();
      resetAndClose();
    } catch (err: any) {
      console.error('EventWizard error:', err);
      showToast('Fout: ' + (err.message || 'onbekend'), 'error');
    } finally {
      setSaving(false);
    }
  }

  function resetAndClose() {
    setStep(0);
    setKlant({ naam: '', adres: '', tel: '', email: '', bedrijf: '' });
    setMenuSelectie({});
    setDetails({ naam: '', datum: today(), locatie: '', gasten: 50, ppp: 45, type: 'Particulier', notitie: '' });
    onClose();
  }

  const sortedGangen = [...gangen].sort((a: any, b: any) => (a.volgorde || 0) - (b.volgorde || 0));

  return (
    <SlideOverPanel isOpen={isOpen} onClose={resetAndClose} title="Nieuw Event" width="lg">
      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-6 px-1">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.label}>
            <button
              onClick={() => i < step && setStep(i)}
              className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors"
              style={{
                color: i === step ? '#3b82f6' : i < step ? '#10b981' : 'var(--muted-light)',
                cursor: i < step ? 'pointer' : 'default'
              }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all"
                style={{
                  borderColor: i === step ? '#3b82f6' : i < step ? '#10b981' : 'var(--border)',
                  background: i < step ? 'rgba(16,185,129,.1)' : i === step ? 'rgba(59,130,246,.1)' : 'transparent',
                  color: i === step ? '#3b82f6' : i < step ? '#10b981' : 'var(--muted-light)',
                }}
              >
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              <span className="hidden md:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className="flex-1 h-px" style={{ background: i < step ? '#10b981' : 'var(--border)' }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto">

        {/* Step 0: Klant */}
        {step === 0 && (
          <div className="space-y-4">
            <MetallicCard className="p-5" hover={false}>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-[#c4a35a]" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Klantgegevens</span>
              </div>
              <div className="space-y-3">
                <KlantAutocomplete
                  label="Klantnaam"
                  value={klant.naam}
                  onChange={(v) => setKlant(prev => ({ ...prev, naam: v }))}
                  onSelect={(k: any) => {
                    setKlant({
                      naam: k.naam || '',
                      adres: [k.adres, k.postcode, k.plaats].filter(Boolean).join(', '),
                      tel: k.telefoon || '',
                      email: k.email || '',
                      bedrijf: k.bedrijf || '',
                    });
                    if (!details.naam) setDetails(prev => ({ ...prev, naam: k.naam || '' }));
                  }}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div className="field"><label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Telefoon</label><input value={klant.tel} onChange={e => setKlant(prev => ({ ...prev, tel: e.target.value }))} style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} /></div>
                  <div className="field"><label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Email</label><input type="email" value={klant.email} onChange={e => setKlant(prev => ({ ...prev, email: e.target.value }))} style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} /></div>
                </div>
                <div className="field"><label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Adres</label><input value={klant.adres} onChange={e => setKlant(prev => ({ ...prev, adres: e.target.value }))} style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} /></div>
              </div>
            </MetallicCard>
          </div>
        )}

        {/* Step 1: Menu */}
        {step === 1 && (
          <div className="space-y-4">
            <MetallicCard className="p-5" hover={false}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Menu samenstellen</span>
                <span className="text-[11px] font-medium text-[#3b82f6]">{totalMenuDishes} gerechten</span>
              </div>
              {sortedGangen.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>Geen gangen gevonden. Maak eerst gangen aan.</p>
              ) : (
                <div className="space-y-4">
                  {sortedGangen.map((gang: any) => {
                    const gangGerechten = gerechten.filter((g: any) => g.gang === gang.slug || g.gang_id === gang.id);
                    const selected = menuSelectie[gang.slug] || [];
                    return (
                      <div key={gang.slug}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[12px] font-semibold text-white">{gang.naam}</span>
                          <span className="text-[10px] text-[var(--muted)]">{selected.length} gekozen{gang.min_keuze ? ` / min ${gang.min_keuze}` : ''}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {gangGerechten.map((g: any) => {
                            const isSelected = selected.includes(g.naam);
                            return (
                              <button
                                key={g.id}
                                onClick={() => {
                                  setMenuSelectie(prev => {
                                    const current = prev[gang.slug] || [];
                                    return {
                                      ...prev,
                                      [gang.slug]: isSelected
                                        ? current.filter((n: string) => n !== g.naam)
                                        : [...current, g.naam]
                                    };
                                  });
                                }}
                                style={{
                                  padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                                  background: isSelected ? 'rgba(59,130,246,.12)' : 'var(--bg)',
                                  border: isSelected ? '1px solid #3b82f6' : '1px solid var(--border)',
                                  color: isSelected ? '#3b82f6' : 'var(--text)',
                                  cursor: 'pointer', transition: 'all 0.15s'
                                }}
                              >
                                {isSelected && <Check size={10} style={{ display: 'inline', marginRight: 4 }} />}
                                {g.naam}
                              </button>
                            );
                          })}
                          {gangGerechten.length === 0 && (
                            <span className="text-[11px] text-[var(--muted)]">Geen gerechten in deze gang</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </MetallicCard>
          </div>
        )}

        {/* Step 2: Details */}
        {step === 2 && (
          <div className="space-y-4">
            <MetallicCard className="p-5" hover={false}>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-4 block">Event Details</span>
              <div className="space-y-3">
                <div className="field"><label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Event Naam</label><input value={details.naam} onChange={e => setDetails(prev => ({ ...prev, naam: e.target.value }))} placeholder={klant.naam || 'Event naam'} style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field"><label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Datum</label><input type="date" value={details.datum} onChange={e => setDetails(prev => ({ ...prev, datum: e.target.value }))} style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} /></div>
                  <div className="field"><label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Locatie</label><input value={details.locatie} onChange={e => setDetails(prev => ({ ...prev, locatie: e.target.value }))} placeholder="Adres of locatienaam" style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="field"><label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Gasten</label><input type="number" value={details.gasten} onChange={e => setDetails(prev => ({ ...prev, gasten: parseInt(e.target.value) || 0 }))} style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} /></div>
                  <div className="field"><label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Prijs p.p.</label><input type="number" step="0.50" value={details.ppp} onChange={e => setDetails(prev => ({ ...prev, ppp: parseFloat(e.target.value) || 0 }))} style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} /></div>
                  <div className="field"><label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Type</label>
                    <select value={details.type} onChange={e => setDetails(prev => ({ ...prev, type: e.target.value }))} style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}>
                      <option>Particulier</option>
                      <option>Zakelijk</option>
                      <option>Festival</option>
                    </select>
                  </div>
                </div>
                <div className="field"><label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Notitie</label><textarea rows={2} value={details.notitie} onChange={e => setDetails(prev => ({ ...prev, notitie: e.target.value }))} style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', resize: 'vertical' }} /></div>
              </div>
            </MetallicCard>

            {/* Quick summary */}
            <MetallicCard className="p-4" hover={false} accent="#c4a35a">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--muted)]">Geschatte omzet</span>
                <span className="text-lg font-light text-[#c4a35a]">{fmt(estimatedOmzet)}</span>
              </div>
              <div className="text-[10px] text-[var(--muted-light)] mt-1">{details.gasten} gasten x {fmt(details.ppp)} p.p.</div>
            </MetallicCard>
          </div>
        )}

        {/* Step 3: Preview & Confirm */}
        {step === 3 && (
          <div className="space-y-4">
            <MetallicCard className="p-5" hover={false} accent="#10b981">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-4 block">Samenvatting</span>

              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-[#0e0e10]">
                  <Users className="w-4 h-4 text-[#3b82f6] shrink-0" />
                  <div className="flex-1">
                    <div className="text-[13px] font-medium text-white">{klant.naam}</div>
                    <div className="text-[11px] text-[var(--muted)]">{klant.email || klant.tel || klant.adres || '—'}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-[#0e0e10]">
                  <Calendar className="w-4 h-4 text-[#c4a35a] shrink-0" />
                  <div className="flex-1">
                    <div className="text-[13px] font-medium text-white">{details.naam || klant.naam}</div>
                    <div className="text-[11px] text-[var(--muted)]">{details.datum} • {details.gasten} gasten • {details.locatie || 'Locatie TBD'}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-[#0e0e10]">
                  <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="flex-1">
                    <div className="text-[13px] font-medium text-white">{totalMenuDishes} gerechten</div>
                    <div className="text-[11px] text-[var(--muted)]">
                      {menuItems.slice(0, 3).map(m => m.naam).join(', ')}
                      {menuItems.length > 3 && ` +${menuItems.length - 3} meer`}
                    </div>
                  </div>
                </div>
              </div>
            </MetallicCard>

            <MetallicCard className="p-5" hover={false} accent="#c4a35a">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-[var(--muted)]">Offerte bedrag</span>
                <span className="text-xl font-light text-[#c4a35a]">{fmt(estimatedOmzet)}</span>
              </div>
              <div className="text-[10px] text-[var(--muted-light)]">
                {details.gasten} gasten x {fmt(details.ppp)} p.p. • Geldig tot {addDays(details.datum, geldigDagen)}
              </div>
            </MetallicCard>

            <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
              <p className="text-[11px] text-emerald-400 leading-relaxed">
                <Check size={12} className="inline mr-1" />
                Er wordt automatisch een offerte en event aangemaakt. Na akkoord van de klant kun je de offerte accepteren voor automatische prep-taken, factuur en planning.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 mt-4 border-t border-[var(--border)]">
        <button
          onClick={() => step > 0 ? setStep(step - 1) : resetAndClose()}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[12px] font-medium text-[var(--muted)] hover:text-white hover:bg-[#1a1a1e] transition-colors"
        >
          <ChevronLeft size={14} />
          {step > 0 ? 'Vorige' : 'Annuleren'}
        </button>

        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[12px] font-semibold transition-all"
            style={{
              background: canProceed() ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'var(--card-solid)',
              color: canProceed() ? 'white' : 'var(--muted)',
              cursor: canProceed() ? 'pointer' : 'not-allowed',
              border: canProceed() ? 'none' : '1px solid var(--border)',
            }}
          >
            Volgende <ChevronRight size={14} />
          </button>
        ) : (
          <button
            onClick={handleComplete}
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[12px] font-semibold"
            style={{
              background: 'linear-gradient(135deg, #c4a35a, #a8893e)',
              color: '#000',
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Bezig...' : 'Event + Offerte Aanmaken'}
            {!saving && <Check size={14} />}
          </button>
        )}
      </div>
    </SlideOverPanel>
  );
}
