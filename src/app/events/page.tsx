/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase, useSettings } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { fmt, fmtNl, today, addDays, genNummer } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import KlantAutocomplete from '@/components/KlantAutocomplete';
import EventTimeline from '@/components/EventTimeline';
import type { Event as DbEvent, Recept, Offerte, InventoryItem, PrepSuggestion, EventReflectie } from '@/types';

export default function Events() {
    const { data: events, insert, update, remove } = useSupabase<DbEvent>('events', []);
    const { data: recepten } = useSupabase<Recept>('recepten', []);
    const { data: reflecties } = useSupabase<EventReflectie>('event_reflecties', []);
    const { data: prepTasks } = useSupabase<any>('prep_tasks', []);
    const { data: facturen } = useSupabase<any>('facturen', []);
    const offertes = useSupabase<Offerte>('offertes', []);
    const { settings } = useSettings();
    const showToast = useToast();
    const showConfirm = useConfirm();
    const router = useRouter();
    const [editing, setEditing] = useState<string | number | null>(null);
    const [form, setForm] = useState<Record<string, any> | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>('alle');
    const [searchQuery, setSearchQuery] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});

    function getReflectie(eventId: number): EventReflectie | undefined {
        return reflecties.find(function (r) { return r.event_id === eventId; });
    }

    function newEvent() {
        setEditing('new');
        setForm({ name: '', date: today(), guests: 50, location: '', ppp: 45, status: 'pending', client_naam: '', client_adres: '', client_tel: '', client_email: '', type: 'Particulier', notitie: '', menu: [] });
    }

    function editEvent(ev: DbEvent) { setEditing(ev.id); setForm(JSON.parse(JSON.stringify(ev))); }
    function setField(key: string, val: any) { setForm(Object.assign({}, form, { [key]: val })); }

    function validateEvent(): boolean {
        const e: Record<string, string> = {};
        if (!form!.name) e.name = 'Vul een naam in';
        if (!form!.date) e.date = 'Vul een datum in';
        if (!form!.guests || form!.guests <= 0) e.guests = 'Vul het aantal gasten in';
        setErrors(e);
        return Object.keys(e).length === 0;
    }

    function saveEvent() {
        if (!validateEvent()) return;
        if (editing === 'new') {
            insert(form!).then(function () {
                showToast('Event aangemaakt 🔥', 'success');
                setEditing(null); setForm(null);
            }).catch(function (err: any) {
                console.error('Event insert error:', err);
                showToast('Fout bij aanmaken: ' + (err.message || 'onbekend'), 'error');
            });
        } else {
            supabase.from('events').select('status').eq('id', editing).single().then(function (freshRes: any) {
                const freshStatus = (freshRes.data && freshRes.data.status) || 'pending';
                const justCompleted = freshStatus !== 'completed' && form!.status === 'completed';
                console.log('[SAVE] Fresh DB status:', freshStatus, 'Form status:', form!.status, 'justCompleted:', justCompleted, 'menu:', JSON.stringify(form!.menu));
                const { id, created_at, ...rest } = form!;
                update(editing as number, rest).then(function () {
                    showToast('Event bijgewerkt', 'success');
                    if (justCompleted) { drainInventoryForEvent(form!); }
                    setEditing(null); setForm(null);
                }).catch(function (err: any) {
                    console.error('Event update error:', err);
                    showToast('Fout bij opslaan: ' + (err.message || 'onbekend'), 'error');
                });
            });
        }
    }

    function getNextFreeMonday() {
        const d = new Date();
        const day = d.getDay();
        const diff = (day === 0) ? 1 : (day === 1 ? 7 : (8 - day));
        const monday = new Date(d);
        monday.setDate(d.getDate() + diff);
        monday.setHours(9, 0, 0, 0);
        return monday;
    }

    function drainInventoryForEvent(event: Record<string, any>) {
        const menuIds = event.menu || [];
        console.log('[DRAIN] Starting drain for event:', event.name, 'menu:', JSON.stringify(menuIds), 'guests:', event.guests);
        if (menuIds.length === 0) { showToast('Geen recepten gekoppeld — voorraad niet afgetrokken', 'info'); return; }
        if (!supabase) return;
        const guests = event.guests || 1;
        Promise.resolve(supabase.from('inventory').select('*')).then(function (invRes: any) {
            if (invRes.error) { console.error('[DRAIN] Inventory fetch error:', invRes.error); return; }
            const inventory = invRes.data || [];
            console.log('[DRAIN] Inventory items:', inventory.length);
            if (inventory.length === 0) { console.log('[DRAIN] No inventory items found'); return; }
            const deducted: string[] = [];
            const lowStockItems: string[] = [];
            menuIds.forEach(function (receptId: any) {
                const recept = recepten.find(function (r) { return String(r.id) === String(receptId); });
                console.log('[DRAIN] Looking for recipe ID:', receptId, 'Found:', recept ? recept.naam : 'NOT FOUND');
                if (!recept) return;
                let ingredienten: any[] = recept.ingredienten as any[] || [];
                if (typeof ingredienten === 'string') {
                    try { ingredienten = JSON.parse(ingredienten); } catch (e) { ingredienten = []; }
                }
                const porties = recept.porties || 1;
                const multiplier = guests / porties;
                console.log('[DRAIN] Recipe:', recept.naam, 'porties:', porties, 'multiplier:', multiplier, 'ingredients:', ingredienten.length);
                ingredienten.forEach(function (ing: any) {
                    const match = inventory.find(function (inv: any) {
                        return ing.naam && inv.naam && inv.naam.toLowerCase().indexOf(ing.naam.toLowerCase()) >= 0;
                    });
                    console.log('[DRAIN] Ingredient:', ing.naam, ing.hoeveelheid, ing.eenheid, 'Match:', match ? match.naam + ' (' + match.current_stock + match.unit + ')' : 'NONE');
                    if (match) {
                        const qty = (parseFloat(ing.hoeveelheid) || 0) * multiplier;
                        let unitFactor = 1;
                        if (ing.eenheid === 'gram' && match.unit === 'kg') unitFactor = 0.001;
                        if (ing.eenheid === 'ml' && match.unit === 'L') unitFactor = 0.001;
                        const deductAmount = qty * unitFactor;
                        const newStock = Math.max(0, (match.current_stock || 0) - deductAmount);
                        console.log('[DRAIN] Deducting:', deductAmount.toFixed(2), match.unit, 'New stock:', newStock.toFixed(2));
                        supabase.from('inventory').update({ current_stock: newStock }).eq('id', match.id).then(function () { });
                        match.current_stock = newStock;
                        deducted.push(match.naam + ' -' + deductAmount.toFixed(1) + match.unit);
                        if (newStock < (match.min_stock || 0)) {
                            const tekort = (match.min_stock || 0) - newStock;
                            lowStockItems.push(match.naam);
                            const prepMonday = getNextFreeMonday();
                            supabase.from('prep_suggestions').insert({
                                task_name: 'Prep ' + tekort.toFixed(1) + match.unit + ' ' + match.naam,
                                ingredient_naam: match.naam,
                                tekort: tekort,
                                unit: match.unit,
                                scheduled_at: prepMonday.toISOString(),
                                status: 'pending'
                            }).then(function () { });
                        }
                    }
                });
            });
            if (deducted.length > 0) {
                showToast('📉 Voorraad afgetrokken: ' + deducted.slice(0, 3).join(', ') + (deducted.length > 3 ? ' +' + (deducted.length - 3) + ' meer' : ''), 'success');
            }
            if (lowStockItems.length > 0) {
                setTimeout(function () {
                    showToast('⚠️ VOORRAAD TE LAAG: Bestel of Prep ' + lowStockItems.join(', '), 'error');
                }, 1500);
            }
        }).catch(function (err: any) {
            console.error('Inventory drain error:', err);
            showToast('Fout bij voorraad verwerking', 'error');
        });
    }

    function toggleMenu(receptId: number) {
        const current = form!.menu || [];
        const idx = current.indexOf(receptId);
        if (idx >= 0) {
            setField('menu', current.filter(function (id: number) { return id !== receptId; }));
        } else {
            setField('menu', current.concat([receptId]));
        }
    }

    function duplicateEvent(ev: DbEvent) {
        const copy = JSON.parse(JSON.stringify(ev));
        delete copy.id;
        delete copy.created_at;
        delete copy.offerte_id;
        copy.name = (copy.name || '') + ' (kopie)';
        copy.date = today();
        copy.status = 'pending';
        setEditing('new');
        setForm(copy);
        showToast('Event gedupliceerd — pas datum en details aan', 'info');
    }

    function deleteEvent() {
        showConfirm('Weet je zeker dat je dit event wilt verwijderen?', function () {
            remove(editing as number).then(function () { showToast('Event verwijderd', 'success'); setEditing(null); setForm(null); });
        });
    }

    function createOfferte() {
        const geldigDagen = (settings && settings.offerte_geldig) || 30;
        const nummer = genNummer((settings && settings.offerte_prefix) || 'OFF-2026-', offertes.data.length + 1);
        const offData = {
            nummer: nummer,
            status: 'concept' as const,
            client_naam: form!.client_naam || form!.name,
            client_adres: form!.client_adres || '',
            datum: today(),
            geldig_tot: addDays(today(), geldigDagen),
            notitie: form!.notitie || '',
            items: [{ desc: 'BBQ Catering - ' + form!.name, qty: form!.guests || 50, prijs: form!.ppp || 45, btw: (settings && settings.default_btw) || 21 }]
        };
        offertes.insert(offData).then(function () {
            showToast('Offerte aangemaakt vanuit event', 'success');
        });
    }

    if (editing !== null && form) {
        const omzet = (form.guests || 0) * (form.ppp || 0);
        return (
            <div className="panel">
                <div className="panel-head">
                    <h3>{editing === 'new' ? 'Nieuw Event' : 'Event Bewerken'}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={function () { setEditing(null); setForm(null); }}><i className="fa-solid fa-arrow-left"></i> Terug</button>
                </div>
                <div className="panel-body">
                    {editing !== 'new' && (
                        <EventTimeline
                            eventStatus={form.status}
                            hasOfferte={!!form.offerte_id}
                            hasFactuur={facturen.some(function (f: any) { return f.client_naam === form.client_naam && f.status !== 'geannuleerd'; })}
                            hasReflectie={!!getReflectie(editing as number)}
                            hasPrep={prepTasks.some(function (p: any) { return p.event_id === editing; })}
                        />
                    )}
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', marginBottom: 12 }}>Eventgegevens</h4>
                    <div className="form-grid">
                        <div className="field full"><label>Event Naam</label><input value={form.name} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('name', e.target.value); setErrors(Object.assign({}, errors, { name: '' })); }} style={errors.name ? { borderColor: 'var(--red)' } : {}} />{errors.name && <span style={{ fontSize: 11, color: 'var(--red)', marginTop: 4, display: 'block' }}>{errors.name}</span>}</div>
                        <div className="field"><label>Datum</label><input type="date" value={form.date} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('date', e.target.value); setErrors(Object.assign({}, errors, { date: '' })); }} style={errors.date ? { borderColor: 'var(--red)' } : {}} />{errors.date && <span style={{ fontSize: 11, color: 'var(--red)', marginTop: 4, display: 'block' }}>{errors.date}</span>}</div>
                        <div className="field"><label>Locatie</label><input value={form.location} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('location', e.target.value); }} /></div>
                        <div className="field"><label>Aantal Gasten</label><input type="number" value={form.guests} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('guests', parseInt(e.target.value) || 0); setErrors(Object.assign({}, errors, { guests: '' })); }} style={errors.guests ? { borderColor: 'var(--red)' } : {}} />{errors.guests && <span style={{ fontSize: 11, color: 'var(--red)', marginTop: 4, display: 'block' }}>{errors.guests}</span>}</div>
                        <div className="field"><label>Prijs per Persoon</label><input type="number" step="0.50" value={form.ppp} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('ppp', parseFloat(e.target.value) || 0); }} /></div>
                        <div className="field"><label>Type</label>
                            <select value={form.type} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setField('type', e.target.value); }}>
                                {['Particulier', 'Zakelijk', 'Festival'].map(function (t) { return <option key={t}>{t}</option>; })}
                            </select>
                        </div>
                        <div className="field"><label>Status</label>
                            <select value={form.status} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setField('status', e.target.value); }}>
                                <option value="optie">Optie (Offerte)</option>
                                <option value="pending">In afwachting</option>
                                <option value="confirmed">Bevestigd</option>
                                <option value="completed">Voltooid ✓</option>
                            </select>
                        </div>
                    </div>

                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', marginTop: 28, marginBottom: 12 }}>Klantgegevens</h4>
                    <div className="form-grid">
                        <KlantAutocomplete
                            label="Naam"
                            value={form.client_naam}
                            onChange={function (v) { setField('client_naam', v); }}
                            onSelect={function (k) { setField('client_naam', k.naam); setField('client_adres', [k.adres, k.postcode, k.plaats].filter(Boolean).join(', ')); setField('client_tel', k.telefoon || form.client_tel); setField('client_email', k.email || form.client_email); }}
                        />
                        <div className="field"><label>Adres</label><input value={form.client_adres} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('client_adres', e.target.value); }} /></div>
                        <div className="field"><label>Telefoon</label><input value={form.client_tel} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('client_tel', e.target.value); }} /></div>
                        <div className="field"><label>Email</label><input type="email" value={form.client_email} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('client_email', e.target.value); }} /></div>
                    </div>

                    {form.offerte_id && (
                        <div style={{ margin: '16px 0 8px', padding: '10px 14px', background: 'rgba(255,191,0,.06)', border: '1px solid rgba(255,191,0,.12)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <i className="fa-solid fa-link" style={{ color: 'var(--brand)', fontSize: 11 }}></i>
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>🔗 Gekoppeld aan Offerte — data wordt automatisch gesynchroniseerd</span>
                        </div>
                    )}

                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', marginTop: 28, marginBottom: 12 }}>
                        <i className="fa-solid fa-utensils" style={{ marginRight: 6 }}></i>Menu (Recepten Koppelen)
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {recepten.length === 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Geen recepten gevonden — maak eerst recepten aan</span>}
                        {recepten.map(function (r) {
                            const isSelected = (form.menu || []).indexOf(r.id) >= 0;
                            return (
                                <button key={r.id} className={'btn btn-sm ' + (isSelected ? 'btn-brand' : 'btn-ghost')}
                                    onClick={function () { toggleMenu(r.id); }} style={{ fontSize: 11, padding: '5px 12px' }}>
                                    {isSelected && <i className="fa-solid fa-check" style={{ fontSize: 9, marginRight: 4 }}></i>}
                                    {r.naam}
                                </button>
                            );
                        })}
                    </div>
                    {(form.menu || []).length > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 12 }}>
                            {(form.menu || []).length} recept(en) gekoppeld — ingrediënten worden bij "Voltooid" automatisch van voorraad afgetrokken
                        </div>
                    )}

                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', marginTop: 28, marginBottom: 12 }}>Notitie</h4>
                    <div className="field full"><textarea rows={3} value={form.notitie || ''} onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setField('notitie', e.target.value); }} /></div>

                    <div style={{ marginTop: 20, padding: 16, background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Geschatte omzet: </span>
                        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>{fmt(omzet)}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>({form.guests} × {fmt(form.ppp)})</span>
                    </div>

                    <div className="editor-actions">
                        <button className="btn btn-brand" onClick={saveEvent}><i className="fa-solid fa-save"></i> Opslaan</button>
                        <button className="btn btn-cyan" onClick={createOfferte}><i className="fa-solid fa-file-signature"></i> Offerte Maken</button>
                        {editing !== 'new' && <button className="btn btn-ghost" onClick={function () { duplicateEvent(form as unknown as DbEvent); }}><i className="fa-solid fa-copy"></i> Dupliceer</button>}
                        {editing !== 'new' && <button className="btn btn-red" onClick={deleteEvent}><i className="fa-solid fa-trash"></i> Verwijderen</button>}
                    </div>
                </div>
            </div>
        );
    }

    const monthNames = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
    const filtered = events.filter(function (ev) {
        if (filterStatus !== 'alle' && ev.status !== filterStatus) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (ev.name || '').toLowerCase().includes(q) || (ev.location || '').toLowerCase().includes(q) || (ev.client_naam || '').toLowerCase().includes(q);
        }
        return true;
    });
    const sorted = filtered.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap' as const, gap: 10 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>Events ({filtered.length}{filtered.length !== events.length ? ' / ' + events.length : ''})</h3>
                <button className="btn btn-brand" onClick={newEvent}><i className="fa-solid fa-plus"></i> Nieuw Event</button>
            </div>
            <div style={{ marginBottom: 12 }}>
                <input
                    value={searchQuery}
                    onChange={function (e) { setSearchQuery(e.target.value); }}
                    placeholder="Zoek op naam, locatie of klant..."
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', marginBottom: 8 }}
                />
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch' as any }}>
                    {['alle', 'pending', 'optie', 'confirmed', 'completed'].map(function (s) {
                        const labels: Record<string, string> = { alle: 'Alle', pending: 'Pending', optie: 'Optie', confirmed: 'Bevestigd', completed: 'Voltooid' };
                        return <button key={s} className={'btn btn-sm ' + (filterStatus === s ? 'btn-brand' : 'btn-ghost')}
                            onClick={function () { setFilterStatus(s); }}
                            style={{ fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>{labels[s]}</button>;
                    })}
                </div>
            </div>
            <div className="panel">
                {events.length === 0 && <div className="empty-state"><i className="fa-solid fa-fire"></i><p>Nog geen events aangemaakt</p><button className="btn btn-brand btn-sm" onClick={newEvent}>Eerste Event Toevoegen</button></div>}
                {sorted.map(function (ev) {
                    const parts = (ev.date || '').split('-');
                    const month = parts[1] ? monthNames[parseInt(parts[1], 10) - 1] : '';
                    const day = parts[2] || '';
                    const omzet = (ev.guests || 0) * (ev.ppp || 0);
                    const rowGlow = ev.status === 'optie' ? ' ev-row-optie' : ev.status === 'confirmed' ? ' ev-row-confirmed' : '';
                    const pillClass = ev.status === 'completed' ? 'pill-green' : ev.status === 'confirmed' ? 'pill-green' : ev.status === 'optie' ? 'pill-optie' : 'pill-amber';
                    const pillLabel = ev.status === 'completed' ? '✓ Voltooid' : ev.status === 'confirmed' ? '✅ Bevestigd' : ev.status === 'optie' ? '🟠 Optie' : 'In afwachting';
                    const ref = getReflectie(ev.id);
                    const needsReflectie = ev.status === 'completed' && !ref;
                    return (
                        <div key={ev.id}>
                            <div className={'ev-row' + rowGlow} onClick={function () { editEvent(ev); }}>
                                <div className="ev-date-block">
                                    <span className="ev-month">{month}</span>
                                    <span className="ev-day">{day}</span>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {ev.offerte_id && <i className="fa-solid fa-link" style={{ fontSize: 9, color: 'var(--brand)' }}></i>}
                                        {ev.name}
                                        {ref && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 7px', borderRadius: 6, fontSize: 10, fontWeight: 800, background: 'rgba(255,191,0,.12)', color: 'var(--brand)' }}><i className="fa-solid fa-star" style={{ fontSize: 8 }}></i> {ref.score}/10</span>}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', flexWrap: 'wrap' as const, gap: '2px 10px' }}>
                                        <span><i className="fa-solid fa-location-dot" style={{ marginRight: 4 }}></i>{ev.location || '—'}</span>
                                        <span><i className="fa-solid fa-users" style={{ marginRight: 4 }}></i>{ev.guests} gasten</span>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontWeight: 600 }}>{fmt(omzet)}</div>
                                    <span className={'pill ' + pillClass}>{pillLabel}</span>
                                </div>
                            </div>
                            {needsReflectie && (
                                <div
                                    onClick={function (e) { e.stopPropagation(); router.push('/events/' + ev.id + '/reflectie'); }}
                                    style={{
                                        margin: '-1px 0 8px',
                                        padding: '10px 16px',
                                        background: 'linear-gradient(90deg, rgba(255,191,0,.08), rgba(255,191,0,.02))',
                                        border: '1px solid rgba(255,191,0,.2)',
                                        borderTop: 'none',
                                        borderRadius: '0 0 12px 12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        cursor: 'pointer',
                                        transition: 'background 0.2s'
                                    }}
                                >
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <i className="fa-solid fa-clipboard-check"></i> Reflectie invullen voor dit event
                                    </span>
                                    <i className="fa-solid fa-arrow-right" style={{ fontSize: 11, color: 'var(--brand)' }}></i>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );
}
