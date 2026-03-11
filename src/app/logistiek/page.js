'use client';
import { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';

export default function Logistiek() {
    var { data: rtrItems, insert: insertRtr, update: updateRtr, remove: removeRtr, setData: setRtrItems } = useSupabase('rtr_items', []);
    var { data: packLists, insert: insertPack, update: updatePack, remove: removePack } = useSupabase('pack_lists', []);
    var { data: events } = useSupabase('events', []);
    var { data: offertes, update: updateOfferte } = useSupabase('offertes', []);
    var { data: gerechtenData } = useSupabase('gerechten', []);
    var { data: hardwareStandaard } = useSupabase('hardware_items', []);
    var showToast = useToast();
    var [tab, setTab] = useState('buscheck');
    var [newRtr, setNewRtr] = useState('');
    var [newPackEvent, setNewPackEvent] = useState('');
    var [editingPack, setEditingPack] = useState(null);
    var [newPackItem, setNewPackItem] = useState({ text: '', qty: 1 });
    var [selectedOfferte, setSelectedOfferte] = useState('');

    // ── Bus-Check: berekening ──
    var busOfferte = offertes.find(function (o) { return String(o.id) === selectedOfferte; });
    var busItems = [];
    var busChecked = (busOfferte && busOfferte.bus_check && busOfferte.bus_check.checked) || [];

    if (busOfferte && busOfferte.menu_selectie) {
        var menuSel = typeof busOfferte.menu_selectie === 'string' ? JSON.parse(busOfferte.menu_selectie) : busOfferte.menu_selectie;
        var gasten = busOfferte.aantal_gasten || 0;
        var hwMap = {}; // naam → { totaal, categorie }

        // 1. Hardware van gerechten
        Object.values(menuSel || {}).forEach(function (dishes) {
            (dishes || []).forEach(function (dishName) {
                var dish = gerechtenData.find(function (g) { return g.naam === dishName; });
                if (dish && dish.hardware_items) {
                    (dish.hardware_items || []).forEach(function (hw) {
                        var basis = gasten * (hw.ratio || 1);
                        var buffer = Math.ceil(basis * (hw.buffer_pct || 0) / 100);
                        var totaal = Math.ceil(basis) + buffer + (hw.min_extra || 0);
                        var key = hw.naam;
                        if (hwMap[key]) {
                            hwMap[key].totaal += totaal;
                        } else {
                            hwMap[key] = { naam: hw.naam, totaal: totaal, categorie: hw.categorie || 'servies', bron: 'gerecht' };
                        }
                    });
                }
            });
        });

        // 2. Standaard event hardware
        hardwareStandaard.filter(function (h) { return h.standaard_event; }).forEach(function (h) {
            if (!hwMap[h.naam]) {
                hwMap[h.naam] = { naam: h.naam, totaal: 1, categorie: h.categorie, bron: 'standaard', icoon: h.icoon };
            }
        });

        busItems = Object.values(hwMap);
    }

    var busProgress = busItems.length > 0 ? Math.round((busChecked.length / busItems.length) * 100) : 0;

    function toggleBusItem(naam) {
        if (!busOfferte) return;
        var current = (busOfferte.bus_check && busOfferte.bus_check.checked) || [];
        var next;
        if (current.indexOf(naam) >= 0) {
            next = current.filter(function (n) { return n !== naam; });
        } else {
            next = current.concat([naam]);
        }
        var completedAt = next.length === busItems.length ? new Date().toISOString() : null;
        updateOfferte(busOfferte.id, { bus_check: { checked: next, completed_at: completedAt } });
        if (completedAt) showToast('🚛 Bus is compleet geladen!', 'success');
    }

    // ── RTR ──
    function toggleRtr(item) {
        updateRtr(item.id, { done: !item.done });
    }

    function resetRtr() {
        rtrItems.forEach(function (item) { if (item.done) updateRtr(item.id, { done: false }); });
        showToast('Checklist gereset', 'success');
    }

    function addRtrItem() {
        if (!newRtr) return;
        insertRtr({ text: newRtr, done: false }).then(function () { setNewRtr(''); showToast('Item toegevoegd', 'success'); });
    }

    // ── Paklijsten ──
    function createPackList() {
        if (!newPackEvent) { showToast('Kies een event', 'error'); return; }
        insertPack({ event_id: parseInt(newPackEvent), items: [] }).then(function () {
            showToast('Paklijst aangemaakt', 'success'); setNewPackEvent('');
        });
    }

    function addPackItem(pack) {
        if (!newPackItem.text) return;
        var items = (pack.items || []).concat([{ id: Date.now(), text: newPackItem.text, qty: newPackItem.qty, done: false }]);
        updatePack(pack.id, { items: items }).then(function () { setNewPackItem({ text: '', qty: 1 }); });
    }

    function togglePackItem(pack, itemId) {
        var items = (pack.items || []).map(function (i) { return i.id === itemId ? Object.assign({}, i, { done: !i.done }) : i; });
        updatePack(pack.id, { items: items });
    }

    function removePackItem(pack, itemId) {
        var items = (pack.items || []).filter(function (i) { return i.id !== itemId; });
        updatePack(pack.id, { items: items });
    }

    var catIcoon = { servies: '🍽️', apparatuur: '🔥', branding: '💡', meubilair: '🪑' };

    return (
        <>
            <div className="tab-bar">
                <button className={'tab-btn' + (tab === 'buscheck' ? ' active' : '')} onClick={function () { setTab('buscheck'); }}>🚛 Bus-Check</button>
                <button className={'tab-btn' + (tab === 'rtr' ? ' active' : '')} onClick={function () { setTab('rtr'); }}>📦 RTR Checklist</button>
                <button className={'tab-btn' + (tab === 'pack' ? ' active' : '')} onClick={function () { setTab('pack'); }}>📋 Paklijsten</button>
            </div>

            {/* ═══ BUS-CHECK TAB ═══ */}
            {tab === 'buscheck' && (
                <>
                    <div style={{ marginBottom: 16 }}>
                        <select className="bus-select" value={selectedOfferte} onChange={function (e) { setSelectedOfferte(e.target.value); }}>
                            <option value="">— Kies Offerte / Event —</option>
                            {offertes.filter(function (o) { return o.menu_selectie; }).map(function (o) {
                                return <option key={o.id} value={String(o.id)}>{o.client_naam} — {o.datum} ({o.aantal_gasten} gasten)</option>;
                            })}
                        </select>
                    </div>

                    {busOfferte && (
                        <>
                            {/* Progress bar */}
                            <div className="bus-progress-container">
                                <div className="bus-progress-label">
                                    <span>🚛 Bus is voor <strong>{busProgress}%</strong> geladen</span>
                                    <span className="bus-progress-count">{busChecked.length} / {busItems.length}</span>
                                </div>
                                <div className="bus-progress-bar">
                                    <div className="bus-progress-fill" style={{ width: busProgress + '%' }}></div>
                                </div>
                            </div>

                            {/* Hardware items by category */}
                            {['servies', 'apparatuur', 'branding', 'meubilair'].map(function (cat) {
                                var catItems = busItems.filter(function (i) { return i.categorie === cat; });
                                if (catItems.length === 0) return null;
                                return (
                                    <div key={cat} className="bus-category">
                                        <div className="bus-category-header">
                                            <span>{catIcoon[cat] || '📦'} {cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                                            <span className="bus-category-count">{catItems.filter(function (i) { return busChecked.indexOf(i.naam) >= 0; }).length}/{catItems.length}</span>
                                        </div>
                                        {catItems.map(function (item) {
                                            var checked = busChecked.indexOf(item.naam) >= 0;
                                            return (
                                                <div key={item.naam} className={'bus-check-item' + (checked ? ' checked' : '')} onClick={function () { toggleBusItem(item.naam); }}>
                                                    <div className={'bus-checkbox' + (checked ? ' checked' : '')}>
                                                        {checked && <i className="fa-solid fa-check"></i>}
                                                    </div>
                                                    <div className="bus-item-info">
                                                        <span className="bus-item-name">{item.naam}</span>
                                                        {item.bron === 'gerecht' && <span className="bus-item-qty">×{item.totaal}</span>}
                                                        {item.bron === 'standaard' && <span className="bus-item-badge">STANDAARD</span>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}

                            {busItems.length === 0 && (
                                <div className="empty-state" style={{ marginTop: 24 }}>
                                    <i className="fa-solid fa-box-open"></i>
                                    <p>Geen hardware items gekoppeld aan de gerechten van dit menu</p>
                                    <p style={{ fontSize: 12 }}>Ga naar Gerechten → 🍽️ Hardware per Gast om items toe te voegen</p>
                                </div>
                            )}
                        </>
                    )}

                    {!busOfferte && !selectedOfferte && (
                        <div className="empty-state">
                            <i className="fa-solid fa-truck-loading"></i>
                            <p>Selecteer een offerte om de bus-check te starten</p>
                        </div>
                    )}
                </>
            )}

            {/* ═══ RTR TAB ═══ */}
            {tab === 'rtr' && (
                <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                        <input style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 10, font: '400 14px DM Sans,sans-serif' }}
                            placeholder="Nieuw checklist item..." value={newRtr} onChange={function (e) { setNewRtr(e.target.value); }}
                            onKeyDown={function (e) { if (e.key === 'Enter') addRtrItem(); }} />
                        <button className="btn btn-brand btn-sm" onClick={addRtrItem}><i className="fa-solid fa-plus"></i></button>
                        <button className="btn btn-ghost btn-sm" onClick={resetRtr}><i className="fa-solid fa-rotate-left"></i> Reset</button>
                    </div>
                    <div className="panel">
                        {rtrItems.length === 0 && <div className="empty-state"><i className="fa-solid fa-clipboard-check"></i><p>Geen checklist items</p></div>}
                        {rtrItems.map(function (item) {
                            return (
                                <div key={item.id} className="check-row">
                                    <button className={'check-box' + (item.done ? ' checked' : '')} onClick={function () { toggleRtr(item); }}>
                                        {item.done && <i className="fa-solid fa-check"></i>}
                                    </button>
                                    <span className={'check-text' + (item.done ? ' done' : '')}>{item.text}</span>
                                    <button className="del-btn" onClick={function () { removeRtr(item.id); }}><i className="fa-solid fa-trash"></i></button>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {/* ═══ PAKLIJSTEN TAB ═══ */}
            {tab === 'pack' && (
                <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                        <select style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 10, font: '400 14px DM Sans,sans-serif' }}
                            value={newPackEvent} onChange={function (e) { setNewPackEvent(e.target.value); }}>
                            <option value="">— Kies Event —</option>
                            {events.map(function (ev) { return <option key={ev.id} value={ev.id}>{ev.name}</option>; })}
                        </select>
                        <button className="btn btn-brand btn-sm" onClick={createPackList}><i className="fa-solid fa-plus"></i> Paklijst</button>
                    </div>
                    {packLists.length === 0 && <div className="empty-state"><i className="fa-solid fa-boxes-stacked"></i><p>Nog geen paklijsten</p></div>}
                    {packLists.map(function (pack) {
                        var ev = events.find(function (e) { return e.id === pack.event_id; });
                        var expanded = editingPack === pack.id;
                        return (
                            <div key={pack.id} className="panel" style={{ marginBottom: 12 }}>
                                <div className="panel-head" style={{ cursor: 'pointer' }} onClick={function () { setEditingPack(expanded ? null : pack.id); }}>
                                    <h3><i className="fa-solid fa-box-open" style={{ marginRight: 8, color: 'var(--brand)' }}></i>{ev ? ev.name : 'Onbekend'}</h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{(pack.items || []).length} items</span>
                                        <i className={'fa-solid ' + (expanded ? 'fa-chevron-up' : 'fa-chevron-down')} style={{ color: 'var(--muted)' }}></i>
                                    </div>
                                </div>
                                {expanded && (
                                    <div className="panel-body">
                                        {(pack.items || []).map(function (item) {
                                            return (
                                                <div key={item.id} className="check-row">
                                                    <button className={'check-box' + (item.done ? ' checked' : '')} onClick={function () { togglePackItem(pack, item.id); }}>
                                                        {item.done && <i className="fa-solid fa-check"></i>}
                                                    </button>
                                                    <span className={'check-text' + (item.done ? ' done' : '')}>{item.text}</span>
                                                    <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>×{item.qty}</span>
                                                    <button className="del-btn" onClick={function () { removePackItem(pack, item.id); }}><i className="fa-solid fa-trash"></i></button>
                                                </div>
                                            );
                                        })}
                                        <div style={{ display: 'flex', gap: 8, padding: '12px 0 0' }}>
                                            <input style={{ flex: 2, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, font: '400 13px DM Sans,sans-serif' }}
                                                placeholder="Item..." value={newPackItem.text} onChange={function (e) { setNewPackItem(Object.assign({}, newPackItem, { text: e.target.value })); }} />
                                            <input type="number" style={{ width: 60, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, font: '400 13px DM Sans,sans-serif' }}
                                                value={newPackItem.qty} onChange={function (e) { setNewPackItem(Object.assign({}, newPackItem, { qty: parseInt(e.target.value) || 1 })); }} />
                                            <button className="btn btn-brand btn-sm" onClick={function () { addPackItem(pack); }}><i className="fa-solid fa-plus"></i></button>
                                        </div>
                                        <div style={{ marginTop: 12 }}>
                                            <button className="btn btn-red btn-sm" onClick={function () { removePack(pack.id); }}><i className="fa-solid fa-trash"></i> Lijst Verwijderen</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </>
            )}
        </>
    );
}
