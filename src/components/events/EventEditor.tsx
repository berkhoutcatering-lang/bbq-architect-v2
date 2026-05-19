/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useSupabase, useSettings } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { upsertEvent, deleteEvent as deleteEventAction } from '@/app/events/actions';
import { fmt, today, addDays, nextNummer } from '@/lib/utils';
import { mailEventBevestiging } from '@/lib/emailHelper';
import { useFormValidation } from '@/hooks/useFormValidation';
import FieldError from '@/components/FieldError';
import KlantAutocomplete from '@/components/KlantAutocomplete';
import {
  UtensilsCrossed, Check, Users, Clock, Plus, BarChart3, ShoppingCart, Save,
  Mail, FileText, Copy, Trash2,
} from 'lucide-react';
import type { Event as DbEvent, Recept, Offerte } from '@/types';

interface Props {
  eventId: number;
  onSaved?: () => void;
  onDeleted?: () => void;
}

export default function EventEditor({ eventId, onSaved, onDeleted }: Props) {
  const router = useRouter();
  const showToast = useToast();
  const showConfirm = useConfirm();
  const { settings } = useSettings();
  const { data: recepten } = useSupabase<Recept>('recepten', []);
  const offertes = useSupabase<Offerte>('offertes', []);
  const { errors, validateAll, clearError, fieldProps } = useFormValidation({
    name: [{ required: 'Vul een naam in' }],
    date: [{ required: 'Vul een datum in' }],
    guests: [{ required: 'Vul het aantal gasten in' }, { min: [1, 'Minimaal 1 gast'] }],
  });

  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [showInkoop, setShowInkoop] = useState(false);
  /* Onthoud de geladen server-status zodat saveEvent geen extra round-trip nodig heeft */
  const lastSavedStatusRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from('events').select('*').eq('id', eventId).single();
      if (!alive || !data) return;
      /* Coerce array-ish columns — Supabase may return them as JSON strings. */
      const coerce = (v: any) => {
        if (Array.isArray(v)) return v;
        if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
        return [];
      };
      const copy = JSON.parse(JSON.stringify(data));
      copy.menu = coerce(copy.menu);
      copy.team = coerce(copy.team);
      copy.draaiboek = coerce(copy.draaiboek);
      lastSavedStatusRef.current = data.status || 'pending';
      setForm(copy);
    })();
    return () => { alive = false; };
  }, [eventId]);

  function setField(key: string, val: any) { setForm(f => (f ? { ...f, [key]: val } : f)); }

  function validateEvent(): boolean {
    if (!form) return false;
    return validateAll({ name: form.name, date: form.date, guests: form.guests });
  }

  async function saveEvent() {
    if (!form || !validateEvent()) return;
    setSaving(true);
    /* Skip extra fetch — gebruik onthouden status van laatste load. Spaart één round-trip. */
    const lastStatus = lastSavedStatusRef.current || 'pending';
    const justCompleted = lastStatus !== 'completed' && form.status === 'completed';
    const { id: _id, created_at: _c, ...rest } = form;

    /* P0.7 — Server Action met Zod-validatie + re-auth. Vervangt directe
       client-side Supabase update (OWASP A01 mitigatie). Schema staat
       ruimhartig open zodat legacy-velden niet weggeworpen worden. */
    const result = await upsertEvent({ id: eventId, ...rest });
    setSaving(false);
    if ('error' in result) {
      const detail = result.fields ? Object.values(result.fields).flat().filter(Boolean).join(' · ') : '';
      showToast('Fout bij opslaan: ' + result.error + (detail ? ' (' + detail + ')' : ''), 'error');
      return;
    }
    lastSavedStatusRef.current = form.status || 'pending';
    showToast('Event bijgewerkt', 'success');
    if (justCompleted) drainInventoryForEvent(form);
    if (form.status === 'confirmed' && form.client_email) {
      /* Hint, not auto-send */
      showToast('Tip: stuur bevestigings-mail via de knop hieronder', 'info');
    }
    onSaved?.();
  }

  async function drainInventoryForEvent(event: Record<string, any>) {
    const menuIds: any[] = event.menu || [];
    if (menuIds.length === 0) { showToast('Geen recepten gekoppeld — voorraad niet afgetrokken', 'info'); return; }
    const { data: inventory } = await supabase.from('inventory').select('*');
    if (!inventory || inventory.length === 0) return;
    const guests = event.guests || 1;
    const deducted: string[] = [];
    const lowStock: string[] = [];

    for (const receptId of menuIds) {
      const recept = recepten.find(r => String(r.id) === String(receptId));
      if (!recept) continue;
      let ingredienten: any[] = (recept.ingredienten as any[]) || [];
      if (typeof ingredienten === 'string') {
        try { ingredienten = JSON.parse(ingredienten); } catch { ingredienten = []; }
      }
      const porties = recept.porties || 1;
      const multiplier = guests / porties;
      for (const ing of ingredienten) {
        const match = inventory.find((inv: any) => ing.naam && inv.naam && inv.naam.toLowerCase().includes(ing.naam.toLowerCase()));
        if (!match) continue;
        const qty = (parseFloat(ing.hoeveelheid) || 0) * multiplier;
        let unitFactor = 1;
        if (ing.eenheid === 'gram' && match.unit === 'kg') unitFactor = 0.001;
        if (ing.eenheid === 'ml' && match.unit === 'L') unitFactor = 0.001;
        const deductAmount = qty * unitFactor;
        const newStock = Math.max(0, (match.current_stock || 0) - deductAmount);
        await supabase.from('inventory').update({ current_stock: newStock }).eq('id', match.id);
        match.current_stock = newStock;
        deducted.push(match.naam + ' -' + deductAmount.toFixed(1) + match.unit);
        if (newStock < (match.min_stock || 0)) lowStock.push(match.naam);
      }
    }
    if (deducted.length) showToast('📉 Voorraad afgetrokken: ' + deducted.slice(0, 3).join(', ') + (deducted.length > 3 ? ` +${deducted.length - 3}` : ''), 'success');
    if (lowStock.length) setTimeout(() => showToast('⚠️ VOORRAAD TE LAAG: ' + lowStock.join(', '), 'error'), 1500);
  }

  function toggleMenu(receptId: number) {
    if (!form) return;
    const current = form.menu || [];
    const idx = current.findIndex((id: any) => String(id) === String(receptId));
    if (idx >= 0) setField('menu', current.filter((id: any) => String(id) !== String(receptId)));
    else setField('menu', current.concat([receptId]));
  }

  async function duplicateEvent() {
    if (!form) return;
    const copy = JSON.parse(JSON.stringify(form));
    delete copy.id; delete copy.created_at; delete copy.offerte_id;
    copy.name = (copy.name || '') + ' (kopie)';
    copy.date = today();
    copy.status = 'pending';
    const { data, error } = await supabase.from('events').insert(copy).select('id').single();
    if (error || !data) { showToast('Fout bij dupliceren: ' + (error?.message || ''), 'error'); return; }
    showToast('Event gedupliceerd', 'success');
    router.push(`/events/${data.id}/hub`);
  }

  function deleteEvent() {
    showConfirm('Weet je zeker dat je dit event wilt verwijderen?', async () => {
      /* P0.7 — Server Action delete; tenant-isolatie via RLS in Supabase-policy. */
      const result = await deleteEventAction(String(eventId));
      if ('error' in result) {
        showToast('Fout bij verwijderen: ' + result.error, 'error');
        return;
      }
      showToast('Event verwijderd', 'success');
      onDeleted?.();
    });
  }

  async function createOfferte() {
    if (!form) return;
    const geldigDagen = (settings && settings.offerte_geldig) || 30;
    const nummer = nextNummer((settings && settings.offerte_prefix) || 'OFF-2026-', offertes.data.map((o: any) => o.nummer));
    const offData = {
      nummer,
      status: 'concept' as const,
      client_naam: form.client_naam || form.name,
      client_adres: form.client_adres || '',
      datum: today(),
      geldig_tot: addDays(today(), geldigDagen),
      notitie: form.notitie || '',
      items: [{ desc: 'BBQ Catering - ' + form.name, qty: form.guests || 50, prijs: form.ppp || 45, btw: (settings && settings.default_btw) || 21 }],
    };
    await offertes.insert(offData);
    showToast('Offerte aangemaakt vanuit event', 'success');
  }

  async function sendBevestiging() {
    if (!form) return;
    const res = await mailEventBevestiging(form, settings?.bedrijfsnaam || 'Hop & Bites');
    showToast(res.success ? 'Bevestiging verstuurd!' : 'Fout: ' + (res.error || ''), res.success ? 'success' : 'error');
  }

  if (!form) return <div style={{ padding: 16, color: 'var(--muted)', fontSize: 13 }}>Laden…</div>;

  const omzet = (form.guests || 0) * (form.ppp || 0);

  return (
    <div className="panel-body" style={{ padding: 0 }}>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', marginBottom: 12 }}>Eventgegevens</h4>
      <div className="form-grid">
        <div className="field full"><label>Event Naam</label><input name="name" value={form.name || ''} onChange={e => { setField('name', e.target.value); clearError('name'); }} style={errors.name ? { borderColor: 'var(--red)' } : {}} {...fieldProps('name', form.name)} /><FieldError message={errors.name} fieldName="name" /></div>
        <div className="field"><label>Datum</label><input name="date" type="date" value={form.date || ''} onChange={e => { setField('date', e.target.value); clearError('date'); }} style={errors.date ? { borderColor: 'var(--red)' } : {}} {...fieldProps('date', form.date)} /><FieldError message={errors.date} fieldName="date" /></div>
        <div className="field"><label>Starttijd</label><input type="time" value={(form.start_time || '').slice(0, 5)} onChange={e => setField('start_time', e.target.value || null)} placeholder="17:00" /></div>
        <div className="field"><label>Eindtijd</label><input type="time" value={(form.end_time || '').slice(0, 5)} onChange={e => setField('end_time', e.target.value || null)} placeholder="23:00" /></div>
        <div className="field full"><label>Locatie</label><input value={form.location || ''} onChange={e => setField('location', e.target.value)} /></div>
        <div className="field"><label>Aantal Gasten</label><input name="guests" type="number" value={form.guests || 0} onChange={e => { setField('guests', parseInt(e.target.value) || 0); clearError('guests'); }} style={errors.guests ? { borderColor: 'var(--red)' } : {}} {...fieldProps('guests', form.guests)} /><FieldError message={errors.guests} fieldName="guests" /></div>
        <div className="field"><label>Vegetarisch</label><input type="number" min={0} value={form.veg_guests ?? 0} onChange={e => setField('veg_guests', parseInt(e.target.value) || 0)} /></div>
        <div className="field"><label>Vegan</label><input type="number" min={0} value={form.vegan_guests ?? 0} onChange={e => setField('vegan_guests', parseInt(e.target.value) || 0)} /></div>
        <div className="field"><label>Glutenvrij</label><input type="number" min={0} value={form.gluten_free_guests ?? 0} onChange={e => setField('gluten_free_guests', parseInt(e.target.value) || 0)} /></div>
        <div className="field"><label>Prijs per Persoon</label><input type="number" step="0.50" value={form.ppp || 0} onChange={e => setField('ppp', parseFloat(e.target.value) || 0)} /></div>
        <div className="field"><label>Type</label>
          <select value={form.type || 'Particulier'} onChange={e => setField('type', e.target.value)}>
            {['Particulier', 'Zakelijk', 'Festival'].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="field"><label>Status</label>
          <select value={form.status || 'pending'} onChange={e => setField('status', e.target.value)}>
            <option value="optie">Optie</option>
            <option value="pending">Nieuw</option>
            <option value="confirmed">Bevestigd</option>
            <option value="completed">Afgerond</option>
          </select>
        </div>
      </div>

      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', marginTop: 28, marginBottom: 12 }}>Klantgegevens</h4>
      <div className="form-grid">
        <KlantAutocomplete
          label="Naam"
          value={form.client_naam || ''}
          onChange={v => setField('client_naam', v)}
          onSelect={k => { setField('client_naam', k.naam); setField('client_adres', [k.adres, k.postcode, k.plaats].filter(Boolean).join(', ')); setField('client_tel', k.telefoon || form.client_tel); setField('client_email', k.email || form.client_email); }}
        />
        <div className="field"><label>Adres</label><input value={form.client_adres || ''} onChange={e => setField('client_adres', e.target.value)} /></div>
        <div className="field"><label>Telefoon</label><input value={form.client_tel || ''} onChange={e => setField('client_tel', e.target.value)} /></div>
        <div className="field"><label>Email</label><input type="email" value={form.client_email || ''} onChange={e => setField('client_email', e.target.value)} /></div>
      </div>

      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', marginTop: 28, marginBottom: 12 }}>
        <UtensilsCrossed size={14} style={{ marginRight: 6 }} />Menu (Recepten Koppelen)
      </h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {recepten.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Geen recepten gevonden — maak eerst recepten aan</span>}
        {recepten.map(r => {
          const isSelected = (form.menu || []).some((id: any) => String(id) === String(r.id));
          return (
            <button key={r.id} className={'btn btn-sm ' + (isSelected ? 'btn-brand' : 'btn-ghost')} onClick={() => toggleMenu(r.id)}>
              {isSelected && <Check size={12} style={{ marginRight: 4 }} />}
              {r.naam}
            </button>
          );
        })}
      </div>

      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', marginTop: 28, marginBottom: 12 }}>Notitie</h4>
      <div className="field full"><textarea rows={3} value={form.notitie || ''} onChange={e => setField('notitie', e.target.value)} /></div>

      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', marginTop: 28, marginBottom: 12 }}>
        <Users size={14} style={{ marginRight: 6 }} />Teamplanning
      </h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {['Cor', 'Mathijs', 'Kevin', 'Stagiair'].map(naam => {
          const team = form.team || [];
          const isSelected = team.indexOf(naam) >= 0;
          return (
            <button key={naam} className={'btn btn-sm ' + (isSelected ? 'btn-brand' : 'btn-ghost')} onClick={() => setField('team', isSelected ? team.filter((n: string) => n !== naam) : team.concat([naam]))}>
              {isSelected && <Check size={12} style={{ marginRight: 4 }} />}
              {naam}
            </button>
          );
        })}
      </div>

      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--indigo)', textTransform: 'uppercase', marginTop: 28, marginBottom: 12 }}>
        <Clock size={14} style={{ marginRight: 6 }} />Draaiboek
      </h4>
      <div style={{ marginBottom: 8 }}>
        {(form.draaiboek || []).map((item: any, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <input type="time" value={item.tijd || ''} onChange={e => { const d = [...(form.draaiboek || [])]; d[i] = { ...d[i], tijd: e.target.value }; setField('draaiboek', d); }} style={{ width: 90, padding: '8px 12px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
            <input value={item.activiteit || ''} onChange={e => { const d = [...(form.draaiboek || [])]; d[i] = { ...d[i], activiteit: e.target.value }; setField('draaiboek', d); }} placeholder="bijv. Opbouw BBQ" style={{ flex: 1, padding: '8px 12px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
            <button onClick={() => { const d = [...(form.draaiboek || [])]; d.splice(i, 1); setField('draaiboek', d); }} aria-label="Tijdslot verwijderen" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, minWidth: 36, minHeight: 36 }}>&#x2715;</button>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => setField('draaiboek', (form.draaiboek || []).concat([{ tijd: '', activiteit: '' }]))}><Plus size={12} /> Tijdslot toevoegen</button>
      </div>

      <div style={{ marginTop: 20, padding: 16, background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Geschatte omzet: </span>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>{fmt(omzet)}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>({form.guests || 0} × {fmt(form.ppp || 0)})</span>
      </div>

      {form.status === 'completed' && (
        <div style={{ marginTop: 16, padding: 16, background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--brand)', marginBottom: 12, letterSpacing: '.1em' }}>
            <BarChart3 size={14} style={{ marginRight: 6 }} />P&amp;L — Werkelijk vs Begroot
          </h4>
          <div className="form-grid">
            <div className="field"><label>Werkelijke kosten</label><input type="number" step="0.01" value={form.werkelijke_kosten || 0} onChange={e => setField('werkelijke_kosten', parseFloat(e.target.value) || 0)} /></div>
            <div className="field"><label>Extra kosten (personeel etc.)</label><input type="number" step="0.01" value={form.extra_kosten || 0} onChange={e => setField('extra_kosten', parseFloat(e.target.value) || 0)} /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 13, flexWrap: 'wrap', gap: 8 }}>
            <div><span style={{ color: 'var(--muted)' }}>Omzet: </span><span style={{ fontWeight: 700, color: 'var(--brand)' }}>{fmt(omzet)}</span></div>
            <div><span style={{ color: 'var(--muted)' }}>Kosten: </span><span style={{ fontWeight: 700, color: 'var(--red)' }}>{fmt((form.werkelijke_kosten || 0) + (form.extra_kosten || 0))}</span></div>
            <div><span style={{ color: 'var(--muted)' }}>Winst: </span><span style={{ fontWeight: 700, color: (omzet - (form.werkelijke_kosten || 0) - (form.extra_kosten || 0)) > 0 ? 'var(--emerald)' : 'var(--red)' }}>{fmt(omzet - (form.werkelijke_kosten || 0) - (form.extra_kosten || 0))}</span></div>
          </div>
        </div>
      )}

      {(form.menu || []).length > 0 && (
        <div style={{ marginTop: 16, padding: 16, background: 'rgba(59,130,246,.04)', borderRadius: 12, border: '1px solid rgba(59,130,246,.12)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--blue)', letterSpacing: '.1em' }}>
              <ShoppingCart size={14} style={{ marginRight: 6 }} />Inkooplijst
            </span>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: 'var(--blue)' }} onClick={() => setShowInkoop(s => !s)}>{showInkoop ? 'Verbergen' : 'Genereer'}</button>
          </div>
          {showInkoop && (() => {
            const guests = form.guests || 1;
            const grouped: Record<string, { totaal: number; eenheid: string; recepten: string[] }> = {};
            (form.menu || []).forEach((receptId: any) => {
              const recept = recepten.find(r => String(r.id) === String(receptId));
              if (!recept) return;
              let ingredienten: any[] = (recept.ingredienten as any[]) || [];
              if (typeof ingredienten === 'string') { try { ingredienten = JSON.parse(ingredienten); } catch { ingredienten = []; } }
              const porties = recept.porties || 1;
              const multiplier = guests / porties;
              ingredienten.forEach((ing: any) => {
                const key = (ing.naam || '?').toLowerCase();
                if (!grouped[key]) grouped[key] = { totaal: 0, eenheid: ing.eenheid || '', recepten: [] };
                grouped[key].totaal += (parseFloat(ing.hoeveelheid) || 0) * multiplier;
                if (grouped[key].recepten.indexOf(recept.naam) < 0) grouped[key].recepten.push(recept.naam);
              });
            });
            const entries = Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));
            if (entries.length === 0) return <div style={{ fontSize: 12, color: 'var(--muted)' }}>Geen ingrediënten gevonden in gekoppelde recepten</div>;
            return (
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {entries.map(([name, info]) => (
                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                    <span style={{ fontWeight: 600 }}>{name}</span>
                    <span style={{ color: 'var(--muted)' }}>{info.totaal.toFixed(1)} {info.eenheid} <span style={{ opacity: 0.6 }}>({info.recepten.join(', ')})</span></span>
                  </div>
                ))}
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>Berekend voor {guests} gasten op basis van {(form.menu || []).length} recept(en)</div>
              </div>
            );
          })()}
        </div>
      )}

      <div className="editor-actions" style={{ marginTop: 20 }}>
        <button className="btn btn-brand" onClick={saveEvent} disabled={saving}><Save size={14} /> {saving ? 'Opslaan…' : 'Opslaan'}</button>
        <button className="btn btn-ghost" onClick={sendBevestiging} disabled={!form.client_email}><Mail size={14} /> Bevestiging</button>
        <button className="btn btn-cyan" onClick={createOfferte}><FileText size={14} /> Offerte maken</button>
        <button className="btn btn-ghost" onClick={duplicateEvent}><Copy size={14} /> Dupliceer</button>
        <button className="btn btn-red" onClick={deleteEvent}><Trash2 size={14} /> Verwijderen</button>
      </div>

      {form.offerte_id && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255,191,0,.06)', border: '1px solid rgba(255,191,0,.12)', borderRadius: 10, fontSize: 12, color: 'var(--muted)' }}>
          Gekoppeld aan Offerte — data wordt automatisch gesynchroniseerd
        </div>
      )}
    </div>
  );
}
