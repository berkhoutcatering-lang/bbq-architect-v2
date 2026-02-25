'use client';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';

export default function Logistiek() {
    var { data: rtrItems, insert: insertRtr, update: updateRtr, remove: removeRtr, setData: setRtrItems } = useSupabase('rtr_items', []);
    var { data: packLists, insert: insertPack, update: updatePack, remove: removePack } = useSupabase('pack_lists', []);
    var { data: events } = useSupabase('events', []);
    var showToast = useToast();
    var [tab, setTab] = useState('rtr');
    var [newRtr, setNewRtr] = useState('');
    var [newPackEvent, setNewPackEvent] = useState('');
    var [editingPack, setEditingPack] = useState(null);
    var [newPackItem, setNewPackItem] = useState({ text: '', qty: 1 });

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

    return (
        <>
            <div className="tab-bar">
                <button className={'tab-btn' + (tab === 'rtr' ? ' active' : '')} onClick={function () { setTab('rtr'); }}>RTR Checklist</button>
                <button className={'tab-btn' + (tab === 'pack' ? ' active' : '')} onClick={function () { setTab('pack'); }}>Paklijsten</button>
            </div>

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
