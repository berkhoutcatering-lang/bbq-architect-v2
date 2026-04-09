/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { fmt } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import EmptyState from '@/components/EmptyState';
import PageHint from '@/components/PageHint';
import BarcodeScanner from '@/components/BarcodeScanner';
import { ArrowLeft, Link as LinkIcon, Utensils, Save, Trash2, ShoppingCart, Barcode, Plus, Package, AlertTriangle, Coins, PieChart as PieChartIcon, Boxes, Warehouse, CheckCircle } from 'lucide-react';
import type { InventoryItem, Recept } from '@/types';

const CATEGORIEEN = ['Alles', 'Vlees', 'Vis', 'Groenten', 'Zuivel', 'Kruiden', 'Sauzen', 'Dranken', 'Overig'];
const EENHEDEN = ['kg', 'g', 'L', 'ml', 'stuks', 'bos', 'pot', 'fles', 'zak'];

export default function Voorraad() {
    const { data: inventory, insert, update, remove } = useSupabase<InventoryItem>('inventory', []);
    const { data: recepten } = useSupabase<Recept>('recepten', []);
    const showToast = useToast();
    const showConfirm = useConfirm();
    const [editing, setEditing] = useState<number | string | null>(null);
    const [form, setForm] = useState<any>(null);
    const [filter, setFilter] = useState('Alles');
    const [showInkooplijst, setShowInkooplijst] = useState(false);
    const [search, setSearch] = useState('');
    const [scannerOpen, setScannerOpen] = useState(false);
    const [highlightId, setHighlightId] = useState<number | null>(null);

    const filtered = inventory.filter(function (item: any) {
        const matchCat = filter === 'Alles' || item.categorie === filter;
        const matchSearch = !search || (item.naam || '').toLowerCase().indexOf(search.toLowerCase()) >= 0;
        return matchCat && matchSearch;
    });

    const totalItems = inventory.length;
    const lowStock = inventory.filter(function (i: any) { return i.current_stock < i.min_stock; });
    let totalValue = 0;
    inventory.forEach(function (i: any) { totalValue += (i.current_stock || 0) * (i.purchase_price || 0); });

    const catKleuren: Record<string, string> = { Vlees: '#ef4444', Vis: '#3b82f6', Groenten: '#22c55e', Zuivel: '#f59e0b', Kruiden: '#a78bfa', Sauzen: '#f97316', Dranken: '#06b6d4', Overig: '#71717a' };
    const catData = CATEGORIEEN.filter(function (c) { return c !== 'Alles'; }).map(function (cat) {
        const items = inventory.filter(function (i: any) { return i.categorie === cat; });
        const waarde = items.reduce(function (s: number, i: any) { return s + (i.current_stock || 0) * (i.purchase_price || 0); }, 0);
        return { naam: cat, items: items.length, waarde: Math.round(waarde), color: catKleuren[cat] || '#71717a' };
    }).filter(function (d) { return d.items > 0; });

    function newItem() {
        setEditing('new');
        setForm({ naam: '', categorie: 'Vlees', current_stock: 0, min_stock: 0, unit: 'kg', purchase_price: 0, supplier: '', yield_factor: 1.0 });
    }

    function editItem(item: any) { setEditing(item.id); setForm(JSON.parse(JSON.stringify(item))); }
    function setField(key: string, val: any) { setForm(Object.assign({}, form, { [key]: val })); }

    function saveItem() {
        if (!form.naam) { showToast('Vul een naam in', 'error'); return; }
        if (editing === 'new') {
            insert(form).then(function () { showToast('Item toegevoegd aan voorraad \ud83d\udce6', 'success'); setEditing(null); setForm(null); });
        } else {
            const { id, created_at, ...rest } = form;
            update(editing as number, rest).then(function () { showToast('Voorraad bijgewerkt', 'success'); setEditing(null); setForm(null); });
        }
    }

    function deleteItem() {
        showConfirm('Dit item verwijderen uit de voorraad?', function () {
            remove(editing as number).then(function () { showToast('Item verwijderd', 'success'); setEditing(null); setForm(null); });
        });
    }

    function recipesUsingItem(itemNaam: string): any[] {
        return (recepten || []).filter(function (r: any) {
            return (r.ingredienten || []).some(function (ing: any) {
                return ing.naam && ing.naam.toLowerCase().indexOf(itemNaam.toLowerCase()) >= 0;
            });
        });
    }

    function quickAdjust(item: any, amount: number) {
        const newStock = Math.max(0, (item.current_stock || 0) + amount);
        update(item.id, { current_stock: newStock } as any).then(function () {
            showToast(item.naam + ': ' + newStock + ' ' + item.unit, 'success');
        });
    }

    function handleBarcodeScan(barcode: string) {
        setScannerOpen(false);
        const match = inventory.find(function (item: any) {
            const nameMatch = (item.naam || '').toLowerCase().indexOf(barcode.toLowerCase()) >= 0;
            const eanMatch = (item.ean || '').toString() === barcode;
            return nameMatch || eanMatch;
        });
        if (match) {
            setFilter('Alles');
            setSearch('');
            setHighlightId((match as any).id);
            showToast('Gevonden: ' + (match as any).naam, 'success');
            setTimeout(function () { setHighlightId(null); }, 3000);
        } else {
            showToast('Product niet gevonden \u2014 voeg handmatig toe', 'error');
        }
    }

    if (editing !== null && form) {
        const usedIn = editing !== 'new' ? recipesUsingItem(form.naam) : [];
        const stockValue = (form.current_stock || 0) * (form.purchase_price || 0);
        const isLow = form.current_stock < form.min_stock;
        return (
            <div className="panel inv-glass">
                <div className="panel-head">
                    <h3>{editing === 'new' ? '\ud83d\udce6 Nieuw Voorraad Item' : '\u270f\ufe0f ' + form.naam}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={function () { setEditing(null); setForm(null); }}>
                        <ArrowLeft size={16} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} /> Terug
                    </button>
                </div>
                <div className="panel-body">
                    <div className="form-grid">
                        <div className="field full"><label>Naam</label>
                            <input value={form.naam} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('naam', e.target.value); }} placeholder="bijv. Pulled Pork, BBQ Saus..." /></div>
                        <div className="field"><label>Categorie</label>
                            <select value={form.categorie} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setField('categorie', e.target.value); }}>
                                {CATEGORIEEN.filter(function (c) { return c !== 'Alles'; }).map(function (c) { return <option key={c}>{c}</option>; })}
                            </select></div>
                        <div className="field"><label>Eenheid</label>
                            <select value={form.unit} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setField('unit', e.target.value); }}>
                                {EENHEDEN.map(function (u) { return <option key={u}>{u}</option>; })}
                            </select></div>
                        <div className="field"><label>Huidige Voorraad</label>
                            <input type="number" step="0.1" value={form.current_stock} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('current_stock', parseFloat(e.target.value) || 0); }} /></div>
                        <div className="field"><label>Minimale Voorraad (par-level)</label>
                            <input type="number" step="0.1" value={form.min_stock} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('min_stock', parseFloat(e.target.value) || 0); }} /></div>
                        <div className="field"><label>Inkoopprijs per {form.unit}</label>
                            <input type="number" step="0.01" value={form.purchase_price} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('purchase_price', parseFloat(e.target.value) || 0); }} /></div>
                        <div className="field"><label>Yield Factor <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>(bereidingsverlies, bijv. 0.85 = 15% krimp)</span></label>
                            <input type="number" step="0.05" min="0.1" max="1" value={form.yield_factor != null ? form.yield_factor : 1.0} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('yield_factor', parseFloat(e.target.value) || 1.0); }} /></div>
                        <div className="field"><label>Leverancier</label>
                            <input value={form.supplier} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('supplier', e.target.value); }} placeholder="bijv. Sligro, Hanos..." /></div>
                    </div>

                    <div style={{ marginTop: 20, padding: 16, borderRadius: 14, border: '1px solid var(--border)', background: isLow ? 'rgba(239,68,68,.06)' : 'var(--bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Voorraadwaarde</div>
                            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--brand)', marginTop: 4 }}>{fmt(stockValue)}</div>
                        </div>
                        {isLow && <span className="pill pill-red" style={{ fontSize: 12 }}>⚠ Onder par-level!</span>}
                    </div>

                    {usedIn.length > 0 && (
                        <div style={{ marginTop: 20 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                                <LinkIcon size={14} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }} /> Profit-Guard — Gebruikt in {usedIn.length} recept(en)
                            </div>
                            {usedIn.map(function (r: any) {
                                const ing = (r.ingredienten || []).find(function (i: any) { return i.naam && i.naam.toLowerCase().indexOf(form.naam.toLowerCase()) >= 0; });
                                let unitFactor = 1;
                                if (ing && ing.eenheid === 'gram' && form.unit === 'kg') unitFactor = 0.001;
                                if (ing && ing.eenheid === 'ml' && form.unit === 'L') unitFactor = 0.001;
                                const costContrib = (parseFloat(ing ? ing.hoeveelheid : 0) || 0) * unitFactor * (form.purchase_price || 0);
                                const perPortie = r.porties ? costContrib / r.porties : 0;
                                return (
                                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: 'rgba(167,139,250,.06)', border: '1px solid rgba(167,139,250,.15)', borderRadius: 10, marginBottom: 6 }}>
                                        <Utensils size={14} style={{ color: 'var(--purple)' }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 700, fontSize: 12 }}>{r.naam}</div>
                                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.porties} porties · {ing ? ing.hoeveelheid + ' ' + (ing.eenheid || '') : ''}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand)' }}>{fmt(costContrib)}</div>
                                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{fmt(perPortie)}/portie</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="editor-actions">
                        <button className="btn btn-brand" onClick={saveItem}><Save size={16} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} /> Opslaan</button>
                        {editing !== 'new' && <button className="btn btn-red" onClick={deleteItem}><Trash2 size={16} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} /> Verwijderen</button>}
                    </div>
                </div>
            </div>
        );
    }

    if (showInkooplijst) {
        const tekorten = lowStock.map(function (item: any) {
            const tekort = (item.min_stock || 0) - (item.current_stock || 0);
            const kosten = tekort * (item.purchase_price || 0);
            return { item: item, tekort: tekort, kosten: kosten };
        });
        let totaalInkoop = 0;
        tekorten.forEach(function (t) { totaalInkoop += t.kosten; });

        return (
            <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                    <h1 style={{ fontSize: 20, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ShoppingCart size={20} style={{ color: 'var(--brand)' }} /> Inkooplijst
                    </h1>
                    <button className="btn btn-ghost btn-sm" onClick={function () { setShowInkooplijst(false); }}>
                        <ArrowLeft size={16} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} /> Terug
                    </button>
                </div>

                {tekorten.length === 0 && (
                    <div className="empty-state"><CheckCircle size={24} style={{ color: 'var(--green)' }} /><p>Alle voorraad is op niveau! 🎉</p></div>
                )}

                {tekorten.length > 0 && (
                    <div className="panel inv-glass">
                        <div className="panel-head">
                            <h3>{tekorten.length} items bestellen</h3>
                            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--brand)' }}>{fmt(totaalInkoop)}</div>
                        </div>
                        <div style={{ padding: 0 }} className="tbl-wrap">
                            <table className="tbl">
                                <thead><tr>
                                    <th>Item</th><th>Voorraad</th><th>Par-Level</th><th>Tekort</th><th>Prijs</th><th>Kosten</th><th>Leverancier</th>
                                </tr></thead>
                                <tbody>
                                    {tekorten.map(function (t) {
                                        return (
                                            <tr key={t.item.id}>
                                                <td style={{ fontWeight: 700 }}>{t.item.naam}</td>
                                                <td><span className="pill pill-red">{parseFloat(Number(t.item.current_stock).toFixed(2))} {t.item.unit}</span></td>
                                                <td>{t.item.min_stock} {t.item.unit}</td>
                                                <td style={{ fontWeight: 800, color: 'var(--red)' }}>+{t.tekort.toFixed(1)} {t.item.unit}</td>
                                                <td>{fmt(t.item.purchase_price)}/{t.item.unit}</td>
                                                <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{fmt(t.kosten)}</td>
                                                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{t.item.supplier || '\u2014'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </>
        );
    }

    return (
        <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div>
                    <h1 style={{ fontSize: 20, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Warehouse size={20} style={{ color: 'var(--brand)' }} /> Smart Inventory
                    </h1>
                    <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 3 }}>
                        {totalItems} items · {lowStock.length} bestellen · Waarde: {fmt(totalValue)}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className={'btn btn-sm ' + (lowStock.length > 0 ? 'btn-red' : 'btn-ghost')} onClick={function () { setShowInkooplijst(true); }}>
                        <ShoppingCart size={16} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} /> Inkooplijst {lowStock.length > 0 && '(' + lowStock.length + ')'}
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={function () { setScannerOpen(true); }}>
                        <Barcode size={16} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} /> Scan
                    </button>
                    <button className="btn btn-brand btn-sm" onClick={newItem}>
                        <Plus size={16} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} /> Item Toevoegen
                    </button>
                </div>
            </div>

            <PageHint id="voorraad" title="Smart Inventory" description="Houd je voorraad bij met par-levels. Items onder minimum worden automatisch gemarkeerd. Gebruik +1/-1 voor snelle aanpassing." />

            <div className="stat-grid mb-24">
                <div className="stat-card inv-glass">
                    <div className="stat-icon" style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}><Boxes size={20} /></div>
                    <div className="stat-val">{totalItems}</div>
                    <div className="stat-label">Items in Voorraad</div>
                </div>
                <div className={'stat-card inv-glass' + (lowStock.length > 0 ? ' inv-low-pulse' : '')}>
                    <div className="stat-icon" style={{ background: 'rgba(239,68,68,.12)', color: 'var(--red)' }}><AlertTriangle size={20} /></div>
                    <div className="stat-val" style={{ color: lowStock.length > 0 ? 'var(--red)' : 'var(--text)' }}>{lowStock.length}</div>
                    <div className="stat-label">Onder Par-Level</div>
                </div>
                <div className="stat-card inv-glass">
                    <div className="stat-icon" style={{ background: 'rgba(34,197,94,.12)', color: 'var(--green)' }}><Coins size={20} /></div>
                    <div className="stat-val" style={{ fontSize: 20 }}>{fmt(totalValue)}</div>
                    <div className="stat-label">Voorraadwaarde</div>
                </div>
            </div>

            {catData.length > 1 && (
                <div className="analytics-grid mb-24">
                    <div className="panel inv-glass">
                        <div className="panel-head">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <PieChartIcon size={14} style={{ color: 'var(--brand)' }} /> Waarde per Categorie
                            </h3>
                        </div>
                        <div style={{ height: 160, marginTop: 12 }}>
                            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                <PieChart>
                                    <Pie data={catData} dataKey="waarde" nameKey="naam" cx="45%" cy="50%" innerRadius={38} outerRadius={62} paddingAngle={3}>
                                        {catData.map(function (d, i) { return <Cell key={i} fill={d.color} />; })}
                                    </Pie>
                                    <Tooltip formatter={function (v: any, n: any) { return ['\u20ac' + v.toLocaleString('nl-NL'), n]; }} contentStyle={{ background: '#18181b', border: '1px solid rgba(255,191,0,.15)', borderRadius: 8, fontSize: 12 }} />
                                    <Legend iconSize={8} wrapperStyle={{ fontSize: 12, color: '#71717a' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="panel inv-glass">
                        <div className="panel-head">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Boxes size={14} style={{ color: 'var(--purple)' }} /> Items per Categorie
                            </h3>
                        </div>
                        <div style={{ height: 160, marginTop: 12 }}>
                            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                <BarChart data={catData} layout="vertical" margin={{ top: 4, right: 8, left: 56, bottom: 4 }} barCategoryGap="25%">
                                    <XAxis type="number" tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                    <YAxis type="category" dataKey="naam" tick={{ fill: '#f4f4f5', fontSize: 12 }} axisLine={false} tickLine={false} width={52} />
                                    <Tooltip formatter={function (v: any) { return [v + ' items', 'Aantal']; }} contentStyle={{ background: '#18181b', border: '1px solid rgba(255,191,0,.15)', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'rgba(255,191,0,.06)' }} />
                                    <Bar dataKey="items" radius={[0, 4, 4, 0]}>
                                        {catData.map(function (d, i) { return <Cell key={i} fill={d.color} />; })}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
                    {CATEGORIEEN.map(function (c) {
                        return <button key={c} className={'btn btn-sm ' + (filter === c ? 'btn-brand' : 'btn-ghost')} onClick={function () { setFilter(c); }}>{c}</button>;
                    })}
                </div>
                <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
                    <input value={search} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setSearch(e.target.value); }} placeholder="🔍 Zoek item..." style={{ padding: '10px 14px', fontSize: 14 }} />
                </div>
            </div>

            {filtered.length === 0 && (
                <EmptyState page="/voorraad" onAction={newItem} />
            )}

            {filtered.length > 0 && (
                <div className="panel inv-glass" style={{ overflow: 'hidden' }}>
                    <div className="tbl-wrap">
                    <table className="tbl">
                        <thead><tr>
                            <th>Item</th><th>Voorraad</th><th>Par-Level</th><th>Prijs</th><th>Waarde</th><th>Leverancier</th><th style={{ width: 100 }}></th>
                        </tr></thead>
                        <tbody>
                            {filtered.map(function (item: any) {
                                const isLow = item.current_stock < item.min_stock;
                                const value = (item.current_stock || 0) * (item.purchase_price || 0);
                                const pct = item.min_stock > 0 ? Math.min(100, (item.current_stock / item.min_stock) * 100) : 100;
                                return (
                                    <tr key={item.id} className={isLow ? 'inv-low-row' : ''} style={{ cursor: 'pointer', background: highlightId === item.id ? 'rgba(255,191,0,.12)' : undefined, transition: 'background 0.4s' }} onClick={function () { editItem(item); }}>
                                        <td>
                                            <div style={{ fontWeight: 700 }}>{item.naam}</div>
                                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{item.categorie}</div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ width: 60, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                                                    <div style={{ width: pct + '%', height: '100%', borderRadius: 3, background: isLow ? 'var(--red)' : pct < 50 ? 'var(--amber)' : 'var(--green)', transition: 'width .3s' }}></div>
                                                </div>
                                                <span style={{ fontWeight: 700, color: isLow ? 'var(--red)' : 'var(--text)', fontSize: 13 }}>{parseFloat(Number(item.current_stock).toFixed(2))}</span>
                                                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{item.unit}</span>
                                            </div>
                                        </td>
                                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{item.min_stock} {item.unit}</td>
                                        <td style={{ fontSize: 12 }}>{fmt(item.purchase_price)}/{item.unit}</td>
                                        <td style={{ fontWeight: 600, color: 'var(--brand)', fontSize: 12 }}>{fmt(value)}</td>
                                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{item.supplier || '\u2014'}</td>
                                        <td onClick={function (e: React.MouseEvent) { e.stopPropagation(); }}>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button className="btn btn-ghost btn-sm" onClick={function () { quickAdjust(item, -1); }}>−1</button>
                                                <button className="btn btn-ghost btn-sm" onClick={function () { quickAdjust(item, 1); }}>+1</button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    </div>
                </div>
            )}

            <BarcodeScanner isOpen={scannerOpen} onScan={handleBarcodeScan} onClose={function () { setScannerOpen(false); }} />
        </div>
    );
}
