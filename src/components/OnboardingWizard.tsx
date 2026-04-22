/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect } from 'react';
import { Flame, ChevronRight, Check, ChefHat, Calendar, ArrowRight } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from './Toast';
import { today } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

export default function OnboardingWizard() {
  const { loaded, upcomingEvents } = useApp();
  const { data: gerechten } = useSupabase('gerechten', []);
  const showToast = useToast();

  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);

  const [bedrijf, setBedrijf] = useState({ naam: '', plaats: '', telefoon: '', email: '' });
  const [gerecht, setGerecht] = useState({ naam: '', categorie: 'hoofdgerecht', kostprijs_pp: 15 });
  const [event, setEvent] = useState({ name: '', date: today(), guests: 50, location: '' });

  useEffect(() => {
    if (!loaded || dismissed) return;
    // Show onboarding only when database is empty
    const isEmpty = upcomingEvents.length === 0 && gerechten.length === 0;
    const alreadyDismissed = typeof window !== 'undefined' && localStorage.getItem('bbq_onboarding_done');
    setShow(isEmpty && !alreadyDismissed);
  }, [loaded, upcomingEvents, gerechten, dismissed]);

  function dismiss() {
    setDismissed(true);
    setShow(false);
    if (typeof window !== 'undefined') localStorage.setItem('bbq_onboarding_done', '1');
  }

  async function saveBedrijf() {
    if (!bedrijf.naam) { showToast('Vul een bedrijfsnaam in', 'error'); return; }
    if (supabase) {
      const { data: existing } = await supabase.from('settings').select('id').eq('key', 'bedrijf').limit(1);
      if (existing && existing.length > 0) {
        await supabase.from('settings').update({ value: bedrijf }).eq('key', 'bedrijf');
      } else {
        await supabase.from('settings').insert({ key: 'bedrijf', value: bedrijf });
      }
    }
    setStep(1);
  }

  async function saveGerecht() {
    if (!gerecht.naam) { showToast('Vul een gerechtnaam in', 'error'); return; }
    setSaving(true);
    try {
      if (supabase) {
        await supabase.from('gerechten').insert({
          naam: gerecht.naam,
          categorie: gerecht.categorie,
          kostprijs_pp: gerecht.kostprijs_pp,
          actief: true,
        });
      }
      showToast('Eerste gerecht toegevoegd!', 'success');
      setStep(2);
    } catch (err: any) {
      showToast('Fout: ' + (err.message || 'onbekend'), 'error');
    } finally { setSaving(false); }
  }

  async function saveEvent() {
    if (!event.name || !event.date) { showToast('Vul naam en datum in', 'error'); return; }
    setSaving(true);
    try {
      if (supabase) {
        await supabase.from('events').insert({
          name: event.name,
          date: event.date,
          guests: event.guests,
          location: event.location,
          status: 'pending',
          client_naam: event.name,
          ppp: 45,
          type: 'Particulier',
          menu: [],
        });
      }
      showToast('Eerste event gepland!', 'success');
      setStep(3);
    } catch (err: any) {
      showToast('Fout: ' + (err.message || 'onbekend'), 'error');
    } finally { setSaving(false); }
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 rounded-2xl overflow-hidden bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-darker)] border border-[var(--card-solid)] shadow-2xl">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-accent-gold)] to-transparent" />

        {/* Header */}
        <div className="px-8 pt-8 pb-4 text-center">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[var(--sidebar-bg-hover)] to-[var(--color-bg-deep)] flex items-center justify-center border border-[var(--color-border)] mx-auto mb-4">
            <Flame className="w-7 h-7 text-[var(--color-accent-gold)]" />
          </div>
          <h2 className="text-xl font-light text-[var(--text)] tracking-tight mb-1">
            {step === 0 && 'Welkom bij BBQ Architect'}
            {step === 1 && 'Voeg je eerste gerecht toe'}
            {step === 2 && 'Plan je eerste event'}
            {step === 3 && 'Klaar om te starten!'}
          </h2>
          <p className="text-[12px] text-[var(--muted)]">
            {step === 0 && 'Laten we je bedrijf instellen in 3 stappen.'}
            {step === 1 && 'Een gerecht is de basis van alles.'}
            {step === 2 && 'Plan een event om je eerste workflow te starten.'}
            {step === 3 && 'Je bent helemaal klaar. Laat het vuur maar branden.'}
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 py-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="w-2 h-2 rounded-full transition-all" style={{
              background: i === step ? 'var(--color-accent-gold)' : i < step ? 'var(--green)' : 'var(--border)',
              width: i === step ? 24 : 8,
            }} />
          ))}
        </div>

        {/* Step content */}
        <div className="px-8 py-4">

          {step === 0 && (
            <div className="space-y-3">
              <div><label className="text-[11px] text-[var(--muted)] mb-1 block">Bedrijfsnaam</label>
                <input value={bedrijf.naam} onChange={e => setBedrijf(p => ({ ...p, naam: e.target.value }))} placeholder="Hop & Bites" className="w-full p-2.5 rounded-lg text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--text)]" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[11px] text-[var(--muted)] mb-1 block">Plaats</label>
                  <input value={bedrijf.plaats} onChange={e => setBedrijf(p => ({ ...p, plaats: e.target.value }))} className="w-full p-2.5 rounded-lg text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--text)]" /></div>
                <div><label className="text-[11px] text-[var(--muted)] mb-1 block">Telefoon</label>
                  <input value={bedrijf.telefoon} onChange={e => setBedrijf(p => ({ ...p, telefoon: e.target.value }))} className="w-full p-2.5 rounded-lg text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--text)]" /></div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <div><label className="text-[11px] text-[var(--muted)] mb-1 block">Gerechtnaam</label>
                <input value={gerecht.naam} onChange={e => setGerecht(p => ({ ...p, naam: e.target.value }))} placeholder="bijv. Pulled Pork Brioche" className="w-full p-2.5 rounded-lg text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--text)]" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[11px] text-[var(--muted)] mb-1 block">Categorie</label>
                  <select value={gerecht.categorie} onChange={e => setGerecht(p => ({ ...p, categorie: e.target.value }))} className="w-full p-2.5 rounded-lg text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--text)]">
                    <option value="voorgerecht">Voorgerecht</option>
                    <option value="hoofdgerecht">Hoofdgerecht</option>
                    <option value="bijgerecht">Bijgerecht</option>
                    <option value="dessert">Dessert</option>
                  </select></div>
                <div><label className="text-[11px] text-[var(--muted)] mb-1 block">Kostprijs p.p.</label>
                  <input type="number" step="0.50" value={gerecht.kostprijs_pp} onChange={e => setGerecht(p => ({ ...p, kostprijs_pp: parseFloat(e.target.value) || 0 }))} className="w-full p-2.5 rounded-lg text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--text)]" /></div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div><label className="text-[11px] text-[var(--muted)] mb-1 block">Event / Klantnaam</label>
                <input value={event.name} onChange={e => setEvent(p => ({ ...p, name: e.target.value }))} placeholder="bijv. Bruiloft De Vries" className="w-full p-2.5 rounded-lg text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--text)]" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-[11px] text-[var(--muted)] mb-1 block">Datum</label>
                  <input type="date" value={event.date} onChange={e => setEvent(p => ({ ...p, date: e.target.value }))} className="w-full p-2.5 rounded-lg text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--text)]" /></div>
                <div><label className="text-[11px] text-[var(--muted)] mb-1 block">Gasten</label>
                  <input type="number" value={event.guests} onChange={e => setEvent(p => ({ ...p, guests: parseInt(e.target.value) || 0 }))} className="w-full p-2.5 rounded-lg text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--text)]" /></div>
                <div><label className="text-[11px] text-[var(--muted)] mb-1 block">Locatie</label>
                  <input value={event.location} onChange={e => setEvent(p => ({ ...p, location: e.target.value }))} className="w-full p-2.5 rounded-lg text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--text)]" /></div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center py-4">
              <div className="flex justify-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <Check className="w-5 h-5 text-emerald-400" />
                </div>
              </div>
              <p className="text-[13px] text-[var(--muted)] leading-relaxed">
                Je bedrijf is ingesteld, je eerste gerecht en event staan klaar. Verken het dashboard en ontdek alle mogelijkheden.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-8 pb-8 pt-2 flex items-center justify-between">
          <button onClick={dismiss} className="text-[11px] text-[var(--muted-light)] hover:text-[var(--muted)] transition-colors">
            {step < 3 ? 'Overslaan' : ''}
          </button>

          {step === 0 && (
            <button onClick={saveBedrijf} className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[12px] font-semibold text-black" style={{ background: 'linear-gradient(135deg, var(--color-accent-gold), #a8893e)' }}>
              Volgende <ChevronRight size={14} />
            </button>
          )}
          {step === 1 && (
            <button onClick={saveGerecht} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[12px] font-semibold text-black" style={{ background: 'linear-gradient(135deg, var(--color-accent-gold), #a8893e)' }}>
              {saving ? 'Opslaan...' : 'Gerecht Toevoegen'} <ChefHat size={14} />
            </button>
          )}
          {step === 2 && (
            <button onClick={saveEvent} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[12px] font-semibold text-black" style={{ background: 'linear-gradient(135deg, var(--color-accent-gold), #a8893e)' }}>
              {saving ? 'Opslaan...' : 'Event Plannen'} <Calendar size={14} />
            </button>
          )}
          {step === 3 && (
            <button onClick={dismiss} className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[12px] font-semibold text-black" style={{ background: 'linear-gradient(135deg, var(--color-accent-gold), #a8893e)' }}>
              Aan de slag <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
