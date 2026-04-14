/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Users, Calendar, MapPin, ChevronRight, ChevronLeft, Check, Euro,
  FileText, Sparkles, UtensilsCrossed, StickyNote, ClipboardList,
  Sun, CloudRain, Clock, HeartHandshake
} from 'lucide-react';
import MetallicCard from '@/components/MetallicCard';
import KlantAutocomplete from '@/components/KlantAutocomplete';
import { useSupabase, useSettings } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { fmt, today, addDays, genNummer, nextNummer } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { ALLERGENEN, DIEETWENSEN } from '@/lib/constants';
import PageHint from '@/components/PageHint';

const STEPS = [
  { label: 'Klant', icon: <Users size={16} /> },
  { label: 'Event', icon: <Calendar size={16} /> },
  { label: 'Menu', icon: <UtensilsCrossed size={16} /> },
  { label: 'Budget', icon: <Euro size={16} /> },
  { label: 'Notities', icon: <StickyNote size={16} /> },
  { label: 'Overzicht', icon: <ClipboardList size={16} /> },
];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', fontSize: 14,
  background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 10, color: 'var(--text)',
};
const labelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--muted)', marginBottom: 6, display: 'block',
  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
};

function PillSelect({ options, value, onChange, color = '#3b82f6' }: { options: string[]; value: string; onChange: (v: string) => void; color?: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map(function (opt) {
        const active = value === opt;
        return (
          <button key={opt} onClick={function () { onChange(opt); }} style={{
            padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            border: active ? '2px solid ' + color : '1px solid var(--border)',
            background: active ? color + '15' : 'transparent',
            color: active ? color : 'var(--muted)', cursor: 'pointer', transition: 'all 0.15s',
          }}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export default function KlantGesprek() {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const showToast = useToast();
  const { settings } = useSettings();
  const { data: gerechten } = useSupabase('gerechten', []);
  const { data: gangen } = useSupabase('gangen', []);
  const { data: offertes } = useSupabase('offertes', []);
  const { data: klanten, insert: insertKlant } = useSupabase('klanten', []);

  // ── Form State ──
  const [klant, setKlant] = useState({
    naam: '', bedrijf: '', telefoon: '', email: '', adres: '', type: 'Particulier',
  });
  const [event, setEvent] = useState({
    naam: '', datum: today(), locatie: '', gasten: 50, vegaGasten: 0,
    binnenBuiten: 'Buiten', startTijd: '16:00', eindTijd: '22:00',
  });
  const [menuSelectie, setMenuSelectie] = useState<Record<string, string[]>>({});
  const [menuExtra, setMenuExtra] = useState({ speciale_wensen: '', dieet_opmerkingen: '' });
  const [gastenDieet, setGastenDieet] = useState<{ id: number; label: string; allergenen: string[]; dieet: string }[]>([]);
  const [budget, setBudget] = useState({
    ppp: 45, dranken: 'Eigen regeling', serveerwijze: 'BBQ Live Cooking',
    tafels: false, stoelen: false, materieel: false,
  });
  const [notities, setNotities] = useState({
    tekst: '', locatieNotes: '', concurrentie: 'Nee', concurrentieDetail: '', followUp: '',
  });

  // ── LocalStorage auto-save (debounced to avoid write spam) ──
  const STORAGE_KEY = 'bbq_klantgesprek_draft';
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(function () {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.klant) setKlant(data.klant);
        if (data.event) setEvent(data.event);
        if (data.menuSelectie) setMenuSelectie(data.menuSelectie);
        if (data.menuExtra) setMenuExtra(data.menuExtra);
        if (data.gastenDieet) setGastenDieet(data.gastenDieet);
        if (data.budget) setBudget(data.budget);
        if (data.notities) setNotities(data.notities);
        if (data.step) setStep(data.step);
      }
    } catch { /* ignore */ }
  }, []);

  const saveDraft = useCallback(function () {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ klant, event, menuSelectie, menuExtra, gastenDieet, budget, notities, step }));
    } catch { /* ignore */ }
  }, [klant, event, menuSelectie, menuExtra, gastenDieet, budget, notities, step]);

  useEffect(function () {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(saveDraft, 500);
    return function () { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [saveDraft]);

  // ── Computed ──
  const sortedGangen = useMemo(function () {
    return [...gangen].sort(function (a: any, b: any) { return (a.volgorde || 0) - (b.volgorde || 0); });
  }, [gangen]);

  const totalMenuDishes = Object.values(menuSelectie).reduce(function (s, arr) { return s + arr.length; }, 0);
  const totaalBedrag = event.gasten * budget.ppp;

  // Dieet breakdown: hoeveel gasten vallen terug op vega?
  const vegaGastenFromDieet = gastenDieet.filter(function (g) { return g.dieet === 'vega' || g.dieet === 'vegan'; }).length;
  const allergieGastenNeedVega = gastenDieet.filter(function (g) {
    if (g.dieet === 'vega' || g.dieet === 'vegan') return false; // already counted
    if (g.allergenen.length === 0) return false;
    // Check if any selected dish has a conflicting allergen
    const allSelectedDishes = Object.values(menuSelectie).flat();
    const dishData = gerechten.filter(function (d: any) { return allSelectedDishes.includes(d.naam); });
    return dishData.some(function (d: any) {
      const dishAllergens = (d.allergenen || []).map(function (a: string) { return a.toLowerCase(); });
      return g.allergenen.some(function (a) { return dishAllergens.some(function (da: string) { return da.includes(a) || a.includes(da); }); });
    });
  }).length;
  const totalVegaMenu = event.vegaGasten + vegaGastenFromDieet + allergieGastenNeedVega;
  const totalNormaalMenu = event.gasten - totalVegaMenu;

  function canProceed(): boolean {
    if (step === 0) return klant.naam.trim().length >= 2;
    if (step === 1) return event.datum.length > 0 && event.gasten > 0;
    return true;
  }

  // ── Save handlers ──
  async function saveAsConceptOfferte() {
    setSaving(true);
    try {
      // 1. Klant upsert
      const bestaandeKlant = klanten.find(function (k: any) { return k.naam === klant.naam; });
      let klantId = bestaandeKlant?.id;
      if (!bestaandeKlant) {
        const newK = await insertKlant({
          naam: klant.naam, bedrijf: klant.bedrijf, telefoon: klant.telefoon,
          email: klant.email, adres: klant.adres, type: klant.type,
          notities: notities.tekst,
        } as any);
        klantId = newK?.id;
      }

      // 2. Offerte aanmaken
      const nummer = nextNummer(settings?.offerte_prefix || 'OFF-2026-', (offertes || []).map((o: any) => o.nummer));
      const geldigDagen = settings?.offerte_geldig || 30;
      const dieetTekst = gastenDieet.length > 0 ? 'Dieetwensen:\n' + gastenDieet.map(function (g) {
        const parts = [];
        if (g.dieet !== 'geen') parts.push(g.dieet);
        if (g.allergenen.length > 0) parts.push(g.allergenen.join(', '));
        return '- ' + g.label + ': ' + parts.join(' + ') + ' → vega menu';
      }).join('\n') + '\nTotaal: ' + totalNormaalMenu + ' normaal, ' + totalVegaMenu + ' vega' : '';
      const notitieTekst = [
        notities.tekst,
        dieetTekst,
        menuExtra.speciale_wensen ? 'Speciale wensen: ' + menuExtra.speciale_wensen : '',
        'Dranken: ' + budget.dranken,
        'Serveerwijze: ' + budget.serveerwijze,
        event.binnenBuiten === 'Binnen' ? 'Binnen-event' : 'Buiten-event',
        budget.tafels ? 'Tafels nodig' : '',
        budget.stoelen ? 'Stoelen nodig' : '',
        budget.materieel ? 'Extra materieel nodig' : '',
        notities.locatieNotes ? 'Locatie: ' + notities.locatieNotes : '',
        notities.concurrentie === 'Ja' ? 'Concurrent offertes: ' + notities.concurrentieDetail : '',
      ].filter(Boolean).join('\n');

      const offerteData: any = {
        nummer,
        status: 'concept',
        client_naam: klant.naam,
        client_adres: klant.adres,
        datum: event.datum,
        geldig_tot: addDays(event.datum, geldigDagen),
        notitie: notitieTekst,
        aantal_gasten: event.gasten,
        aantal_vega: totalVegaMenu,
        basis_prijs_pp: budget.ppp,
        menu_selectie: menuSelectie,
        items: [{ desc: 'BBQ Catering - ' + (event.naam || klant.naam), qty: event.gasten, prijs: budget.ppp, btw: settings?.default_btw || 21 }],
      };

      const offRes = await supabase!.from('offertes').insert(offerteData).select();
      const offerteId = offRes.data?.[0]?.id || null;

      // 3. Event aanmaken
      await supabase!.from('events').insert({
        name: event.naam || klant.naam,
        date: event.datum,
        location: event.locatie,
        guests: event.gasten,
        ppp: budget.ppp,
        status: 'optie',
        client_naam: klant.naam,
        client_adres: klant.adres,
        client_tel: klant.telefoon,
        client_email: klant.email,
        type: klant.type,
        notitie: notitieTekst,
        offerte_id: offerteId,
        menu: [],
      });

      showToast('Klant + Offerte + Event aangemaakt!', 'success');
      clearDraft();
    } catch (err: any) {
      showToast('Fout: ' + (err.message || 'onbekend'), 'error');
    } finally { setSaving(false); }
  }

  async function saveNoteOnly() {
    setSaving(true);
    try {
      const bestaandeKlant = klanten.find(function (k: any) { return k.naam === klant.naam; });
      if (!bestaandeKlant) {
        await insertKlant({
          naam: klant.naam, bedrijf: klant.bedrijf, telefoon: klant.telefoon,
          email: klant.email, adres: klant.adres, type: klant.type,
          notities: notities.tekst + (notities.followUp ? '\nFollow-up: ' + notities.followUp : ''),
        } as any);
      }
      showToast('Klant + notitie opgeslagen', 'success');
      clearDraft();
    } catch (err: any) {
      showToast('Fout: ' + (err.message || 'onbekend'), 'error');
    } finally { setSaving(false); }
  }

  function clearDraft() {
    setStep(0);
    setKlant({ naam: '', bedrijf: '', telefoon: '', email: '', adres: '', type: 'Particulier' });
    setEvent({ naam: '', datum: today(), locatie: '', gasten: 50, vegaGasten: 0, binnenBuiten: 'Buiten', startTijd: '16:00', eindTijd: '22:00' });
    setMenuSelectie({});
    setMenuExtra({ speciale_wensen: '', dieet_opmerkingen: '' });
    setGastenDieet([]);
    setBudget({ ppp: 45, dranken: 'Eigen regeling', serveerwijze: 'BBQ Live Cooking', tafels: false, stoelen: false, materieel: false });
    setNotities({ tekst: '', locatieNotes: '', concurrentie: 'Nee', concurrentieDetail: '', followUp: '' });
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 100px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(196,163,90,.1)', border: '1px solid rgba(196,163,90,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <HeartHandshake className="w-5 h-5 text-[#c4a35a]" />
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 300, color: 'white', letterSpacing: '-0.02em' }}>Klantgesprek</h1>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>Intake bij potentiële klant</p>
        </div>
      </div>

      <PageHint id="klantgesprek" title="Klantgesprek" description="Voer een gestructureerd intakegesprek met een potentiele klant. Gegevens worden automatisch opgeslagen." />

      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 28, overflowX: 'auto', paddingBottom: 4 }}>
        {STEPS.map(function (s, i) {
          return (
            <React.Fragment key={s.label}>
              <button onClick={function () { if (i < step && canProceed()) setStep(i); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8,
                  fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', border: 'none', cursor: i <= step ? 'pointer' : 'default',
                  background: i === step ? 'rgba(59,130,246,.1)' : 'transparent',
                  color: i === step ? '#3b82f6' : i < step ? '#10b981' : 'var(--muted-light)',
                }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, border: '1.5px solid',
                  borderColor: i === step ? '#3b82f6' : i < step ? '#10b981' : 'var(--border)',
                  background: i < step ? 'rgba(16,185,129,.1)' : i === step ? 'rgba(59,130,246,.1)' : 'transparent',
                  color: i === step ? '#3b82f6' : i < step ? '#10b981' : 'var(--muted-light)',
                }}>
                  {i < step ? <Check size={10} /> : i + 1}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <div style={{ width: 16, height: 1, background: i < step ? '#10b981' : 'var(--border)', flexShrink: 0 }} />}
            </React.Fragment>
          );
        })}
      </div>

      {/* ═══════════════ STAP 1: KLANT ═══════════════ */}
      {step === 0 && (
        <MetallicCard className="p-5 md:p-7" hover={false} accent="#c4a35a">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Users size={16} className="text-[#c4a35a]" />
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>Klantgegevens</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <KlantAutocomplete label="Klantnaam" value={klant.naam}
              onChange={function (v) { setKlant(function (p) { return Object.assign({}, p, { naam: v }); }); }}
              onSelect={function (k: any) {
                setKlant({ naam: k.naam || '', bedrijf: k.bedrijf || '', telefoon: k.telefoon || '', email: k.email || '', adres: [k.adres, k.postcode, k.plaats].filter(Boolean).join(', '), type: k.type || 'Particulier' });
                if (!event.naam) setEvent(function (p) { return Object.assign({}, p, { naam: k.naam || '' }); });
              }}
            />
            <div><label style={labelStyle}>Bedrijf</label><input value={klant.bedrijf} onChange={function (e) { setKlant(function (p) { return Object.assign({}, p, { bedrijf: e.target.value }); }); }} style={inputStyle} placeholder="Optioneel" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={labelStyle}>Telefoon</label><input value={klant.telefoon} onChange={function (e) { setKlant(function (p) { return Object.assign({}, p, { telefoon: e.target.value }); }); }} style={inputStyle} type="tel" /></div>
              <div><label style={labelStyle}>Email</label><input value={klant.email} onChange={function (e) { setKlant(function (p) { return Object.assign({}, p, { email: e.target.value }); }); }} style={inputStyle} type="email" /></div>
            </div>
            <div><label style={labelStyle}>Adres</label><input value={klant.adres} onChange={function (e) { setKlant(function (p) { return Object.assign({}, p, { adres: e.target.value }); }); }} style={inputStyle} /></div>
            <div><label style={labelStyle}>Type klant</label>
              <PillSelect options={['Particulier', 'Zakelijk', 'Festival']} value={klant.type} onChange={function (v) { setKlant(function (p) { return Object.assign({}, p, { type: v }); }); }} color="#c4a35a" />
            </div>
          </div>
        </MetallicCard>
      )}

      {/* ═══════════════ STAP 2: EVENT ═══════════════ */}
      {step === 1 && (
        <MetallicCard className="p-5 md:p-7" hover={false} accent="#3b82f6">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Calendar size={16} className="text-[#3b82f6]" />
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>Eventdetails</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><label style={labelStyle}>Event naam</label><input value={event.naam} onChange={function (e) { setEvent(function (p) { return Object.assign({}, p, { naam: e.target.value }); }); }} style={inputStyle} placeholder={klant.naam || 'bijv. Bruiloft De Vries'} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={labelStyle}>Datum</label><input type="date" value={event.datum} onChange={function (e) { setEvent(function (p) { return Object.assign({}, p, { datum: e.target.value }); }); }} style={inputStyle} /></div>
              <div><label style={labelStyle}>Locatie</label><input value={event.locatie} onChange={function (e) { setEvent(function (p) { return Object.assign({}, p, { locatie: e.target.value }); }); }} style={inputStyle} placeholder="Adres of naam" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={labelStyle}>Aantal gasten</label><input type="number" value={event.gasten} onChange={function (e) { setEvent(function (p) { return Object.assign({}, p, { gasten: parseInt(e.target.value) || 0 }); }); }} style={Object.assign({}, inputStyle, { fontSize: 20, fontWeight: 300, textAlign: 'center' as const })} /></div>
              <div><label style={labelStyle}>Waarvan vega</label><input type="number" value={event.vegaGasten} onChange={function (e) { setEvent(function (p) { return Object.assign({}, p, { vegaGasten: parseInt(e.target.value) || 0 }); }); }} style={Object.assign({}, inputStyle, { fontSize: 20, fontWeight: 300, textAlign: 'center' as const })} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={labelStyle}>Starttijd</label><input type="time" value={event.startTijd} onChange={function (e) { setEvent(function (p) { return Object.assign({}, p, { startTijd: e.target.value }); }); }} style={inputStyle} /></div>
              <div><label style={labelStyle}>Eindtijd</label><input type="time" value={event.eindTijd} onChange={function (e) { setEvent(function (p) { return Object.assign({}, p, { eindTijd: e.target.value }); }); }} style={inputStyle} /></div>
            </div>
            <div><label style={labelStyle}>Binnen of buiten?</label>
              <PillSelect options={['Buiten', 'Binnen', 'Combinatie']} value={event.binnenBuiten} onChange={function (v) { setEvent(function (p) { return Object.assign({}, p, { binnenBuiten: v }); }); }} color="#3b82f6" />
            </div>
          </div>
        </MetallicCard>
      )}

      {/* ═══════════════ STAP 3: MENU ═══════════════ */}
      {step === 2 && (
        <MetallicCard className="p-5 md:p-7" hover={false} accent="#10b981">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <UtensilsCrossed size={16} className="text-emerald-400" />
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>Menu wensen</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#10b981' }}>{totalMenuDishes} gekozen</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {sortedGangen.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>Geen gangen gevonden — maak eerst gangen aan in Gerechten Beheer.</p>
            ) : sortedGangen.map(function (gang: any) {
              const gangGerechten = gerechten.filter(function (g: any) { return g.gang_slug === gang.slug; });
              const selected = menuSelectie[gang.slug] || [];
              return (
                <div key={gang.slug}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{gang.naam}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{selected.length} gekozen</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {gangGerechten.map(function (g: any) {
                      const isSelected = selected.includes(g.naam);
                      return (
                        <button key={g.id} onClick={function () {
                          setMenuSelectie(function (prev) {
                            const cur = prev[gang.slug] || [];
                            return Object.assign({}, prev, { [gang.slug]: isSelected ? cur.filter(function (n: string) { return n !== g.naam; }) : cur.concat([g.naam]) });
                          });
                        }} style={{
                          padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                          background: isSelected ? 'rgba(16,185,129,.12)' : 'var(--bg)',
                          border: isSelected ? '1px solid #10b981' : '1px solid var(--border)',
                          color: isSelected ? '#10b981' : 'var(--text)',
                        }}>
                          {isSelected && <Check size={10} style={{ display: 'inline', marginRight: 4 }} />}{g.naam}
                        </button>
                      );
                    })}
                    {gangGerechten.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Geen gerechten</span>}
                  </div>
                </div>
              );
            })}
            {/* Per-persoon allergie/dieet tracking */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <label style={labelStyle}>Allergieen & dieetwensen per gast</label>
                <button onClick={function () {
                  setGastenDieet(function (prev) { return prev.concat([{ id: Date.now(), label: 'Gast ' + (prev.length + 1), allergenen: [], dieet: 'geen' }]); });
                }} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.25)', color: '#10b981', cursor: 'pointer' }}>
                  + Gast met allergie/dieet
                </button>
              </div>

              {gastenDieet.length === 0 && (
                <div style={{ padding: '16px', borderRadius: 10, background: 'rgba(255,255,255,.02)', border: '1px dashed var(--border)', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
                  Geen gasten met speciale wensen. Klik + om toe te voegen.
                </div>
              )}

              {gastenDieet.map(function (gast, idx) {
                return (
                  <div key={gast.id} style={{ padding: 14, marginBottom: 10, borderRadius: 10, background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <input value={gast.label} onChange={function (e) {
                        setGastenDieet(function (prev) { return prev.map(function (g) { return g.id === gast.id ? Object.assign({}, g, { label: e.target.value }) : g; }); });
                      }} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, padding: 0, width: 150 }} placeholder="Naam gast" />
                      <button onClick={function () { setGastenDieet(function (prev) { return prev.filter(function (g) { return g.id !== gast.id; }); }); }}
                        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>✕</button>
                    </div>

                    {/* Dieet type */}
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dieet</span>
                      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                        {[{ code: 'geen', label: 'Geen', icon: '' }].concat(DIEETWENSEN).map(function (d) {
                          const active = gast.dieet === d.code;
                          return (
                            <button key={d.code} onClick={function () {
                              setGastenDieet(function (prev) { return prev.map(function (g) { return g.id === gast.id ? Object.assign({}, g, { dieet: d.code }) : g; }); });
                            }} style={{
                              padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                              background: active ? 'rgba(16,185,129,.12)' : 'transparent',
                              border: active ? '1px solid #10b981' : '1px solid var(--border)',
                              color: active ? '#10b981' : 'var(--muted)',
                            }}>
                              {d.icon ? d.icon + ' ' : ''}{d.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Allergenen */}
                    <div>
                      <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Allergenen</span>
                      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                        {ALLERGENEN.map(function (a) {
                          const active = gast.allergenen.includes(a.code);
                          return (
                            <button key={a.code} onClick={function () {
                              setGastenDieet(function (prev) {
                                return prev.map(function (g) {
                                  if (g.id !== gast.id) return g;
                                  const newAll = active ? g.allergenen.filter(function (x) { return x !== a.code; }) : g.allergenen.concat([a.code]);
                                  return Object.assign({}, g, { allergenen: newAll });
                                });
                              });
                            }} style={{
                              padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                              background: active ? 'rgba(239,68,68,.1)' : 'transparent',
                              border: active ? '1px solid rgba(239,68,68,.4)' : '1px solid var(--border)',
                              color: active ? '#ef4444' : 'var(--muted-light)',
                            }}>
                              {a.icon} {a.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Dieet samenvatting */}
              {totalVegaMenu > 0 && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(16,185,129,.06)', border: '1px solid rgba(16,185,129,.15)', marginTop: 8, fontSize: 12 }}>
                  <span style={{ color: '#10b981', fontWeight: 700 }}>🌿 {totalVegaMenu} gasten vega menu</span>
                  <span style={{ color: 'var(--muted)', marginLeft: 8 }}>({event.vegaGasten} vega + {allergieGastenNeedVega} allergie-fallback + {vegaGastenFromDieet} dieet)</span>
                  <span style={{ color: 'var(--muted)', marginLeft: 8 }}>• 🍖 {totalNormaalMenu} normaal</span>
                </div>
              )}

              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div><label style={labelStyle}>Overige opmerkingen dieet/allergie</label><textarea rows={2} value={menuExtra.dieet_opmerkingen || ''} onChange={function (e) { setMenuExtra(function (p) { return Object.assign({}, p, { dieet_opmerkingen: e.target.value }); }); }} style={Object.assign({}, inputStyle, { resize: 'vertical' as const })} placeholder="Vrij tekstveld — wordt niet meegenomen in dieetberekening" /></div>
                <div><label style={labelStyle}>Speciale wensen</label><input value={menuExtra.speciale_wensen} onChange={function (e) { setMenuExtra(function (p) { return Object.assign({}, p, { speciale_wensen: e.target.value }); }); }} style={inputStyle} placeholder="bijv. alleen lokaal vlees, halal" /></div>
              </div>
            </div>
          </div>
        </MetallicCard>
      )}

      {/* ═══════════════ STAP 4: BUDGET ═══════════════ */}
      {step === 3 && (
        <MetallicCard className="p-5 md:p-7" hover={false} accent="#c4a35a">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Euro size={16} className="text-[#c4a35a]" />
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>Budget & verwachtingen</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Prijs per persoon</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input type="number" step="0.50" value={budget.ppp} onChange={function (e) { setBudget(function (p) { return Object.assign({}, p, { ppp: parseFloat(e.target.value) || 0 }); }); }} style={Object.assign({}, inputStyle, { fontSize: 20, fontWeight: 300, textAlign: 'center' as const, maxWidth: 120 })} />
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Geschat totaal</div>
                  <div style={{ fontSize: 22, fontWeight: 300, color: '#c4a35a' }}>{fmt(totaalBedrag)}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted-light)' }}>{event.gasten} gasten × {fmt(budget.ppp)}</div>
                </div>
              </div>
            </div>
            <div><label style={labelStyle}>Dranken</label>
              <PillSelect options={['Inclusief', 'Eigen regeling', 'Apart bespreken']} value={budget.dranken} onChange={function (v) { setBudget(function (p) { return Object.assign({}, p, { dranken: v }); }); }} color="#c4a35a" />
            </div>
            <div><label style={labelStyle}>Serveerwijze</label>
              <PillSelect options={['Buffet', 'Bediend', 'Walking Dinner', 'BBQ Live Cooking']} value={budget.serveerwijze} onChange={function (v) { setBudget(function (p) { return Object.assign({}, p, { serveerwijze: v }); }); }} color="#c4a35a" />
            </div>
            <div><label style={labelStyle}>Extra benodigdheden</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[{ key: 'tafels', label: 'Tafels' }, { key: 'stoelen', label: 'Stoelen' }, { key: 'materieel', label: 'Extra materieel' }].map(function (item) {
                  const checked = (budget as any)[item.key];
                  return (
                    <button key={item.key} onClick={function () { setBudget(function (p) { return Object.assign({}, p, { [item.key]: !checked }); }); }}
                      style={{
                        padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        background: checked ? 'rgba(196,163,90,.1)' : 'transparent',
                        border: checked ? '2px solid #c4a35a' : '1px solid var(--border)',
                        color: checked ? '#c4a35a' : 'var(--muted)',
                      }}>
                      {checked ? '✓ ' : ''}{item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </MetallicCard>
      )}

      {/* ═══════════════ STAP 5: NOTITIES ═══════════════ */}
      {step === 4 && (
        <MetallicCard className="p-5 md:p-7" hover={false} accent="#8b8bf0">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <StickyNote size={16} className="text-[#8b8bf0]" />
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>Notities & opvolging</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><label style={labelStyle}>Gespreknotities</label><textarea rows={5} value={notities.tekst} onChange={function (e) { setNotities(function (p) { return Object.assign({}, p, { tekst: e.target.value }); }); }} style={Object.assign({}, inputStyle, { resize: 'vertical' as const })} placeholder="Wat is er besproken? Eerste indruk, sfeer, bijzonderheden..." /></div>
            <div><label style={labelStyle}>Locatie-aantekeningen</label><textarea rows={2} value={notities.locatieNotes} onChange={function (e) { setNotities(function (p) { return Object.assign({}, p, { locatieNotes: e.target.value }); }); }} style={Object.assign({}, inputStyle, { resize: 'vertical' as const })} placeholder="Stroom aanwezig? Ondergrond? Overkapping?" /></div>
            <div>
              <label style={labelStyle}>Heeft de klant al andere offertes?</label>
              <PillSelect options={['Nee', 'Ja', 'Weet niet']} value={notities.concurrentie} onChange={function (v) { setNotities(function (p) { return Object.assign({}, p, { concurrentie: v }); }); }} color="#8b8bf0" />
              {notities.concurrentie === 'Ja' && (
                <input value={notities.concurrentieDetail} onChange={function (e) { setNotities(function (p) { return Object.assign({}, p, { concurrentieDetail: e.target.value }); }); }} style={Object.assign({}, inputStyle, { marginTop: 8 })} placeholder="Van wie? Welk bedrag?" />
              )}
            </div>
            <div><label style={labelStyle}>Follow-up datum</label><input type="date" value={notities.followUp} onChange={function (e) { setNotities(function (p) { return Object.assign({}, p, { followUp: e.target.value }); }); }} style={inputStyle} /></div>
          </div>
        </MetallicCard>
      )}

      {/* ═══════════════ STAP 6: OVERZICHT ═══════════════ */}
      {step === 5 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <MetallicCard className="p-5" hover={false} accent="#10b981">
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 12, display: 'block' }}>Samenvatting</span>

            {[
              { icon: <Users size={14} className="text-[#c4a35a]" />, label: klant.naam + (klant.bedrijf ? ' (' + klant.bedrijf + ')' : ''), sub: [klant.telefoon, klant.email, klant.type].filter(Boolean).join(' • ') },
              { icon: <Calendar size={14} className="text-[#3b82f6]" />, label: event.naam || klant.naam, sub: event.datum + ' • ' + event.gasten + ' gasten • ' + event.locatie },
              { icon: <Clock size={14} className="text-[var(--muted)]" />, label: event.startTijd + ' – ' + event.eindTijd, sub: event.binnenBuiten },
              { icon: <UtensilsCrossed size={14} className="text-emerald-400" />, label: totalMenuDishes + ' gerechten', sub: Object.entries(menuSelectie).map(function (e) { return e[1].length + '× ' + e[0]; }).join(', ') || 'Geen menu gekozen' },
              { icon: <Euro size={14} className="text-[#c4a35a]" />, label: fmt(totaalBedrag), sub: event.gasten + ' × ' + fmt(budget.ppp) + ' • ' + budget.dranken + ' • ' + budget.serveerwijze },
            ].map(function (row, i) {
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: '#0e0e10', marginBottom: 6 }}>
                  <div style={{ flexShrink: 0 }}>{row.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.sub}</div>
                  </div>
                </div>
              );
            })}

            {/* Dieet & allergie breakdown */}
            {(gastenDieet.length > 0 || totalVegaMenu > 0) && (
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(16,185,129,.05)', border: '1px solid rgba(16,185,129,.12)', marginTop: 8, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'white', fontWeight: 600 }}>🍖 Normaal menu: {totalNormaalMenu} personen</span>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>🌿 Vega menu: {totalVegaMenu} personen</span>
                </div>
                {gastenDieet.map(function (g) {
                  const allergenLabels = g.allergenen.map(function (code) { const a = ALLERGENEN.find(function (x) { return x.code === code; }); return a ? a.icon + ' ' + a.label : code; });
                  const dieetLabel = g.dieet !== 'geen' ? (DIEETWENSEN.find(function (d) { return d.code === g.dieet; })?.label || g.dieet) : '';
                  return (
                    <div key={g.id} style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      <span style={{ fontWeight: 600, color: '#ef4444' }}>{g.label}:</span>{' '}
                      {dieetLabel && <span style={{ color: '#10b981' }}>{dieetLabel}</span>}
                      {dieetLabel && allergenLabels.length > 0 && ' + '}
                      {allergenLabels.join(', ')}
                      <span style={{ color: 'var(--muted-light)' }}> → vega menu</span>
                    </div>
                  );
                })}
              </div>
            )}

            {menuExtra.speciale_wensen && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,.05)', border: '1px solid rgba(239,68,68,.1)', marginTop: 8, fontSize: 12, color: '#ef4444' }}>
                Wensen: {menuExtra.speciale_wensen}
              </div>
            )}

            {notities.tekst && (
              <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: '#0e0e10', fontSize: 12, color: 'var(--muted)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted-light)', marginBottom: 4, textTransform: 'uppercase' }}>Notities</div>
                {notities.tekst.slice(0, 200)}{notities.tekst.length > 200 ? '...' : ''}
              </div>
            )}

            {notities.followUp && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#8b8bf0' }}>
                <Clock size={10} style={{ display: 'inline', marginRight: 4 }} />
                Follow-up: {notities.followUp}
              </div>
            )}
          </MetallicCard>

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={saveAsConceptOfferte} disabled={saving}
              style={{
                width: '100%', padding: '16px 24px', borderRadius: 14, fontSize: 15, fontWeight: 700,
                background: 'linear-gradient(135deg, #c4a35a, #a8893e)', color: '#000',
                border: 'none', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
              }}>
              {saving ? 'Bezig...' : 'Opslaan als Concept Offerte + Event'}
            </button>
            <button onClick={saveNoteOnly} disabled={saving}
              style={{
                width: '100%', padding: '12px 24px', borderRadius: 14, fontSize: 13, fontWeight: 600,
                background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)',
                cursor: saving ? 'wait' : 'pointer',
              }}>
              Alleen Klant + Notitie Opslaan
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════ NAVIGATIE ═══════════════ */}
      {step < 5 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          <button onClick={function () { step > 0 ? setStep(step - 1) : clearDraft(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 500, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>
            <ChevronLeft size={14} />
            {step > 0 ? 'Vorige' : 'Wissen'}
          </button>
          <button onClick={function () {
            // Bij stap 2→3: sync vegaGasten naar gastenDieet
            if (step === 1 && event.vegaGasten > 0) {
              setGastenDieet(function (prev) {
                // Hoeveel vega gasten zitten er al in de lijst?
                const bestaandeVega = prev.filter(function (g) { return g.dieet === 'vega'; }).length;
                const tekort = event.vegaGasten - bestaandeVega;
                if (tekort <= 0) return prev;
                const nieuweGasten = [];
                for (var i = 0; i < tekort; i++) {
                  nieuweGasten.push({ id: Date.now() + i, label: 'Vega gast ' + (bestaandeVega + i + 1), allergenen: [], dieet: 'vega' });
                }
                return prev.concat(nieuweGasten);
              });
            }
            setStep(step + 1);
          }} disabled={!canProceed()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: canProceed() ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'var(--card-solid)',
              border: canProceed() ? 'none' : '1px solid var(--border)',
              color: canProceed() ? 'white' : 'var(--muted)', cursor: canProceed() ? 'pointer' : 'not-allowed',
            }}>
            Volgende <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
