'use client';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';

export default function Inkoop() {
    var { data: leveranciers, insert: insertLev, update: updateLev, remove: removeLev } = useSupabase('leveranciers', []);
    var { data: inkooplijsten, insert: insertInk, update: updateInk, remove: removeInk } = useSupabase('inkooplijsten', []);
    var { data: events } = useSupabase('events', []);
    var showToast = useToast();
    var showConfirm = useConfirm();
    var [tab, setTab] = useState('leveranciers');
    var [editingLev, setEditingLev] = useState(null);
    var [levForm, setLevForm] = useState(null);
    var [expandedInk, setExpandedInk] = useState(null);
    var [newInkEvent, setNewInkEvent] = useState('');
    var [newInkItem, setNewInkItem] = useState({ desc: '', qty: 1, eenheid: 'kg', leverancier: '' });

    // Leverancier CRUD
    function newLeverancier() {
        setEditingLev('new');
        setLevForm({ naam: '', type: 'Overig', contact: '', email: '', tel: '' });
    }
    function editLeverancier(l) { setEditingLev(l.id); setLevForm(JSON.parse(JSON.stringify(l))); }
    function setLevField(key, val) { setLevForm(Object.assign({}, levForm, { [key]: val })); }

    function saveLeverancier() {
        if (!levForm.naam) { showToast('Vul een naam in', 'error'); return; }
        if (editingLev === 'new') {
            insertLev(levForm).then(function () { showToast('Leverancier toegevoegd', 'success'); setEditingLev(null); setLevForm(null); });
        } else {
            var { id, created_at, ...rest } = levForm;
            updateLev(editingLev, rest).then(function () { showToast('Leverancier bijgewerkt', 'success'); setEditingLev(null); setLevForm(null); });
        }
    }

    function deleteLeverancier() {
        showConfirm('Leverancier verwijderen?', function () {
            removeLev(editingLev).then(function () { showToast('Verwijderd', 'success'); setEditingLev(null); setLevForm(null); });
        });
    }

    // Inkooplijst
    function createInkooplijst() {
        if (!newInkEvent) { showToast('Kies een event', 'error'); return; }
        insertInk({ event_id: parseInt(newInkEvent), items: [] }).then(function () { showToast('Inkooplijst aangemaakt', 'success'); setNewInkEvent(''); });
    }

    function addInkItem(list) {
        if (!newInkItem.desc) return;
        var items = (list.items || []).concat([Object.assign({ id: Date.now(), besteld: false }, newInkItem)]);
        updateInk(list.id, { items: items }).then(function () { setNewInkItem({ desc: '', qty: 1, eenheid: 'kg', leverancier: '' }); });
    }

    function toggleInkItem(list, itemId) {
        var items = (list.items || []).map(function (i) { return i.id === itemId ? Object.assign({}, i, { besteld: !i.besteld }) : i; });
        updateInk(list.id, { items: items });
    }

    // Leverancier editor
    if (editingLev !== null && levForm) {
        return (
            <div className="panel">
                <div className="panel-head">
                    <h3>{editingLev === 'new' ? 'Nieuwe Leverancier' : 'Leverancier Bewerken'}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={function () { setEditingLev(null); setLevForm(null); }}><i className="fa-solid fa-arrow-left"></i> Terug</button>
                </div>
                <div className="panel-body">
                    <div className="form-grid">
                        <div className="field"><label>Naam</label><input value={levForm.naam} onChange={function (e) { setLevField('naam', e.target.value); }} /></div>
                        <div className="field"><label>Type</label>
                            <select value={levForm.type} onChange={function (e) { setLevField('type', e.target.value); }}>
                                {['Vlees', 'Groente', 'Dranken', 'Overig'].map(function (t) { return <option key={t}>{t}</option>; })}
                            </select>
                        </div>
                        <div className="field"><label>Contactpersoon</label><input value={levForm.contact} onChange={function (e) { setLevField('contact', e.target.value); }} /></div>
                        <div className="field"><label>Email</label><input value={levForm.email} onChange={function (e) { setLevField('email', e.target.value); }} /></div>
                        <div className="field"><label>Telefoon</label><input value={levForm.tel} onChange={function (e) { setLevField('tel', e.target.value); }} /></div>
                    </div>
                    <div className="editor-actions">
                        <button className="btn btn-brand" onClick={saveLeverancier}><i className="fa-solid fa-save"></i> Opslaan</button>
                        {editingLev !== 'new' && <button className="btn btn-red" onClick={deleteLeverancier}><i className="fa-solid fa-trash"></i> Verwijderen</button>}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="tab-bar">
                <button className={'tab-btn' + (tab === 'leveranciers' ? ' active' : '')} onClick={function () { setTab('leveranciers'); }}>Leveranciers</button>
                <button className={'tab-btn' + (tab === 'inkooplijsten' ? ' active' : '')} onClick={function () { setTab('inkooplijsten'); }}>Inkooplijsten</button>
                <button className={'tab-btn' + (tab === 'bestellingen' ? ' active' : '')} onClick={function () { setTab('bestellingen'); }}>Bestellingen</button>
            </div>

            {tab === 'leveranciers' && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                        <button className="btn btn-brand" onClick={newLeverancier}><i className="fa-solid fa-plus"></i> Nieuwe Leverancier</button>
                    </div>
                    <div className="grid-3">
                        {leveranciers.length === 0 && <div className="empty-state"><i className="fa-solid fa-boxes-stacked"></i><p>Nog geen leveranciers</p></div>}
                        {leveranciers.map(function (l) {
                            var typeColors = { Vlees: 'var(--red)', Groente: 'var(--green)', Dranken: 'var(--amber)', Overig: 'var(--muted)' };
                            return (
                                <div key={l.id} className="rec-card" onClick={function () { editLeverancier(l); }}>
                                    <div className="rec-cat" style={{ color: typeColors[l.type] || 'var(--muted)' }}>{l.type}</div>
                                    <div className="rec-name">{l.naam}</div>
                                    <div className="rec-meta">
                                        {l.contact && <span><i className="fa-solid fa-user"></i> {l.contact}</span>}
                                        {l.tel && <span><i className="fa-solid fa-phone"></i> {l.tel}</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {tab === 'inkooplijsten' && (
                <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                        <select style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 10, font: '400 14px DM Sans,sans-serif' }}
                            value={newInkEvent} onChange={function (e) { setNewInkEvent(e.target.value); }}>
                            <option value="">— Kies Event —</option>
                            {events.map(function (ev) { return <option key={ev.id} value={ev.id}>{ev.name}</option>; })}
                        </select>
                        <button className="btn btn-brand btn-sm" onClick={createInkooplijst}><i className="fa-solid fa-plus"></i> Lijst</button>
                    </div>
                    {inkooplijsten.length === 0 && <div className="empty-state"><i className="fa-solid fa-clipboard-list"></i><p>Nog geen inkooplijsten</p></div>}
                    {inkooplijsten.map(function (list) {
                        var ev = events.find(function (e) { return e.id === list.event_id; });
                        var expanded = expandedInk === list.id;
                        return (
                            <div key={list.id} className="panel" style={{ marginBottom: 12 }}>
                                <div className="panel-head" style={{ cursor: 'pointer' }} onClick={function () { setExpandedInk(expanded ? null : list.id); }}>
                                    <h3>{ev ? ev.name : 'Onbekend Event'}</h3>
                                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{(list.items || []).length} items</span>
                                </div>
                                {expanded && (
                                    <div className="panel-body">
                                        {(list.items || []).map(function (item) {
                                            return (
                                                <div key={item.id} className="check-row">
                                                    <button className={'check-box' + (item.besteld ? ' checked' : '')} onClick={function () { toggleInkItem(list, item.id); }}>
                                                        {item.besteld && <i className="fa-solid fa-check"></i>}
                                                    </button>
                                                    <span className={'check-text' + (item.besteld ? ' done' : '')}>{item.desc}</span>
                                                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{item.qty} {item.eenheid}</span>
                                                </div>
                                            );
                                        })}
                                        <div style={{ display: 'flex', gap: 6, paddingTop: 12, flexWrap: 'wrap' }}>
                                            <input style={{ flex: 2, minWidth: 120, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, font: '400 13px DM Sans,sans-serif' }}
                                                placeholder="Omschrijving" value={newInkItem.desc} onChange={function (e) { setNewInkItem(Object.assign({}, newInkItem, { desc: e.target.value })); }} />
                                            <input type="number" style={{ width: 60, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, font: '400 13px DM Sans,sans-serif' }}
                                                value={newInkItem.qty} onChange={function (e) { setNewInkItem(Object.assign({}, newInkItem, { qty: parseFloat(e.target.value) || 1 })); }} />
                                            <select style={{ width: 70, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px', borderRadius: 8, font: '400 13px DM Sans,sans-serif' }}
                                                value={newInkItem.eenheid} onChange={function (e) { setNewInkItem(Object.assign({}, newInkItem, { eenheid: e.target.value })); }}>
                                                {['kg', 'gram', 'liter', 'stuks', 'doos'].map(function (u) { return <option key={u}>{u}</option>; })}
                                            </select>
                                            <button className="btn btn-brand btn-sm" onClick={function () { addInkItem(list); }}><i className="fa-solid fa-plus"></i></button>
                                        </div>
                                        <div style={{ marginTop: 12 }}>
                                            <button className="btn btn-red btn-sm" onClick={function () { removeInk(list.id); }}><i className="fa-solid fa-trash"></i> Verwijderen</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </>
            )}

            {tab === 'bestellingen' && (
                <div className="panel">
                    <div className="panel-head"><h3>Bestelde Items</h3></div>
                    <div className="panel-body">
                        {(function () {
                            var allItems = [];
                            inkooplijsten.forEach(function (list) {
                                var ev = events.find(function (e) { return e.id === list.event_id; });
                                (list.items || []).forEach(function (item) {
                                    if (item.besteld) allItems.push(Object.assign({}, item, { eventName: ev ? ev.name : 'Onbekend' }));
                                });
                            });
                            if (allItems.length === 0) return <div className="empty-state"><i className="fa-solid fa-cart-shopping"></i><p>Nog geen bestelde items</p></div>;
                            return allItems.map(function (item, idx) {
                                return (
                                    <div key={idx} className="check-row">
                                        <i className="fa-solid fa-check-circle" style={{ color: 'var(--green)' }}></i>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600 }}>{item.desc}</div>
                                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{item.qty} {item.eenheid} — {item.eventName}</div>
                                        </div>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                </div>
            )}
        </>
    );
}
