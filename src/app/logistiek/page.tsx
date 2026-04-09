/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import PageHint from '@/components/PageHint';
import MetallicCard from '@/components/MetallicCard';
import type { RtrItem, PackList, DbEvent, Offerte, Gerecht } from '@/types';
import { Check, ChevronDown, ChevronUp, ClipboardCheck, Loader2, Package, PackageOpen, Plus, RotateCcw, Trash2, Truck } from 'lucide-react';

interface HardwareItem {
    id: number;
    naam: string;
    categorie: string;
    standaard_event: boolean;
    icoon?: string;
}

interface BusItem {
    naam: string;
    totaal: number;
    categorie: string;
    bron: string;
    icoon?: string;
}

interface NewPackItem {
    text: string;
    qty: number;
}

export default function Logistiek() {
    const { data: rtrItems, insert: insertRtr, update: updateRtr, remove: removeRtr, setData: setRtrItems } = useSupabase<RtrItem>('rtr_items', []);
    const { data: packLists, insert: insertPack, update: updatePack, remove: removePack } = useSupabase<PackList>('pack_lists', []);
    const { data: events, loading } = useSupabase<DbEvent>('events', []);
    const { data: offertes, update: updateOfferte } = useSupabase<Offerte>('offertes', []);
    const { data: gerechtenData } = useSupabase<Gerecht>('gerechten', []);
    const { data: hardwareStandaard } = useSupabase<HardwareItem>('hardware_items', []);
    const showToast = useToast();
    const [tab, setTab] = useState('buscheck');
    const [newRtr, setNewRtr] = useState('');
    const [newPackEvent, setNewPackEvent] = useState('');
    const [editingPack, setEditingPack] = useState<number | null>(null);
    const [newPackItem, setNewPackItem] = useState<NewPackItem>({ text: '', qty: 1 });
    const [selectedOfferte, setSelectedOfferte] = useState('');

    const busOfferte: any = offertes.find(function (o: any) { return String(o.id) === selectedOfferte; });
    let busItems: BusItem[] = [];
    const busChecked: string[] = (busOfferte && busOfferte.bus_check && busOfferte.bus_check.checked) || [];

    if (busOfferte && busOfferte.menu_selectie) {
        const menuSel: Record<string, string[]> = typeof busOfferte.menu_selectie === 'string' ? JSON.parse(busOfferte.menu_selectie) : busOfferte.menu_selectie;
        const gasten = busOfferte.aantal_gasten || 0;
        const hwMap: Record<string, BusItem> = {};

        Object.values(menuSel || {}).forEach(function (dishes: any) {
            (dishes || []).forEach(function (dishName: string) {
                const dish: any = gerechtenData.find(function (g: any) { return g.naam === dishName; });
                if (dish && dish.hardware_items) {
                    (dish.hardware_items || []).forEach(function (hw: any) {
                        const basis = gasten * (hw.ratio || 1);
                        const buffer = Math.ceil(basis * (hw.buffer_pct || 0) / 100);
                        const totaal = Math.ceil(basis) + buffer + (hw.min_extra || 0);
                        const key = hw.naam;
                        if (hwMap[key]) {
                            hwMap[key].totaal += totaal;
                        } else {
                            hwMap[key] = { naam: hw.naam, totaal: totaal, categorie: hw.categorie || 'servies', bron: 'gerecht' };
                        }
                    });
                }
            });
        });

        hardwareStandaard.filter(function (h: any) { return h.standaard_event; }).forEach(function (h: any) {
            if (!hwMap[h.naam]) {
                hwMap[h.naam] = { naam: h.naam, totaal: 1, categorie: h.categorie, bron: 'standaard', icoon: h.icoon };
            }
        });

        busItems = Object.values(hwMap);
    }

    const busProgress = busItems.length > 0 ? Math.round((busChecked.length / busItems.length) * 100) : 0;

    function toggleBusItem(naam: string) {
        if (!busOfferte) return;
        const current: string[] = (busOfferte.bus_check && busOfferte.bus_check.checked) || [];
        let next: string[];
        if (current.indexOf(naam) >= 0) {
            next = current.filter(function (n: string) { return n !== naam; });
        } else {
            next = current.concat([naam]);
        }
        const completedAt = next.length === busItems.length ? new Date().toISOString() : null;
        updateOfferte(busOfferte.id, { bus_check: { checked: next, completed_at: completedAt } } as any);
        if (completedAt) showToast('\ud83d\ude9b Bus is compleet geladen!', 'success');
    }

    function toggleRtr(item: any) {
        updateRtr(item.id, { done: !item.done } as any);
    }

    function resetRtr() {
        rtrItems.forEach(function (item: any) { if (item.done) updateRtr(item.id, { done: false } as any); });
        showToast('Checklist gereset', 'success');
    }

    function addRtrItem() {
        if (!newRtr) return;
        insertRtr({ text: newRtr, done: false } as any).then(function () { setNewRtr(''); showToast('Item toegevoegd', 'success'); }).catch(function(err: any) { showToast('Fout: ' + (err.message || 'onbekend'), 'error'); });
    }

    function createPackList() {
        if (!newPackEvent) { showToast('Kies een event', 'error'); return; }
        insertPack({ event_id: parseInt(newPackEvent), items: [] } as any).then(function () {
            showToast('Paklijst aangemaakt', 'success'); setNewPackEvent('');
        }).catch(function(err: any) { showToast('Fout: ' + (err.message || 'onbekend'), 'error'); });
    }

    function addPackItem(pack: any) {
        if (!newPackItem.text) return;
        const items = (pack.items || []).concat([{ id: Date.now(), text: newPackItem.text, qty: newPackItem.qty, done: false }]);
        updatePack(pack.id, { items: items } as any).then(function () { setNewPackItem({ text: '', qty: 1 }); }).catch(function(err: any) { showToast('Fout: ' + (err.message || 'onbekend'), 'error'); });
    }

    function togglePackItem(pack: any, itemId: number) {
        const items = (pack.items || []).map(function (i: any) { return i.id === itemId ? Object.assign({}, i, { done: !i.done }) : i; });
        updatePack(pack.id, { items: items } as any);
    }

    function removePackItem(pack: any, itemId: number) {
        const items = (pack.items || []).filter(function (i: any) { return i.id !== itemId; });
        updatePack(pack.id, { items: items } as any);
    }

    const catIcoon: Record<string, string> = { servies: '\ud83c\udf7d\ufe0f', apparatuur: '\ud83d\udd25', branding: '\ud83d\udca1', meubilair: '\ud83e\ude91' };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
            <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
                <Loader2 size={32} className="animate-spin" style={{ marginBottom: 12, display: 'block' }} />
                Laden...
            </div>
        </div>
    );

    return (
        <>
            <div className="tab-bar">
                <button className={'tab-btn' + (tab === 'buscheck' ? ' active' : '')} onClick={function () { setTab('buscheck'); }}>🚛 Bus-Check</button>
                <button className={'tab-btn' + (tab === 'rtr' ? ' active' : '')} onClick={function () { setTab('rtr'); }}>📦 RTR Checklist</button>
                <button className={'tab-btn' + (tab === 'pack' ? ' active' : '')} onClick={function () { setTab('pack'); }}>📋 Paklijsten</button>
            </div>

            <PageHint id="logistiek" title="Logistiek" description="Plan transport en check je materiaallijsten voor events. Gebruik de RTR-checklist voor vertrek." />

            {tab === 'buscheck' && (
                <>
                    <div style={{ marginBottom: 16 }}>
                        <select className="bus-select" value={selectedOfferte} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setSelectedOfferte(e.target.value); }}>
                            <option value="">— Kies Offerte / Event —</option>
                            {offertes.filter(function (o: any) { return o.menu_selectie; }).map(function (o: any) {
                                return <option key={o.id} value={String(o.id)}>{o.client_naam} — {o.datum} ({o.aantal_gasten} gasten)</option>;
                            })}
                        </select>
                    </div>

                    {busOfferte && (
                        <>
                            <div className="bus-progress-container">
                                <div className="bus-progress-label">
                                    <span>🚛 Bus is voor <strong>{busProgress}%</strong> geladen</span>
                                    <span className="bus-progress-count">{busChecked.length} / {busItems.length}</span>
                                </div>
                                <div className="bus-progress-bar">
                                    <div className="bus-progress-fill" style={{ width: busProgress + '%' }}></div>
                                </div>
                            </div>

                            {['servies', 'apparatuur', 'branding', 'meubilair'].map(function (cat) {
                                const catItems = busItems.filter(function (i) { return i.categorie === cat; });
                                if (catItems.length === 0) return null;
                                return (
                                    <div key={cat} className="bus-category">
                                        <div className="bus-category-header">
                                            <span>{catIcoon[cat] || '📦'} {cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                                            <span className="bus-category-count">{catItems.filter(function (i) { return busChecked.indexOf(i.naam) >= 0; }).length}/{catItems.length}</span>
                                        </div>
                                        {catItems.map(function (item) {
                                            const checked = busChecked.indexOf(item.naam) >= 0;
                                            return (
                                                <div key={item.naam} className={'bus-check-item' + (checked ? ' checked' : '')} onClick={function () { toggleBusItem(item.naam); }}>
                                                    <div className={'bus-checkbox' + (checked ? ' checked' : '')}>
                                                        {checked && <Check size={14} />}
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
                                    <PackageOpen size={14} />
                                    <p>Geen hardware items gekoppeld aan de gerechten van dit menu</p>
                                    <p style={{ fontSize: 12 }}>Ga naar Gerechten → 🍽️ Hardware per Gast om items toe te voegen</p>
                                </div>
                            )}
                        </>
                    )}

                    {!busOfferte && !selectedOfferte && (
                        <div className="empty-state">
                            <Truck size={14} />
                            <p>Selecteer een offerte om de bus-check te starten</p>
                        </div>
                    )}
                </>
            )}

            {tab === 'rtr' && (
                <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                        <input style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 10, font: '400 14px DM Sans,sans-serif' }}
                            placeholder="Nieuw checklist item..." value={newRtr} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setNewRtr(e.target.value); }}
                            onKeyDown={function (e: React.KeyboardEvent) { if (e.key === 'Enter') addRtrItem(); }} />
                        <button className="btn btn-brand btn-sm" onClick={addRtrItem} aria-label="Toevoegen"><Plus size={14} /></button>
                        <button className="btn btn-ghost btn-sm" onClick={resetRtr}><RotateCcw size={14} /> Reset</button>
                    </div>
                    <MetallicCard hover={false}>
                        {rtrItems.length === 0 && <div className="empty-state"><ClipboardCheck size={14} /><p>Geen checklist items</p></div>}
                        {rtrItems.map(function (item: any) {
                            return (
                                <div key={item.id} className="check-row">
                                    <button className={'check-box' + (item.done ? ' checked' : '')} onClick={function () { toggleRtr(item); }}>
                                        {item.done && <Check size={14} />}
                                    </button>
                                    <span className={'check-text' + (item.done ? ' done' : '')}>{item.text}</span>
                                    <button className="del-btn" onClick={function () { removeRtr(item.id); }} aria-label="Verwijderen"><Trash2 size={14} /></button>
                                </div>
                            );
                        })}
                    </MetallicCard>
                </>
            )}

            {tab === 'pack' && (
                <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                        <select style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 10, font: '400 14px DM Sans,sans-serif' }}
                            value={newPackEvent} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setNewPackEvent(e.target.value); }}>
                            <option value="">— Kies Event —</option>
                            {events.map(function (ev: any) { return <option key={ev.id} value={ev.id}>{ev.name}</option>; })}
                        </select>
                        <button className="btn btn-brand btn-sm" onClick={createPackList}><Plus size={14} /> Paklijst</button>
                    </div>
                    {packLists.length === 0 && <div className="empty-state"><Package size={14} /><p>Nog geen paklijsten</p></div>}
                    {packLists.map(function (pack: any) {
                        const ev = events.find(function (e: any) { return e.id === pack.event_id; });
                        const expanded = editingPack === pack.id;
                        return (
                            <MetallicCard key={pack.id} hover={false} className="mb-3">
                                <div className="panel-head" style={{ cursor: 'pointer' }} onClick={function () { setEditingPack(expanded ? null : pack.id); }}>
                                    <h3><PackageOpen size={14} className="mr-1.5" style={{ color: 'var(--brand)' }} />{ev ? (ev as any).name : 'Onbekend'}</h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{(pack.items || []).length} items</span>
                                        {expanded ? <ChevronUp style={{ color: 'var(--muted)' }} size={14} /> : <ChevronDown style={{ color: 'var(--muted)' }} size={14} />}
                                    </div>
                                </div>
                                {expanded && (
                                    <div className="panel-body">
                                        {(pack.items || []).map(function (item: any) {
                                            return (
                                                <div key={item.id} className="check-row">
                                                    <button className={'check-box' + (item.done ? ' checked' : '')} onClick={function () { togglePackItem(pack, item.id); }}>
                                                        {item.done && <Check size={14} />}
                                                    </button>
                                                    <span className={'check-text' + (item.done ? ' done' : '')}>{item.text}</span>
                                                    <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>×{item.qty}</span>
                                                    <button className="del-btn" onClick={function () { removePackItem(pack, item.id); }} aria-label="Verwijderen"><Trash2 size={14} /></button>
                                                </div>
                                            );
                                        })}
                                        <div style={{ display: 'flex', gap: 8, padding: '12px 0 0' }}>
                                            <input style={{ flex: 2, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, font: '400 13px DM Sans,sans-serif' }}
                                                placeholder="Item..." value={newPackItem.text} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setNewPackItem(Object.assign({}, newPackItem, { text: e.target.value })); }} />
                                            <input type="number" style={{ width: 60, minWidth: 50, flex: '0 0 auto', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, font: '400 13px DM Sans,sans-serif' }}
                                                value={newPackItem.qty} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setNewPackItem(Object.assign({}, newPackItem, { qty: parseInt(e.target.value) || 1 })); }} />
                                            <button className="btn btn-brand btn-sm" onClick={function () { addPackItem(pack); }} aria-label="Toevoegen"><Plus size={14} /></button>
                                        </div>
                                        <div style={{ marginTop: 12 }}>
                                            <button className="btn btn-red btn-sm" onClick={function () { removePack(pack.id); }}><Trash2 size={14} /> Lijst Verwijderen</button>
                                        </div>
                                    </div>
                                )}
                            </MetallicCard>
                        );
                    })}
                </>
            )}
        </>
    );
}
