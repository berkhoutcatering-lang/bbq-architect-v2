'use client';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { fmt } from '@/lib/utils';

var CATEGORIEEN = ['Alles', 'Vlees', 'Vis', 'Groenten', 'Zuivel', 'Kruiden', 'Sauzen', 'Dranken', 'Overig'];
var EENHEDEN = ['kg', 'g', 'L', 'ml', 'stuks', 'bos', 'pot', 'fles', 'zak'];

export default function Voorraad() {
    var { data: inventory, insert, update, remove } = useSupabase('inventory', []);
    var { data: recepten } = useSupabase('recepten', []);
    var showToast = useToast();
    var showConfirm = useConfirm();
    var [editing, setEditing] = useState(null);
    var [form, setForm] = useState(null);
    var [filter, setFilter] = useState('Alles');
    var [showInkooplijst, setShowInkooplijst] = useState(false);
    var [search, setSearch] = useState('');

    // Filtered items
    var filtered = inventory.filter(function (item) {
        var matchCat = filter === 'Alles' || item.categorie === filter;
        var matchSearch = !search || item.naam.toLowerCase().indexOf(search.toLowerCase()) >= 0;
        return matchCat && matchSearch;
    });

    // Stats
    var totalItems = inventory.length;
    var lowStock = inventory.filter(function (i) { return i.current_stock < i.min_stock; });
    var totalValue = 0;
    inventory.forEach(function (i) { totalValue += (i.current_stock || 0) * (i.purchase_price || 0); });

    function newItem() {
        setEditing('new');
        setForm({ naam: '', categorie: 'Vlees', current_stock: 0, min_stock: 0, unit: 'kg', purchase_price: 0, supplier: '' });
    }

    function editItem(item) { setEditing(item.id); setForm(JSON.parse(JSON.stringify(item))); }
    function setField(key, val) { setForm(Object.assign({}, form, { [key]: val })); }

    function saveItem() {
        if (!form.naam) { showToast('Vul een naam in', 'error'); return; }
        if (editing === 'new') {
            insert(form).then(function () { showToast('Item toegevoegd aan voorraad 📦', 'success'); setEditing(null); setForm(null); });
        } else {
            var { id, created_at, ...rest } = form;
            update(editing, rest).then(function () { showToast('Voorraad bijgewerkt', 'success'); setEditing(null); setForm(null); });
        }
    }

    function deleteItem() {
        showConfirm('Dit item verwijderen uit de voorraad?', function () {
            remove(editing).then(function () { showToast('Item verwijderd', 'success'); setEditing(null); setForm(null); });
        });
    }

    // Find which recipes use this inventory item
    function recipesUsingItem(itemNaam) {
        return recepten.filter(function (r) {
            return (r.ingredienten || []).some(function (ing) {
                return ing.naam && ing.naam.toLowerCase().indexOf(itemNaam.toLowerCase()) >= 0;
            });
        });
    }

    // Quick stock adjust
    function quickAdjust(item, amount) {
        var newStock = Math.max(0, (item.current_stock || 0) + amount);
        update(item.id, { current_stock: newStock }).then(function () {
            showToast(item.naam + ': ' + newStock + ' ' + item.unit, 'success');
        });
    }

    // Editor view
    if (editing !== null && form) {
        var usedIn = editing !== 'new' ? recipesUsingItem(form.naam) : [];
        var stockValue = (form.current_stock || 0) * (form.purchase_price || 0);
        var isLow = form.current_stock < form.min_stock;
        return (
            <div className="panel inv-glass">
                <div className="panel-head">
                    <h3>{editing === 'new' ? '📦 Nieuw Voorraad Item' : '✏️ ' + form.naam}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={function () { setEditing(null); setForm(null); }}>
                        <i className="fa-solid fa-arrow-left"></i> Terug
                    </button>
                </div>
                <div className="panel-body">
                    <div className="form-grid">
                        <div className="field full"><label>Naam</label>
                            <input value={form.naam} onChange={function (e) { setField('naam', e.target.value); }} placeholder="bijv. Pulled Pork, BBQ Saus..." /></div>
                        <div className="field"><label>Categorie</label>
                            <select value={form.categorie} onChange={function (e) { setField('categorie', e.target.value); }}>
                                {CATEGORIEEN.filter(function (c) { return c !== 'Alles'; }).map(function (c) { return <option key={c}>{c}</option>; })}
                            </select></div>
                        <div className="field"><label>Eenheid</label>
                            <select value={form.unit} onChange={function (e) { setField('unit', e.target.value); }}>
                                {EENHEDEN.map(function (u) { return <option key={u}>{u}</option>; })}
                            </select></div>
                        <div className="field"><label>Huidige Voorraad</label>
                            <input type="number" step="0.1" value={form.current_stock} onChange={function (e) { setField('current_stock', parseFloat(e.target.value) || 0); }} /></div>
                        <div className="field"><label>Minimale Voorraad (par-level)</label>
                            <input type="number" step="0.1" value={form.min_stock} onChange={function (e) { setField('min_stock', parseFloat(e.target.value) || 0); }} /></div>
                        <div className="field"><label>Inkoopprijs per {form.unit}</label>
                            <input type="number" step="0.01" value={form.purchase_price} onChange={function (e) { setField('purchase_price', parseFloat(e.target.value) || 0); }} /></div>
                        <div className="field"><label>Leverancier</label>
                            <input value={form.supplier} onChange={function (e) { setField('supplier', e.target.value); }} placeholder="bijv. Sligro, Hanos..." /></div>
                    </div>

                    {/* Stock value */}
                    <div style={{ marginTop: 20, padding: 16, borderRadius: 14, border: '1px solid var(--border)', background: isLow ? 'rgba(239,68,68,.06)' : 'var(--bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Voorraadwaarde</div>
                            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--brand)', marginTop: 4 }}>{fmt(stockValue)}</div>
                        </div>
                        {isLow && <span className="pill pill-red" style={{ fontSize: 11 }}>⚠ Onder par-level!</span>}
                    </div>

                    {/* Profit-Guard: recipes using this item */}
                    {usedIn.length > 0 && (
                        <div style={{ marginTop: 20 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                                <i className="fa-solid fa-link" style={{ marginRight: 6 }}></i> Profit-Guard — Gebruikt in {usedIn.length} recept(en)
                            </div>
                            {usedIn.map(function (r) {
                                // Calculate cost contribution
                                var ing = (r.ingredienten || []).find(function (i) { return i.naam && i.naam.toLowerCase().indexOf(form.naam.toLowerCase()) >= 0; });
                                var costContrib = ing ? (parseFloat(ing.hoeveelheid) || 0) * (form.purchase_price || 0) : 0;
                                // Convert units if needed
                                var unitFactor = 1;
                                if (ing && ing.eenheid === 'gram' && form.unit === 'kg') unitFactor = 0.001;
                                if (ing && ing.eenheid === 'ml' && form.unit === 'L') unitFactor = 0.001;
                                costContrib = (parseFloat(ing ? ing.hoeveelheid : 0) || 0) * unitFactor * (form.purchase_price || 0);
                                var perPortie = r.porties ? costContrib / r.porties : 0;
                                return (
                                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: 'rgba(167,139,250,.06)', border: '1px solid rgba(167,139,250,.15)', borderRadius: 10, marginBottom: 6 }}>
                                        <i className="fa-solid fa-utensils" style={{ color: 'var(--purple)', fontSize: 12 }}></i>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 700, fontSize: 12 }}>{r.naam}</div>
                                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{r.porties} porties · {ing ? ing.hoeveelheid + ' ' + (ing.eenheid || '') : ''}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand)' }}>{fmt(costContrib)}</div>
                                            <div style={{ fontSize: 9, color: 'var(--muted)' }}>{fmt(perPortie)}/portie</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="editor-actions">
                        <button className="btn btn-brand" onClick={saveItem}><i className="fa-solid fa-save"></i> Opslaan</button>
                        {editing !== 'new' && <button className="btn btn-red" onClick={deleteItem}><i className="fa-solid fa-trash"></i> Verwijderen</button>}
                    </div>
                </div>
            </div>
        );
    }

    // Inkooplijst modal
    if (showInkooplijst) {
        var tekorten = lowStock.map(function (item) {
            var tekort = (item.min_stock || 0) - (item.current_stock || 0);
            var kosten = tekort * (item.purchase_price || 0);
            return { item: item, tekort: tekort, kosten: kosten };
        });
        var totaalInkoop = 0;
        tekorten.forEach(function (t) { totaalInkoop += t.kosten; });

        return (
            <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                    <h1 style={{ fontSize: 20, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fa-solid fa-cart-shopping" style={{ color: 'var(--brand)' }}></i> Inkooplijst
                    </h1>
                    <button className="btn btn-ghost btn-sm" onClick={function () { setShowInkooplijst(false); }}>
                        <i className="fa-solid fa-arrow-left"></i> Terug
                    </button>
                </div>

                {tekorten.length === 0 && (
                    <div className="empty-state"><i className="fa-solid fa-check-circle" style={{ color: 'var(--green)' }}></i><p>Alle voorraad is op niveau! 🎉</p></div>
                )}

                {tekorten.length > 0 && (
                    <div className="panel inv-glass">
                        <div className="panel-head">
                            <h3>{tekorten.length} items bestellen</h3>
                            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--brand)' }}>{fmt(totaalInkoop)}</div>
                        </div>
                        <div style={{ padding: 0 }}>
                            <table className="tbl">
                                <thead><tr>
                                    <th>Item</th><th>Voorraad</th><th>Par-Level</th><th>Tekort</th><th>Prijs</th><th>Kosten</th><th>Leverancier</th>
                                </tr></thead>
                                <tbody>
                                    {tekorten.map(function (t) {
                                        return (
                                            <tr key={t.item.id}>
                                                <td style={{ fontWeight: 700 }}>{t.item.naam}</td>
                                                <td><span className="pill pill-red">{t.item.current_stock} {t.item.unit}</span></td>
                                                <td>{t.item.min_stock} {t.item.unit}</td>
                                                <td style={{ fontWeight: 800, color: 'var(--red)' }}>+{t.tekort.toFixed(1)} {t.item.unit}</td>
                                                <td>{fmt(t.item.purchase_price)}/{t.item.unit}</td>
                                                <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{fmt(t.kosten)}</td>
                                                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{t.item.supplier || '—'}</td>
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

    // Main dashboard
    return (
        <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div>
                    <h1 style={{ fontSize: 20, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fa-solid fa-warehouse" style={{ color: 'var(--brand)' }}></i> Smart Inventory
                    </h1>
                    <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 3 }}>
                        {totalItems} items · {lowStock.length} bestellen · Waarde: {fmt(totalValue)}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className={'btn btn-sm ' + (lowStock.length > 0 ? 'btn-red' : 'btn-ghost')} onClick={function () { setShowInkooplijst(true); }}>
                        <i className="fa-solid fa-cart-shopping"></i> Inkooplijst {lowStock.length > 0 && '(' + lowStock.length + ')'}
                    </button>
                    <button className="btn btn-brand btn-sm" onClick={newItem}>
                        <i className="fa-solid fa-plus"></i> Item Toevoegen
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="stat-grid">
                <div className="stat-card inv-glass">
                    <div className="stat-icon" style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}><i className="fa-solid fa-boxes-stacked"></i></div>
                    <div className="stat-val">{totalItems}</div>
                    <div className="stat-label">Items in Voorraad</div>
                </div>
                <div className={'stat-card inv-glass' + (lowStock.length > 0 ? ' inv-low-pulse' : '')}>
                    <div className="stat-icon" style={{ background: 'rgba(239,68,68,.12)', color: 'var(--red)' }}><i className="fa-solid fa-triangle-exclamation"></i></div>
                    <div className="stat-val" style={{ color: lowStock.length > 0 ? 'var(--red)' : 'var(--text)' }}>{lowStock.length}</div>
                    <div className="stat-label">Onder Par-Level</div>
                </div>
                <div className="stat-card inv-glass">
                    <div className="stat-icon" style={{ background: 'rgba(34,197,94,.12)', color: 'var(--green)' }}><i className="fa-solid fa-coins"></i></div>
                    <div className="stat-val" style={{ fontSize: 20 }}>{fmt(totalValue)}</div>
                    <div className="stat-label">Voorraadwaarde</div>
                </div>
            </div>

            {/* Filter + Search */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
                    {CATEGORIEEN.map(function (c) {
                        return <button key={c} className={'btn btn-sm ' + (filter === c ? 'btn-brand' : 'btn-ghost')} onClick={function () { setFilter(c); }}>{c}</button>;
                    })}
                </div>
                <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
                    <input value={search} onChange={function (e) { setSearch(e.target.value); }} placeholder="🔍 Zoek item..." style={{ padding: '7px 12px', fontSize: 12 }} />
                </div>
            </div>

            {/* Inventory table */}
            {filtered.length === 0 && (
                <div className="empty-state"><i className="fa-solid fa-warehouse"></i><p>Geen items gevonden</p>
                    <button className="btn btn-brand btn-sm" onClick={newItem}>Eerste item toevoegen</button></div>
            )}

            {filtered.length > 0 && (
                <div className="panel inv-glass" style={{ overflow: 'hidden' }}>
                    <table className="tbl">
                        <thead><tr>
                            <th>Item</th><th>Voorraad</th><th>Par-Level</th><th>Prijs</th><th>Waarde</th><th>Leverancier</th><th style={{ width: 100 }}></th>
                        </tr></thead>
                        <tbody>
                            {filtered.map(function (item) {
                                var isLow = item.current_stock < item.min_stock;
                                var value = (item.current_stock || 0) * (item.purchase_price || 0);
                                var pct = item.min_stock > 0 ? Math.min(100, (item.current_stock / item.min_stock) * 100) : 100;
                                return (
                                    <tr key={item.id} className={isLow ? 'inv-low-row' : ''} style={{ cursor: 'pointer' }} onClick={function () { editItem(item); }}>
                                        <td>
                                            <div style={{ fontWeight: 700 }}>{item.naam}</div>
                                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{item.categorie}</div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ width: 60, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                                                    <div style={{ width: pct + '%', height: '100%', borderRadius: 3, background: isLow ? 'var(--red)' : pct < 50 ? 'var(--amber)' : 'var(--green)', transition: 'width .3s' }}></div>
                                                </div>
                                                <span style={{ fontWeight: 700, color: isLow ? 'var(--red)' : 'var(--text)', fontSize: 13 }}>{item.current_stock}</span>
                                                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{item.unit}</span>
                                            </div>
                                        </td>
                                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{item.min_stock} {item.unit}</td>
                                        <td style={{ fontSize: 12 }}>{fmt(item.purchase_price)}/{item.unit}</td>
                                        <td style={{ fontWeight: 600, color: 'var(--brand)', fontSize: 12 }}>{fmt(value)}</td>
                                        <td style={{ fontSize: 11, color: 'var(--muted)' }}>{item.supplier || '—'}</td>
                                        <td onClick={function (e) { e.stopPropagation(); }}>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: 11 }} onClick={function () { quickAdjust(item, -1); }}>−1</button>
                                                <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: 11 }} onClick={function () { quickAdjust(item, 1); }}>+1</button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}
