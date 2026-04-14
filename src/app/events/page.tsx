/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase, useSettings } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { fmt, fmtNl, today, addDays, genNummer, nextNummer } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { mailEventBevestiging } from '@/lib/emailHelper';
import KlantAutocomplete from '@/components/KlantAutocomplete';
import EmptyState from '@/components/EmptyState';
import EventTimeline from '@/components/EventTimeline';
import PageHeader from '@/components/PageHeader';
import PageSection from '@/components/PageSection';
import PageHint from '@/components/PageHint';
import FollowUpPrompt, { type FollowUpAction } from '@/components/FollowUpPrompt';
import { ArrowLeft, Link as LinkIcon, UtensilsCrossed, Check, Users, Clock, Plus, BarChart3, ShoppingCart, Save, Mail, FileText, Copy, Trash2, CalendarPlus, Star, MapPin, Route, ClipboardCheck, ArrowRight, Thermometer } from 'lucide-react';
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
    const [isMobile, setIsMobile] = useState(false);
    const [followUpActions, setFollowUpActions] = useState<FollowUpAction[] | null>(null);
    const [followUpTitle, setFollowUpTitle] = useState('');

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

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
                setFollowUpTitle('Event aangemaakt!');
                setFollowUpActions([
                    { icon: '📄', label: 'Offerte versturen naar klant', href: '/offertes' },
                    { icon: '📝', label: 'Notitie toevoegen', onClick: function () { /* scroll to notes */ } },
                    { icon: '📅', label: 'Bekijk in agenda', href: '/agenda' },
                ]);
                setEditing(null); setForm(null);
            }).catch(function (err: any) {
                console.error('Event insert error:', err);
                showToast('Fout bij aanmaken: ' + (err.message || 'onbekend'), 'error');
            });
        } else {
            supabase.from('events').select('status').eq('id', editing).single().then(function (freshRes: any) {
                const freshStatus = (freshRes.data && freshRes.data.status) || 'pending';
                const justCompleted = freshStatus !== 'completed' && form!.status === 'completed';
                const { id, created_at, ...rest } = form!;
                update(editing as number, rest).then(function () {
                    showToast('Event bijgewerkt', 'success');
                    if (justCompleted) {
                        drainInventoryForEvent(form!);
                        setFollowUpTitle('Event afgerond!');
                        setFollowUpActions([
                            { icon: '🧾', label: 'Factuur genereren', href: '/facturen' },
                            { icon: '⭐', label: 'Reflectie invullen', onClick: function () { /* open reflectie */ } },
                            { icon: '📊', label: 'P&L bekijken', href: '/financien' },
                        ]);
                    } else if (form!.status === 'confirmed') {
                        setFollowUpTitle('Event bevestigd!');
                        setFollowUpActions([
                            { icon: '📋', label: 'Prep-taken bekijken', href: '/agenda' },
                            { icon: '📧', label: 'Bevestiging sturen naar klant', onClick: function () { if (form!.client_email) { mailEventBevestiging(form!, settings?.bedrijfsnaam || 'Hop & Bites'); showToast('Bevestiging verstuurd!', 'success'); } else { showToast('Geen email adres', 'error'); } } },
                            { icon: '🛒', label: 'Inkooplijst genereren', href: '/inkoop' },
                        ]);
                    }
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
        if (menuIds.length === 0) { showToast('Geen recepten gekoppeld — voorraad niet afgetrokken', 'info'); return; }
        if (!supabase) return;
        const guests = event.guests || 1;
        Promise.resolve(supabase.from('inventory').select('*')).then(function (invRes: any) {
            if (invRes.error) { console.error('[DRAIN] Inventory fetch error:', invRes.error); return; }
            const inventory = invRes.data || [];
            if (inventory.length === 0) return;
            const deducted: string[] = [];
            const lowStockItems: string[] = [];
            menuIds.forEach(function (receptId: any) {
                const recept = recepten.find(function (r) { return String(r.id) === String(receptId); });
                if (!recept) return;
                let ingredienten: any[] = recept.ingredienten as any[] || [];
                if (typeof ingredienten === 'string') {
                    try { ingredienten = JSON.parse(ingredienten); } catch (e) { ingredienten = []; }
                }
                const porties = recept.porties || 1;
                const multiplier = guests / porties;
                ingredienten.forEach(function (ing: any) {
                    const match = inventory.find(function (inv: any) {
                        return ing.naam && inv.naam && inv.naam.toLowerCase().indexOf(ing.naam.toLowerCase()) >= 0;
                    });
                    if (match) {
                        const qty = (parseFloat(ing.hoeveelheid) || 0) * multiplier;
                        let unitFactor = 1;
                        if (ing.eenheid === 'gram' && match.unit === 'kg') unitFactor = 0.001;
                        if (ing.eenheid === 'ml' && match.unit === 'L') unitFactor = 0.001;
                        const deductAmount = qty * unitFactor;
                        const newStock = Math.max(0, (match.current_stock || 0) - deductAmount);
                        Promise.resolve(supabase.from('inventory').update({ current_stock: newStock }).eq('id', match.id)).then(function () { }).catch(function (err: any) { console.error('[DRAIN] Update error:', err); });
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
        const idx = current.findIndex(function (id: any) { return String(id) === String(receptId); });
        if (idx >= 0) {
            setField('menu', current.filter(function (id: any) { return String(id) !== String(receptId); }));
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
        const nummer = nextNummer((settings && settings.offerte_prefix) || 'OFF-2026-', offertes.data.map((o: any) => o.nummer));
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
                    <button className="btn btn-ghost btn-sm" onClick={function () { setEditing(null); setForm(null); }}><ArrowLeft size={14} /> Terug</button>
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
                        <div className="field full"><label>Event Naam</label><input value={form.name} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('name', e.target.value); setErrors(Object.assign({}, errors, { name: '' })); }} style={errors.name ? { borderColor: 'var(--red)' } : {}} />{errors.name && <span style={{ fontSize: 12, color: 'var(--red)', marginTop: 4, display: 'block' }}>{errors.name}</span>}</div>
                        <div className="field"><label>Datum</label><input type="date" value={form.date} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('date', e.target.value); setErrors(Object.assign({}, errors, { date: '' })); }} style={errors.date ? { borderColor: 'var(--red)' } : {}} />{errors.date && <span style={{ fontSize: 12, color: 'var(--red)', marginTop: 4, display: 'block' }}>{errors.date}</span>}</div>
                        <div className="field"><label>Locatie</label><input value={form.location} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('location', e.target.value); }} /></div>
                        <div className="field"><label>Aantal Gasten</label><input type="number" value={form.guests} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('guests', parseInt(e.target.value) || 0); setErrors(Object.assign({}, errors, { guests: '' })); }} style={errors.guests ? { borderColor: 'var(--red)' } : {}} />{errors.guests && <span style={{ fontSize: 12, color: 'var(--red)', marginTop: 4, display: 'block' }}>{errors.guests}</span>}</div>
                        <div className="field"><label>Prijs per Persoon</label><input type="number" step="0.50" value={form.ppp} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('ppp', parseFloat(e.target.value) || 0); }} /></div>
                        <div className="field"><label>Type</label>
                            <select value={form.type} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setField('type', e.target.value); }}>
                                {['Particulier', 'Zakelijk', 'Festival'].map(function (t) { return <option key={t}>{t}</option>; })}
                            </select>
                        </div>
                        <div className="field"><label>Status</label>
                            <select value={form.status} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setField('status', e.target.value); }}>
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
                            <LinkIcon size={12} style={{ color: 'var(--brand)' }} />
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Gekoppeld aan Offerte — data wordt automatisch gesynchroniseerd</span>
                        </div>
                    )}

                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', marginTop: 28, marginBottom: 12 }}>
                        <UtensilsCrossed size={14} style={{ marginRight: 6 }} />Menu (Recepten Koppelen)
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {recepten.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Geen recepten gevonden — maak eerst recepten aan</span>}
                        {recepten.map(function (r) {
                            const isSelected = (form.menu || []).indexOf(r.id) >= 0;
                            return (
                                <button key={r.id} className={'btn btn-sm ' + (isSelected ? 'btn-brand' : 'btn-ghost')}
                                    onClick={function () { toggleMenu(r.id); }}>
                                    {isSelected && <Check size={12} style={{ marginRight: 4 }} />}
                                    {r.naam}
                                </button>
                            );
                        })}
                    </div>
                    {(form.menu || []).length > 0 && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                            {(form.menu || []).length} recept(en) gekoppeld — ingrediënten worden bij "Voltooid" automatisch van voorraad afgetrokken
                        </div>
                    )}

                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', marginTop: 28, marginBottom: 12 }}>Notitie</h4>
                    <div className="field full"><textarea rows={3} value={form.notitie || ''} onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setField('notitie', e.target.value); }} /></div>

                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', marginTop: 28, marginBottom: 12 }}>
                        <Users size={14} style={{ marginRight: 6 }} />Teamplanning
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {['Cor', 'Mathijs', 'Kevin', 'Stagiair'].map(function (naam) {
                            const team = form.team || [];
                            const isSelected = team.indexOf(naam) >= 0;
                            return (
                                <button key={naam} className={'btn btn-sm ' + (isSelected ? 'btn-brand' : 'btn-ghost')}
                                    onClick={function () {
                                        setField('team', isSelected ? team.filter(function (n: string) { return n !== naam; }) : team.concat([naam]));
                                    }}>
                                    {isSelected && <Check size={12} style={{ marginRight: 4 }} />}
                                    {naam}
                                </button>
                            );
                        })}
                    </div>
                    {(form.team || []).length > 0 && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                            {(form.team || []).length} teamleden ingepland
                        </div>
                    )}

                    <h4 style={{ fontSize: 13, fontWeight: 700, color: '#8b8bf0', textTransform: 'uppercase', marginTop: 28, marginBottom: 12 }}>
                        <Clock size={14} style={{ marginRight: 6 }} />Draaiboek
                    </h4>
                    <div style={{ marginBottom: 8 }}>
                        {(form.draaiboek || []).map(function (item: any, i: number) {
                            return (
                                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                                    <input type="time" value={item.tijd || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) {
                                        const d = [...(form.draaiboek || [])]; d[i] = Object.assign({}, d[i], { tijd: e.target.value }); setField('draaiboek', d);
                                    }} style={{ width: 90, padding: '8px 12px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
                                    <input value={item.activiteit || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) {
                                        const d = [...(form.draaiboek || [])]; d[i] = Object.assign({}, d[i], { activiteit: e.target.value }); setField('draaiboek', d);
                                    }} placeholder="bijv. Opbouw BBQ" style={{ flex: 1, padding: '8px 12px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
                                    <button onClick={function () { const d = [...(form.draaiboek || [])]; d.splice(i, 1); setField('draaiboek', d); }}
                                        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Tijdslot verwijderen">&#x2715;</button>
                                </div>
                            );
                        })}
                        <button className="btn btn-ghost btn-sm" onClick={function () {
                            const d = form.draaiboek || [];
                            setField('draaiboek', d.concat([{ tijd: '', activiteit: '' }]));
                        }}><Plus size={12} /> Tijdslot toevoegen</button>
                    </div>

                    <div style={{ marginTop: 20, padding: 16, background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Geschatte omzet: </span>
                        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>{fmt(omzet)}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>({form.guests} × {fmt(form.ppp)})</span>
                    </div>

                    {editing !== 'new' && form.status === 'completed' && (
                        <div style={{ marginTop: 16, padding: 16, background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)' }}>
                            <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--brand)', marginBottom: 12, letterSpacing: '0.1em' }}>
                                <BarChart3 size={14} style={{ marginRight: 6 }} />P&L — Werkelijk vs Begroot
                            </h4>
                            <div className="form-grid">
                                <div className="field"><label>Werkelijke kosten</label><input type="number" step="0.01" value={form.werkelijke_kosten || 0} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('werkelijke_kosten', parseFloat(e.target.value) || 0); }} /></div>
                                <div className="field"><label>Extra kosten (personeel etc.)</label><input type="number" step="0.01" value={form.extra_kosten || 0} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('extra_kosten', parseFloat(e.target.value) || 0); }} /></div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 13 }}>
                                <div><span style={{ color: 'var(--muted)' }}>Omzet: </span><span style={{ fontWeight: 700, color: 'var(--brand)' }}>{fmt(omzet)}</span></div>
                                <div><span style={{ color: 'var(--muted)' }}>Kosten: </span><span style={{ fontWeight: 700, color: '#ef4444' }}>{fmt((form.werkelijke_kosten || 0) + (form.extra_kosten || 0))}</span></div>
                                <div><span style={{ color: 'var(--muted)' }}>Winst: </span><span style={{ fontWeight: 700, color: (omzet - (form.werkelijke_kosten || 0) - (form.extra_kosten || 0)) > 0 ? '#10b981' : '#ef4444' }}>{fmt(omzet - (form.werkelijke_kosten || 0) - (form.extra_kosten || 0))}</span></div>
                            </div>
                        </div>
                    )}

                    {/* Automatische inkooplijst */}
                    {(form.menu || []).length > 0 && (
                        <div style={{ marginTop: 16, padding: 16, background: 'rgba(59,130,246,.04)', borderRadius: 12, border: '1px solid rgba(59,130,246,.12)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#3b82f6', letterSpacing: '0.1em' }}>
                                    <ShoppingCart size={14} style={{ marginRight: 6 }} />Inkooplijst
                                </span>
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: '#3b82f6' }} onClick={function () {
                                    setField('_showInkoop', !form._showInkoop);
                                }}>{form._showInkoop ? 'Verbergen' : 'Genereer'}</button>
                            </div>
                            {form._showInkoop && (function () {
                                const guests = form.guests || 1;
                                const inkoopItems: { naam: string; hoeveelheid: string; eenheid: string; recept: string }[] = [];
                                (form.menu || []).forEach(function (receptId: any) {
                                    const recept = recepten.find(function (r) { return String(r.id) === String(receptId); });
                                    if (!recept) return;
                                    let ingredienten: any[] = recept.ingredienten as any[] || [];
                                    if (typeof ingredienten === 'string') { try { ingredienten = JSON.parse(ingredienten); } catch { ingredienten = []; } }
                                    const porties = recept.porties || 1;
                                    const multiplier = guests / porties;
                                    ingredienten.forEach(function (ing: any) {
                                        const qty = ((parseFloat(ing.hoeveelheid) || 0) * multiplier).toFixed(1);
                                        inkoopItems.push({ naam: ing.naam || '?', hoeveelheid: qty, eenheid: ing.eenheid || '', recept: recept.naam });
                                    });
                                });
                                // Groepeer dezelfde ingredienten
                                const grouped: Record<string, { totaal: number; eenheid: string; recepten: string[] }> = {};
                                inkoopItems.forEach(function (item) {
                                    const key = item.naam.toLowerCase();
                                    if (!grouped[key]) grouped[key] = { totaal: 0, eenheid: item.eenheid, recepten: [] };
                                    grouped[key].totaal += parseFloat(item.hoeveelheid) || 0;
                                    if (grouped[key].recepten.indexOf(item.recept) < 0) grouped[key].recepten.push(item.recept);
                                });
                                const sortedItems = Object.entries(grouped).sort(function (a, b) { return a[0].localeCompare(b[0]); });
                                return sortedItems.length > 0 ? (
                                    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                        {sortedItems.map(function (entry) {
                                            return (
                                                <div key={entry[0]} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                                                    <span style={{ fontWeight: 600 }}>{entry[0]}</span>
                                                    <span style={{ color: 'var(--muted)' }}>{entry[1].totaal.toFixed(1)} {entry[1].eenheid} <span style={{ fontSize: 12, opacity: 0.6 }}>({entry[1].recepten.join(', ')})</span></span>
                                                </div>
                                            );
                                        })}
                                        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>Berekend voor {guests} gasten op basis van {(form.menu || []).length} recept(en)</div>
                                    </div>
                                ) : <div style={{ fontSize: 12, color: 'var(--muted)' }}>Geen ingrediënten gevonden in gekoppelde recepten</div>;
                            })()}
                        </div>
                    )}

                    <div className="editor-actions">
                        <button className="btn btn-brand" onClick={saveEvent}><Save size={14} /> Opslaan</button>
                        <button className="btn btn-ghost" onClick={async function () { const res = await mailEventBevestiging(form, settings?.bedrijfsnaam || 'Hop & Bites'); showToast(res.success ? 'Bevestiging verstuurd!' : 'Fout: ' + (res.error || ''), res.success ? 'success' : 'error'); }}><Mail size={14} /> Bevestiging</button>
                        <button className="btn btn-cyan" onClick={createOfferte}><FileText size={14} /> Offerte Maken</button>
                        {editing !== 'new' && <button className="btn btn-ghost" onClick={function () { duplicateEvent(form as unknown as DbEvent); }}><Copy size={14} /> Dupliceer</button>}
                        {editing !== 'new' && <button className="btn btn-red" onClick={deleteEvent}><Trash2 size={14} /> Verwijderen</button>}
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
            <PageHeader
                title={'Events (' + filtered.length + (filtered.length !== events.length ? ' / ' + events.length : '') + ')'}
                actions={<>
                    <a href="/api/calendar/ical" download className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }} title="Download iCal voor Google Calendar / Outlook">
                        <CalendarPlus size={14} /> Kalender Export
                    </a>
                    <button className="btn btn-brand" onClick={newEvent}><Plus size={14} /> Nieuw Event</button>
                </>}
            />
            <div style={{ marginBottom: 12 }}>
                <input
                    value={searchQuery}
                    onChange={function (e) { setSearchQuery(e.target.value); }}
                    placeholder="Zoek op naam, locatie of klant..."
                    aria-label="Zoek events"
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', marginBottom: 8 }}
                />
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch' as any }}>
                    {['alle', 'pending', 'optie', 'confirmed', 'completed'].map(function (s) {
                        const labels: Record<string, string> = { alle: 'Alle', pending: 'Nieuw', optie: 'Optie', confirmed: 'Bevestigd', completed: 'Afgerond' };
                        return <button key={s} className={'btn btn-sm ' + (filterStatus === s ? 'btn-brand' : 'btn-ghost')}
                            onClick={function () { setFilterStatus(s); }}
                            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{labels[s]}</button>;
                    })}
                </div>
            </div>
            <PageHint id="events" title="Events Beheren" description="Maak events aan, koppel offertes en beheer je planning. Klik op een event om het te bewerken, of gebruik 'Offerte' voor directe offerte-creatie." />
            <PageSection>
            <div className="panel">
                {events.length === 0 && <EmptyState page="/events" onAction={newEvent} />}
                {sorted.map(function (ev) {
                    const parts = (ev.date || '').split('-');
                    const month = parts[1] ? monthNames[parseInt(parts[1], 10) - 1] : '';
                    const day = parts[2] || '';
                    const omzet = (ev.guests || 0) * (ev.ppp || 0);
                    const rowGlow = ev.status === 'optie' ? ' ev-row-optie' : ev.status === 'confirmed' ? ' ev-row-confirmed' : '';
                    const pillClass = ev.status === 'completed' ? 'pill-purple' : ev.status === 'confirmed' ? 'pill-green' : ev.status === 'optie' ? 'pill-optie' : 'pill-amber';
                    const pillLabel = ev.status === 'completed' ? 'Afgerond' : ev.status === 'confirmed' ? 'Bevestigd' : ev.status === 'optie' ? 'Optie' : 'Nieuw';
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
                                        {ev.offerte_id && <LinkIcon size={12} style={{ color: 'var(--brand)' }} />}
                                        {ev.name}
                                        {ref && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 800, background: 'rgba(255,191,0,.12)', color: 'var(--brand)' }}><Star size={12} /> {ref.score}/10</span>}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', flexWrap: 'wrap' as const, gap: '2px 10px' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center' }}><MapPin size={12} style={{ marginRight: 4 }} />{ev.location || '—'}</span>
                                        <span style={{ display: 'inline-flex', alignItems: 'center' }}><Users size={12} style={{ marginRight: 4 }} />{ev.guests} gasten</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <button className="btn btn-ghost btn-sm" title="Maak offerte voor dit event" onClick={function (e) { e.stopPropagation(); router.push('/offerte-editor?client=' + encodeURIComponent(ev.client_naam || ev.name || '') + '&datum=' + encodeURIComponent(ev.date || '') + '&gasten=' + (ev.guests || 50) + '&ppp=' + (ev.ppp || 45) + '&event=' + encodeURIComponent(ev.name || '')); }} style={{ padding: '8px 14px' }}>
                                        <FileText size={14} /> Offerte
                                    </button>
                                    <button className="btn btn-ghost btn-sm" title="Dupliceer dit event" onClick={function (e) { e.stopPropagation(); duplicateEvent(ev); }} style={{ padding: '8px 14px' }}>
                                        <Copy size={14} />
                                    </button>
                                    <button className="btn btn-ghost btn-sm" title="Bekijk de volledige event workflow" onClick={function (e) { e.stopPropagation(); router.push('/events/' + ev.id); }} style={{ padding: '8px 14px' }}>
                                        <Route size={14} /> Flow
                                    </button>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: 600 }}>{fmt(omzet)}</div>
                                        <span className={'pill ' + pillClass}>{pillLabel}</span>
                                    </div>
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
                                        <ClipboardCheck size={14} /> Reflectie invullen voor dit event
                                    </span>
                                    <ArrowRight size={14} style={{ color: 'var(--brand)' }} />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            </PageSection>

            {/* Mobile Quick-Action Bar */}
            {isMobile && (
                <div style={{
                    position: 'fixed', bottom: 72, left: 0, right: 0, zIndex: 40,
                    display: 'flex', gap: 8, padding: '0 12px',
                    justifyContent: 'center',
                }}>
                    <button onClick={function () { router.push('/uren'); }} style={{
                        flex: 1, maxWidth: 140, height: 48, borderRadius: 14, fontSize: 12, fontWeight: 700,
                        background: 'rgba(59,130,246,.15)', border: '1px solid rgba(59,130,246,.3)',
                        color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        backdropFilter: 'blur(12px)', boxShadow: '0 4px 16px rgba(0,0,0,.3)',
                    }}>
                        <Clock size={14} /> Uren
                    </button>
                    <button onClick={function () { router.push('/haccp'); }} style={{
                        flex: 1, maxWidth: 140, height: 48, borderRadius: 14, fontSize: 12, fontWeight: 700,
                        background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.3)',
                        color: '#22c55e', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        backdropFilter: 'blur(12px)', boxShadow: '0 4px 16px rgba(0,0,0,.3)',
                    }}>
                        <Thermometer size={14} /> HACCP
                    </button>
                    <button onClick={newEvent} style={{
                        flex: 1, maxWidth: 140, height: 48, borderRadius: 14, fontSize: 12, fontWeight: 700,
                        background: 'rgba(255,191,0,.15)', border: '1px solid rgba(255,191,0,.3)',
                        color: 'var(--brand)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        backdropFilter: 'blur(12px)', boxShadow: '0 4px 16px rgba(0,0,0,.3)',
                    }}>
                        <Plus size={14} /> Nieuw
                    </button>
                </div>
            )}
            {/* Follow-Up Prompt */}
            {followUpActions && (
                <FollowUpPrompt
                    title={followUpTitle}
                    actions={followUpActions}
                    onDismiss={function () { setFollowUpActions(null); }}
                    autoHideMs={15000}
                />
            )}
        </>
    );
}
