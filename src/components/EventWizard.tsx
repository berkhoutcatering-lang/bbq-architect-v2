/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Users, Calendar, MapPin, ChevronRight, ChevronLeft,
  Check, Euro, FileText, Sparkles
} from 'lucide-react';
import SlideOverPanel from './SlideOverPanel';
import KlantAutocomplete from './KlantAutocomplete';
import MetallicCard from './MetallicCard';
import FieldTooltip from './FieldTooltip';
import { useSupabase, useSettings } from '@/lib/useSupabase';
import { useToast } from './Toast';
import { fmt, today, addDays, genNummer, nextNummer, calcLineTotals } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { autoCreatePrepTasks } from '@/lib/syncEngine';
import { useAutoSave } from '@/hooks/useAutoSave';

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
  const { orgId } = useOrg();
  const { settings } = useSettings();
  const { data: gerechten } = useSupabase('gerechten', []);
  const { data: gangen } = useSupabase('gangen', []);
  const { data: offertes } = useSupabase('offertes', []);
  const { data: inventoryData } = useSupabase('inventory', []);

  // Foodcost calculation per dish (for inline marge indicator)
  function calcDishFoodcostPP(dishName: string): number {
    const gerecht: any = gerechten.find(function (g: any) { return g.naam === dishName; });
    if (!gerecht || !gerecht.ingredient_costs) return 0;
    return (gerecht.ingredient_costs || []).reduce(function (sum: number, item: any) {
      const inv = (inventoryData || []).find(function (i: any) { return i.naam && item.naam && i.naam.toLowerCase() === item.naam.toLowerCase(); });
      const price = inv ? (inv.purchase_price || 0) : 0;
      const yld = item.yield || (inv ? inv.yield_factor : 1.0) || 1.0;
      let unitFactor = 1;
      if (item.unit === 'g' && inv && inv.unit === 'kg') unitFactor = 0.001;
      if (item.unit === 'ml' && inv && inv.unit === 'L') unitFactor = 0.001;
      return sum + ((item.qty_pp || 0) * unitFactor / yld) * price;
    }, 0);
  }

  // Form state
  const [klant, setKlant] = useState({
    naam: '', adres: '', tel: '', email: '', bedrijf: ''
  });
  const [menuSelectie, setMenuSelectie] = useState<Record<string, string[]>>({});
  const [details, setDetails] = useState({
    naam: '', datum: today(), locatie: '', gasten: 50,
    ppp: 45, type: 'Particulier', notitie: ''
  });

  // Auto-save draft
  const wizardForm = isOpen ? { klant, menuSelectie, details, step } : null;
  const { hasDraft, restoreDraft, discardDraft, lastSaved } = useAutoSave({
    key: 'bbq_draft_event_wizard',
    data: wizardForm,
    enabled: isOpen,
  });

  // Restore draft when wizard opens and a draft exists
  useEffect(function () {
    if (isOpen && hasDraft) {
      const draft = restoreDraft();
      if (draft) {
        if (draft.klant) setKlant(draft.klant as typeof klant);
        if (draft.menuSelectie) setMenuSelectie(draft.menuSelectie as typeof menuSelectie);
        if (draft.details) setDetails(draft.details as typeof details);
        if (typeof draft.step === 'number') setStep(draft.step as number);
      }
    }
  }, [isOpen]);

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

  // Total menu foodcost
  const menuFoodcostPP = useMemo(function () {
    return menuItems.reduce(function (sum, item) {
      return sum + calcDishFoodcostPP(item.naam);
    }, 0);
  }, [menuItems, gerechten, inventoryData]);

  const menuMargePct = details.ppp > 0 ? ((details.ppp - menuFoodcostPP) / details.ppp) * 100 : 0;
  const margeColor = menuMargePct > 70 ? '#10b981' : menuMargePct >= 55 ? '#f59e0b' : 'var(--red)';

  function canProceed(): boolean {
    if (step === 0) return klant.naam.length > 0;
    if (step === 1) return totalMenuDishes > 0;
    if (step === 2) return details.datum.length > 0 && details.gasten > 0;
    return true;
  }

  async function handleComplete() {
    // RLS rejects inserts without organization_id
    if (!orgId) {
      showToast('Geen organisatie gevonden — ververs de pagina en probeer opnieuw.', 'error');
      return;
    }
    setSaving(true);
    try {
      // 1. Create offerte
      const nummer = nextNummer(settings?.offerte_prefix || 'OFF-2026-', (offertes || []).map((o: any) => o.nummer));
      const offerteData = {
        organization_id: orgId,
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
        organization_id: orgId,
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

      const { data: event, error: evError } = await supabase!.from('events').insert(eventData).select().single();
      if (evError) throw evError;

      // 3. Link offerte back to event (bidirectioneel)
      if (offerte?.id && event?.id) {
        await supabase!.from('offertes').update({ event_id: event.id }).eq('id', offerte.id);
      }

      // 4. Auto-create prep tasks voor het event
      if (event?.id) {
        await autoCreatePrepTasks(event.id, details.datum, klant.naam);
      }

      // 5. Upsert klant in klanten tabel
      if (klant.naam) {
        const { data: existingKlant } = await supabase!.from('klanten').select('id').eq('naam', klant.naam).limit(1);
        if (!existingKlant || existingKlant.length === 0) {
          await supabase!.from('klanten').insert({
            organization_id: orgId,
            naam: klant.naam,
            adres: klant.adres || '',
            telefoon: klant.tel || '',
            email: klant.email || '',
            bedrijf: klant.bedrijf || '',
            type: details.type || 'Particulier',
          });
        }
      }

      showToast('Event + Offerte + Prep-taken aangemaakt!', 'success');
      discardDraft();
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
                color: i === step ? 'var(--blue)' : i < step ? 'var(--green)' : 'var(--muted-light)',
                cursor: i < step ? 'pointer' : 'default'
              }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all"
                style={{
                  borderColor: i === step ? 'var(--blue)' : i < step ? 'var(--green)' : 'var(--border)',
                  background: i < step ? 'color-mix(in srgb, var(--green) 10%, transparent)' : i === step ? 'color-mix(in srgb, var(--blue) 10%, transparent)' : 'transparent',
                  color: i === step ? 'var(--blue)' : i < step ? 'var(--green)' : 'var(--muted-light)',
                }}
              >
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              <span className="hidden md:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className="flex-1 h-px" style={{ background: i < step ? 'var(--green)' : 'var(--border)' }} />
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
                <Sparkles className="w-4 h-4 text-[var(--color-accent-gold)]" />
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
                <span className="text-[11px] font-medium text-[var(--blue)]">{totalMenuDishes} gerechten</span>
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
                          <span className="text-[12px] font-semibold text-[var(--text)]">{gang.naam}</span>
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
                                  background: isSelected ? 'color-mix(in srgb, var(--blue) 12%, transparent)' : 'var(--bg)',
                                  border: isSelected ? '1px solid var(--blue)' : '1px solid var(--border)',
                                  color: isSelected ? 'var(--blue)' : 'var(--text)',
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

            {/* Inline Marge Indicator */}
            {totalMenuDishes > 0 && (
              <MetallicCard className="p-4" hover={false} accent={margeColor}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Menu Marge</span>
                  <span className="text-[11px] font-bold" style={{ color: margeColor }}>
                    {menuMargePct > 0 ? menuMargePct.toFixed(1) + '%' : 'Geen data'}
                  </span>
                </div>
                {/* Progress bar */}
                <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', marginBottom: 8 }}>
                  <div style={{
                    width: Math.min(100, Math.max(0, menuMargePct)) + '%',
                    height: '100%', borderRadius: 3,
                    background: `linear-gradient(90deg, ${margeColor}cc, ${margeColor})`,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--muted)]">
                    Foodcost: {fmt(menuFoodcostPP)}/pp
                  </span>
                  <span className="text-[10px] text-[var(--muted)]">
                    Prijs: {fmt(details.ppp)}/pp
                  </span>
                </div>
                {menuFoodcostPP > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-[var(--border)]">
                    {menuItems.map(function (item, idx) {
                      const cost = calcDishFoodcostPP(item.naam);
                      return (
                        <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full" style={{
                          background: cost > 0 ? 'color-mix(in srgb, var(--color-accent-gold) 8%, transparent)' : 'rgba(255,255,255,0.03)',
                          border: cost > 0 ? '1px solid color-mix(in srgb, var(--color-accent-gold) 15%, transparent)' : '1px solid var(--border)',
                          color: cost > 0 ? 'var(--color-accent-gold)' : 'var(--muted)',
                        }}>
                          {item.naam} {cost > 0 ? fmt(cost) : '—'}
                        </span>
                      );
                    })}
                  </div>
                )}
                {menuMargePct > 0 && menuMargePct < 55 && (
                  <div className="mt-2 p-2 rounded-lg text-[10px]" style={{ background: 'color-mix(in srgb, var(--red) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 12%, transparent)', color: 'var(--red)' }}>
                    ⚠️ Lage marge — overweeg goedkopere gerechten of hogere prijs p.p.
                  </div>
                )}
              </MetallicCard>
            )}
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
                  <div className="field"><label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Prijs p.p.<FieldTooltip text="Prijs per persoon exclusief BTW" /></label><input type="number" step="0.50" value={details.ppp} onChange={e => setDetails(prev => ({ ...prev, ppp: parseFloat(e.target.value) || 0 }))} style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} /></div>
                  <div className="field"><label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Type<FieldTooltip text="Particulier: 21% BTW. Zakelijk: factuur op bedrijfsnaam." /></label>
                    <select value={details.type} onChange={e => setDetails(prev => ({ ...prev, type: e.target.value }))} aria-label="Event type" style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}>
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
            <MetallicCard className="p-4" hover={false} accent="var(--color-accent-gold)">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--muted)]">Geschatte omzet</span>
                <span className="text-lg font-light text-[var(--color-accent-gold)]">{fmt(estimatedOmzet)}</span>
              </div>
              <div className="text-[10px] text-[var(--muted-light)] mt-1">{details.gasten} gasten x {fmt(details.ppp)} p.p.</div>
            </MetallicCard>
          </div>
        )}

        {/* Step 3: Preview & Confirm */}
        {step === 3 && (
          <div className="space-y-4">
            <MetallicCard className="p-5" hover={false} accent="var(--green)">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-4 block">Samenvatting</span>

              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg)]">
                  <Users className="w-4 h-4 text-[var(--blue)] shrink-0" />
                  <div className="flex-1">
                    <div className="text-[13px] font-medium text-[var(--text)]">{klant.naam}</div>
                    <div className="text-[11px] text-[var(--muted)]">{klant.email || klant.tel || klant.adres || '—'}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg)]">
                  <Calendar className="w-4 h-4 text-[var(--color-accent-gold)] shrink-0" />
                  <div className="flex-1">
                    <div className="text-[13px] font-medium text-[var(--text)]">{details.naam || klant.naam}</div>
                    <div className="text-[11px] text-[var(--muted)]">{details.datum} • {details.gasten} gasten • {details.locatie || 'Locatie TBD'}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg)]">
                  <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="flex-1">
                    <div className="text-[13px] font-medium text-[var(--text)]">{totalMenuDishes} gerechten</div>
                    <div className="text-[11px] text-[var(--muted)]">
                      {menuItems.slice(0, 3).map(m => m.naam).join(', ')}
                      {menuItems.length > 3 && ` +${menuItems.length - 3} meer`}
                    </div>
                  </div>
                </div>
              </div>
            </MetallicCard>

            <MetallicCard className="p-5" hover={false} accent="var(--color-accent-gold)">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-[var(--muted)]">Offerte bedrag</span>
                <span className="text-xl font-light text-[var(--color-accent-gold)]">{fmt(estimatedOmzet)}</span>
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
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--card-solid)] transition-colors"
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
              background: canProceed() ? 'linear-gradient(135deg, var(--blue), #2563eb)' : 'var(--card-solid)',
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
              background: 'linear-gradient(135deg, var(--color-accent-gold), #a8893e)',
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
