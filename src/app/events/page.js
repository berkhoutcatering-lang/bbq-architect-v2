'use client';
import { useState } from 'react';
import { useSupabase, useSettings } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { fmt, fmtNl, today, addDays, genNummer } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

export default function Events() {
    var { data: events, insert, update, remove } = useSupabase('events', []);
    var { data: recepten } = useSupabase('recepten', []);
    var offertes = useSupabase('offertes', []);
    var { settings } = useSettings();
    var showToast = useToast();
    var showConfirm = useConfirm();
    var [editing, setEditing] = useState(null);
    var [form, setForm] = useState(null);

    function newEvent() {
        setEditing('new');
        setForm({ name: '', date: today(), guests: 50, location: '', ppp: 45, status: 'pending', client_naam: '', client_adres: '', client_tel: '', client_email: '', type: 'Particulier', notitie: '', menu: [] });
    }

    function editEvent(ev) { setEditing(ev.id); setForm(JSON.parse(JSON.stringify(ev))); }
    function setField(key, val) { setForm(Object.assign({}, form, { [key]: val })); }

    function saveEvent() {
        if (!form.name) { showToast('Vul een naam in', 'error'); return; }
        if (editing === 'new') {
            insert(form).then(function () {
                showToast('Event aangemaakt 🔥', 'success');
                setEditing(null); setForm(null);
            }).catch(function (err) {
                console.error('Event insert error:', err);
                showToast('Fout bij aanmaken: ' + (err.message || 'onbekend'), 'error');
            });
        } else {
            // Fetch fresh status from DB to avoid stale React state
            supabase.from('events').select('status').eq('id', editing).single().then(function (freshRes) {
                var freshStatus = (freshRes.data && freshRes.data.status) || 'pending';
                var justCompleted = freshStatus !== 'completed' && form.status === 'completed';
                var { id, created_at, ...rest } = form;
                update(editing, rest).then(function () {
                    showToast('Event bijgewerkt', 'success');
                    if (justCompleted) { drainInventoryForEvent(form); }
                    setEditing(null); setForm(null);
                }).catch(function (err) {
                    console.error('Event update error:', err);
                    showToast('Fout bij opslaan: ' + (err.message || 'onbekend'), 'error');
                });
            });
        }
    }

    // Helper: find next Monday >= today at 09:00
    function getNextFreeMonday() {
        var d = new Date();
        var day = d.getDay(); // 0=Sun, 1=Mon ...
        var diff = (day === 0) ? 1 : (day === 1 ? 7 : (8 - day));
        var monday = new Date(d);
        monday.setDate(d.getDate() + diff);
        monday.setHours(9, 0, 0, 0);
        return monday;
    }

    // DATA CENTER: Inventory drain when event completed
    function drainInventoryForEvent(event) {
        var menuIds = event.menu || [];
        if (menuIds.length === 0) { showToast('Geen recepten gekoppeld — voorraad niet afgetrokken', 'info'); return; }
        var guests = event.guests || 1;
        supabase.from('inventory').select('*').then(function (invRes) {
            if (invRes.error) { console.error('Inventory fetch error:', invRes.error); return; }
            var inventory = invRes.data || [];
            if (inventory.length === 0) return;
            var deducted = [];
            var lowStockItems = [];
            menuIds.forEach(function (receptId) {
                var recept = recepten.find(function (r) { return r.id === receptId; });
                if (!recept) return;
                var porties = recept.porties || 1;
                var multiplier = guests / porties;
                (recept.ingredienten || []).forEach(function (ing) {
                    var match = inventory.find(function (inv) {
                        return ing.naam && inv.naam && inv.naam.toLowerCase().indexOf(ing.naam.toLowerCase()) >= 0;
                    });
                    if (match) {
                        var qty = (parseFloat(ing.hoeveelheid) || 0) * multiplier;
                        var unitFactor = 1;
                        if (ing.eenheid === 'gram' && match.unit === 'kg') unitFactor = 0.001;
                        if (ing.eenheid === 'ml' && match.unit === 'L') unitFactor = 0.001;
                        var deductAmount = qty * unitFactor;
                        var newStock = Math.max(0, (match.current_stock || 0) - deductAmount);
                        supabase.from('inventory').update({ current_stock: newStock }).eq('id', match.id).then(function () { });
                        match.current_stock = newStock;
                        deducted.push(match.naam + ' -' + deductAmount.toFixed(1) + match.unit);
                        // Auto-generate prep suggestion if below par-level
                        if (newStock < (match.min_stock || 0)) {
                            var tekort = (match.min_stock || 0) - newStock;
                            lowStockItems.push(match.naam);
                            var prepMonday = getNextFreeMonday();
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
        }).catch(function (err) {
            console.error('Inventory drain error:', err);
            showToast('Fout bij voorraad verwerking', 'error');
        });
    }

    function toggleMenu(receptId) {
        var current = form.menu || [];
        var idx = current.indexOf(receptId);
        if (idx >= 0) {
            setField('menu', current.filter(function (id) { return id !== receptId; }));
        } else {
            setField('menu', current.concat([receptId]));
        }
    }

    function deleteEvent() {
        showConfirm('Weet je zeker dat je dit event wilt verwijderen?', function () {
            remove(editing).then(function () { showToast('Event verwijderd', 'success'); setEditing(null); setForm(null); });
        });
    }

    function createOfferte() {
        var geldigDagen = (settings && settings.offerte_geldig) || 30;
        var nummer = genNummer((settings && settings.offerte_prefix) || 'OFF-2026-', offertes.data.length + 1);
        var offData = {
            nummer: nummer,
            status: 'concept',
            client_naam: form.client_naam || form.name,
            client_adres: form.client_adres || '',
            datum: today(),
            geldig_tot: addDays(today(), geldigDagen),
            notitie: form.notitie || '',
            items: [{ desc: 'BBQ Catering - ' + form.name, qty: form.guests || 50, prijs: form.ppp || 45, btw: (settings && settings.default_btw) || 21 }]
        };
        offertes.insert(offData).then(function () {
            showToast('Offerte aangemaakt vanuit event', 'success');
        });
    }

    // Editor
    if (editing !== null && form) {
        var omzet = (form.guests || 0) * (form.ppp || 0);
        return (
            <div className="panel">
                <div className="panel-head">
                    <h3>{editing === 'new' ? 'Nieuw Event' : 'Event Bewerken'}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={function () { setEditing(null); setForm(null); }}><i className="fa-solid fa-arrow-left"></i> Terug</button>
                </div>
                <div className="panel-body">
                    {/* Event section */}
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', marginBottom: 12 }}>Eventgegevens</h4>
                    <div className="form-grid">
                        <div className="field full"><label>Event Naam</label><input value={form.name} onChange={function (e) { setField('name', e.target.value); }} /></div>
                        <div className="field"><label>Datum</label><input type="date" value={form.date} onChange={function (e) { setField('date', e.target.value); }} /></div>
                        <div className="field"><label>Locatie</label><input value={form.location} onChange={function (e) { setField('location', e.target.value); }} /></div>
                        <div className="field"><label>Aantal Gasten</label><input type="number" value={form.guests} onChange={function (e) { setField('guests', parseInt(e.target.value) || 0); }} /></div>
                        <div className="field"><label>Prijs per Persoon</label><input type="number" step="0.50" value={form.ppp} onChange={function (e) { setField('ppp', parseFloat(e.target.value) || 0); }} /></div>
                        <div className="field"><label>Type</label>
                            <select value={form.type} onChange={function (e) { setField('type', e.target.value); }}>
                                {['Particulier', 'Zakelijk', 'Festival'].map(function (t) { return <option key={t}>{t}</option>; })}
                            </select>
                        </div>
                        <div className="field"><label>Status</label>
                            <select value={form.status} onChange={function (e) { setField('status', e.target.value); }}>
                                <option value="pending">In afwachting</option>
                                <option value="confirmed">Bevestigd</option>
                                <option value="completed">Voltooid ✓</option>
                            </select>
                        </div>
                    </div>

                    {/* Client section */}
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', marginTop: 28, marginBottom: 12 }}>Klantgegevens</h4>
                    <div className="form-grid">
                        <div className="field"><label>Naam</label><input value={form.client_naam} onChange={function (e) { setField('client_naam', e.target.value); }} /></div>
                        <div className="field"><label>Adres</label><input value={form.client_adres} onChange={function (e) { setField('client_adres', e.target.value); }} /></div>
                        <div className="field"><label>Telefoon</label><input value={form.client_tel} onChange={function (e) { setField('client_tel', e.target.value); }} /></div>
                        <div className="field"><label>Email</label><input type="email" value={form.client_email} onChange={function (e) { setField('client_email', e.target.value); }} /></div>
                    </div>

                    {/* Menu / Recepten Koppeling */}
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', marginTop: 28, marginBottom: 12 }}>
                        <i className="fa-solid fa-utensils" style={{ marginRight: 6 }}></i>Menu (Recepten Koppelen)
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {recepten.length === 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Geen recepten gevonden — maak eerst recepten aan</span>}
                        {recepten.map(function (r) {
                            var isSelected = (form.menu || []).indexOf(r.id) >= 0;
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

                    {/* Notes */}
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', marginTop: 28, marginBottom: 12 }}>Notitie</h4>
                    <div className="field full"><textarea rows={3} value={form.notitie || ''} onChange={function (e) { setField('notitie', e.target.value); }} /></div>

                    {/* Omzet */}
                    <div style={{ marginTop: 20, padding: 16, background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Geschatte omzet: </span>
                        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>{fmt(omzet)}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>({form.guests} × {fmt(form.ppp)})</span>
                    </div>

                    <div className="editor-actions">
                        <button className="btn btn-brand" onClick={saveEvent}><i className="fa-solid fa-save"></i> Opslaan</button>
                        <button className="btn btn-cyan" onClick={createOfferte}><i className="fa-solid fa-file-signature"></i> Offerte Maken</button>
                        {editing !== 'new' && <button className="btn btn-red" onClick={deleteEvent}><i className="fa-solid fa-trash"></i> Verwijderen</button>}
                    </div>
                </div>
            </div>
        );
    }

    // List sorted by date
    var sorted = events.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var monthNames = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>Events ({events.length})</h3>
                <button className="btn btn-brand" onClick={newEvent}><i className="fa-solid fa-plus"></i> Nieuw Event</button>
            </div>
            <div className="panel">
                {events.length === 0 && <div className="empty-state"><i className="fa-solid fa-fire"></i><p>Nog geen events aangemaakt</p><button className="btn btn-brand btn-sm" onClick={newEvent}>Eerste Event Toevoegen</button></div>}
                {sorted.map(function (ev) {
                    var parts = (ev.date || '').split('-');
                    var month = parts[1] ? monthNames[parseInt(parts[1], 10) - 1] : '';
                    var day = parts[2] || '';
                    var omzet = (ev.guests || 0) * (ev.ppp || 0);
                    return (
                        <div key={ev.id} className="ev-row" onClick={function () { editEvent(ev); }}>
                            <div className="ev-date-block">
                                <span className="ev-month">{month}</span>
                                <span className="ev-day">{day}</span>
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, marginBottom: 2 }}>{ev.name}</div>
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                    <i className="fa-solid fa-location-dot" style={{ marginRight: 4 }}></i>{ev.location || '—'}
                                    <span style={{ marginLeft: 12 }}><i className="fa-solid fa-users" style={{ marginRight: 4 }}></i>{ev.guests} gasten</span>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 600 }}>{fmt(omzet)}</div>
                                <span className={'pill ' + (ev.status === 'completed' ? 'pill-green' : ev.status === 'confirmed' ? 'pill-green' : 'pill-amber')}>
                                    {ev.status === 'completed' ? '✓ Voltooid' : ev.status === 'confirmed' ? 'Bevestigd' : 'In afwachting'}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
