/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { printHaccpLabel } from '@/lib/printLabel';
import EmptyState from '@/components/EmptyState';
import type { Recept, InventoryItem } from '@/types';

export default function Recepten() {
    const { data: recepten, insert, update, remove } = useSupabase<Recept>('recepten', []);
    const { data: inventory } = useSupabase<InventoryItem>('inventory', []);
    const showToast = useToast();
    const showConfirm = useConfirm();
    const [editing, setEditing] = useState<string | number | null>(null);
    const [form, setForm] = useState<Record<string, any> | null>(null);
    const [filter, setFilter] = useState('Alles');

    const categories = ['Alles', 'Vlees', 'Vis', 'Bijgerecht', 'Saus', 'Dessert', 'Drank'];

    function newRecept() {
        setEditing('new');
        setForm({ naam: '', categorie: 'Vlees', porties: 4, preptime: 30, ingredienten: [], instructies: '', notitie: '' });
    }

    function editRecept(r: Recept) {
        setEditing(r.id);
        setForm(JSON.parse(JSON.stringify(r)));
    }

    function saveRecept() {
        if (!form!.naam) { showToast('Vul een naam in', 'error'); return; }
        if (!form!.categorie) { showToast('Kies een categorie', 'error'); return; }
        if (editing === 'new') {
            insert(form!).then(function () { showToast('Recept aangemaakt', 'success'); setEditing(null); setForm(null); });
        } else {
            const { id, created_at, ...rest } = form!;
            update(editing as number, rest).then(function () { showToast('Recept bijgewerkt', 'success'); setEditing(null); setForm(null); });
        }
    }

    function deleteRecept() {
        showConfirm('Weet je zeker dat je dit recept wilt verwijderen?', function () {
            remove(editing as number).then(function () { showToast('Recept verwijderd', 'success'); setEditing(null); setForm(null); });
        });
    }

    function setField(key: string, val: any) { setForm(Object.assign({}, form, { [key]: val })); }

    function addIngredient() {
        const ing = (form!.ingredienten || []).concat([{ naam: '', hoeveelheid: '', eenheid: 'gram' }]);
        setField('ingredienten', ing);
    }

    function updateIngredient(idx: number, key: string, val: any) {
        const ing = form!.ingredienten.map(function (item: any, i: number) { return i === idx ? Object.assign({}, item, { [key]: val }) : item; });
        setField('ingredienten', ing);
    }

    function removeIngredient(idx: number) {
        setField('ingredienten', form!.ingredienten.filter(function (_: any, i: number) { return i !== idx; }));
    }

    if (editing !== null && form) {
        return (
            <>
                <div className="panel">
                    <div className="panel-head">
                        <h3>{editing === 'new' ? 'Nieuw Recept' : 'Recept Bewerken'}</h3>
                        <button className="btn btn-ghost btn-sm" onClick={function () { setEditing(null); setForm(null); }}>
                            <i className="fa-solid fa-arrow-left"></i> Terug
                        </button>
                    </div>
                    <div className="panel-body">
                        <div className="form-grid">
                            <div className="field full">
                                <label>Naam</label>
                                <input value={form.naam} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('naam', e.target.value); }} />
                            </div>
                            <div className="field">
                                <label>Categorie</label>
                                <select value={form.categorie} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setField('categorie', e.target.value); }}>
                                    {['Vlees', 'Vis', 'Bijgerecht', 'Saus', 'Dessert', 'Drank'].map(function (c) {
                                        return <option key={c} value={c}>{c}</option>;
                                    })}
                                </select>
                            </div>
                            <div className="field">
                                <label>Porties</label>
                                <input type="number" value={form.porties} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('porties', parseInt(e.target.value) || 0); }} />
                            </div>
                            <div className="field">
                                <label>Preptime (min)</label>
                                <input type="number" value={form.preptime} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('preptime', parseInt(e.target.value) || 0); }} />
                            </div>
                        </div>

                        <div style={{ marginTop: 24 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <h4 style={{ fontSize: 14, fontWeight: 600 }}>Ingrediënten</h4>
                                <button className="btn btn-brand btn-sm" onClick={addIngredient}>
                                    <i className="fa-solid fa-plus"></i> Toevoegen
                                </button>
                            </div>
                            {(form.ingredienten || []).map(function (ing: any, idx: number) {
                                return (
                                    <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                                        <input style={{ flex: 2, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, font: '400 13px DM Sans,sans-serif' }}
                                            placeholder="Ingredient" value={ing.naam} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateIngredient(idx, 'naam', e.target.value); }} />
                                        <input style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, font: '400 13px DM Sans,sans-serif' }}
                                            placeholder="Hoeveelheid" value={ing.hoeveelheid} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateIngredient(idx, 'hoeveelheid', e.target.value); }} />
                                        <select style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, font: '400 13px DM Sans,sans-serif' }}
                                            value={ing.eenheid} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { updateIngredient(idx, 'eenheid', e.target.value); }}>
                                            {['gram', 'kg', 'ml', 'liter', 'stuks', 'el', 'tl'].map(function (u) { return <option key={u}>{u}</option>; })}
                                        </select>
                                        <button className="del-btn" onClick={function () { removeIngredient(idx); }}>
                                            <i className="fa-solid fa-trash"></i>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="form-grid" style={{ marginTop: 20 }}>
                            <div className="field full">
                                <label>Instructies</label>
                                <textarea rows={4} value={form.instructies} onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setField('instructies', e.target.value); }} />
                            </div>
                            <div className="field full">
                                <label>Notitie</label>
                                <textarea rows={2} value={form.notitie} onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setField('notitie', e.target.value); }} />
                            </div>
                        </div>

                        <div className="editor-actions">
                            <button className="btn btn-brand" onClick={saveRecept}>
                                <i className="fa-solid fa-save"></i> Opslaan
                            </button>
                            {editing !== 'new' && (
                                <>
                                    <button className="btn" style={{ background: '#10b981', color: '#fff', border: 'none' }} onClick={function () {
                                        printHaccpLabel({
                                            titel: form.naam,
                                            allergenen: detectAllergenen(form.ingredienten),
                                            notities: form.notitie
                                        });
                                        showToast('Etiket verstuurd naar printer', 'success');
                                    }}>
                                        <i className="fa-solid fa-print"></i> Print Etiket
                                    </button>
                                    <button className="btn btn-red" onClick={deleteRecept}>
                                        <i className="fa-solid fa-trash"></i> Verwijderen
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </>
        );
    }

    function findBestInventoryMatch(ingName: string, items: InventoryItem[]) {
        if (!ingName) return null;
        var needle = ingName.toLowerCase().trim();
        var bestMatch: InventoryItem | null = null;
        var bestScore = 0;
        items.forEach(function (inv) {
            if (!inv.naam) return;
            var haystack = inv.naam.toLowerCase().trim();
            var score = 0;
            if (haystack === needle) {
                score = 3;
            } else if (haystack.startsWith(needle + ' ') || haystack.startsWith(needle + ',')) {
                score = 2;
            } else if (needle.startsWith(haystack + ' ') || needle.startsWith(haystack + ',')) {
                score = 2;
            } else {
                var needleWords = needle.split(/\s+/);
                var haystackWords = haystack.split(/\s+/);
                var matched = needleWords.filter(function (w) { return haystackWords.indexOf(w) >= 0; });
                if (matched.length > 0 && matched.length >= Math.min(needleWords.length, haystackWords.length)) {
                    score = 1;
                }
            }
            if (score > bestScore) {
                bestScore = score;
                bestMatch = inv;
            }
        });
        return bestMatch;
    }

    function detectAllergenen(ingredienten: any[]): string[] {
        const allergeenMap: Record<string, string[]> = {
            'Gluten': ['meel', 'bloem', 'brood', 'pasta', 'couscous', 'bulgur', 'panko', 'bier', 'sojasaus', 'tarwe', 'rogge', 'gerst', 'spelt'],
            'Lactose': ['melk', 'kaas', 'boter', 'room', 'yoghurt', 'creme', 'mascarpone', 'mozzarella', 'parmezaan', 'cheddar', 'brie'],
            'Ei': ['ei', 'eieren', 'mayonaise'],
            'Noten': ['amandel', 'walnoot', 'hazelnoot', 'cashew', 'pistache', 'pecannoot', 'pinda', 'noten'],
            'Soja': ['soja', 'tofu', 'tempeh', 'sojasaus', 'edamame'],
            'Vis': ['vis', 'zalm', 'kabeljauw', 'tonijn', 'makreel', 'haring', 'sardine', 'ansjovis', 'forel'],
            'Schaaldieren': ['garnaal', 'garnalen', 'kreeft', 'krab', 'mosselen', 'oesters', 'langoustine'],
            'Selderij': ['selderij', 'selderijzout', 'knolselderij'],
            'Mosterd': ['mosterd'],
            'Sesamzaad': ['sesam', 'sesamzaad', 'tahini'],
            'Sulfiet': ['wijn', 'azijn', 'gedroogd fruit']
        };
        var found: string[] = [];
        var namen = (ingredienten || []).map(function (ing: any) { return (ing.naam || '').toLowerCase(); });
        Object.keys(allergeenMap).forEach(function (allergeen) {
            var triggers = allergeenMap[allergeen];
            var match = namen.some(function (naam: string) {
                return triggers.some(function (trigger) { return naam.indexOf(trigger) >= 0; });
            });
            if (match) found.push(allergeen);
        });
        return found;
    }

    function calcRecipeCost(recipe: Record<string, any>) {
        let total = 0;
        (recipe.ingredienten || []).forEach(function (ing: any) {
            const match = findBestInventoryMatch(ing.naam, inventory);
            if (match) {
                const qty = parseFloat(ing.hoeveelheid) || 0;
                let unitFactor = 1;
                if (ing.eenheid === 'gram' && match.unit === 'kg') unitFactor = 0.001;
                if (ing.eenheid === 'ml' && match.unit === 'L') unitFactor = 0.001;
                total += qty * unitFactor * (match.purchase_price || 0);
            }
        });
        return total;
    }

    const filtered = filter === 'Alles' ? recepten : recepten.filter(function (r) { return r.categorie === filter; });

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap' as const, gap: 10 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {categories.map(function (c) {
                        return <button key={c} className={'btn btn-sm ' + (filter === c ? 'btn-brand' : 'btn-ghost')} onClick={function () { setFilter(c); }}>{c}</button>;
                    })}
                </div>
                <button className="btn btn-brand" onClick={newRecept} style={{ flexShrink: 0 }}>
                    <i className="fa-solid fa-plus"></i> Nieuw Recept
                </button>
            </div>

            {filtered.length === 0 && (
                <EmptyState page="/recepten" onAction={newRecept} />
            )}

            <div className="grid-3">
                {filtered.map(function (r) {
                    return (
                        <div key={r.id} className="rec-card" onClick={function () { editRecept(r); }}>
                            <div className="rec-cat">{r.categorie}</div>
                            <div className="rec-name">{r.naam}</div>
                            <div className="rec-meta">
                                <span><i className="fa-solid fa-users"></i> {r.porties} porties</span>
                                <span><i className="fa-solid fa-clock"></i> {r.preptime} min</span>
                                <span><i className="fa-solid fa-list"></i> {(r.ingredienten || []).length} ingr.</span>
                            </div>
                            {calcRecipeCost(r) > 0 && (
                                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                                    <span style={{ fontSize: 11, color: 'var(--purple)', fontWeight: 700 }}><i className="fa-solid fa-coins" style={{ marginRight: 4 }}></i> Kostprijs</span>
                                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand)' }}>{(calcRecipeCost(r) / (r.porties || 1)).toFixed(2)} /portie</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );
}
