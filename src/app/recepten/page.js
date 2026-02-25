'use client';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';

export default function Recepten() {
    var { data: recepten, insert, update, remove } = useSupabase('recepten', []);
    var showToast = useToast();
    var showConfirm = useConfirm();
    var [editing, setEditing] = useState(null); // null | 'new' | id
    var [form, setForm] = useState(null);
    var [filter, setFilter] = useState('Alles');

    var categories = ['Alles', 'Vlees', 'Vis', 'Bijgerecht', 'Saus', 'Dessert', 'Drank'];

    function newRecept() {
        setEditing('new');
        setForm({ naam: '', categorie: 'Vlees', porties: 4, preptime: 30, ingredienten: [], instructies: '', notitie: '' });
    }

    function editRecept(r) {
        setEditing(r.id);
        setForm(JSON.parse(JSON.stringify(r)));
    }

    function saveRecept() {
        if (!form.naam) { showToast('Vul een naam in', 'error'); return; }
        if (editing === 'new') {
            insert(form).then(function () { showToast('Recept aangemaakt', 'success'); setEditing(null); setForm(null); });
        } else {
            var { id, created_at, ...rest } = form;
            update(editing, rest).then(function () { showToast('Recept bijgewerkt', 'success'); setEditing(null); setForm(null); });
        }
    }

    function deleteRecept() {
        showConfirm('Weet je zeker dat je dit recept wilt verwijderen?', function () {
            remove(editing).then(function () { showToast('Recept verwijderd', 'success'); setEditing(null); setForm(null); });
        });
    }

    function setField(key, val) { setForm(Object.assign({}, form, { [key]: val })); }

    function addIngredient() {
        var ing = (form.ingredienten || []).concat([{ naam: '', hoeveelheid: '', eenheid: 'gram' }]);
        setField('ingredienten', ing);
    }

    function updateIngredient(idx, key, val) {
        var ing = form.ingredienten.map(function (item, i) { return i === idx ? Object.assign({}, item, { [key]: val }) : item; });
        setField('ingredienten', ing);
    }

    function removeIngredient(idx) {
        setField('ingredienten', form.ingredienten.filter(function (_, i) { return i !== idx; }));
    }

    // Editor view
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
                                <input value={form.naam} onChange={function (e) { setField('naam', e.target.value); }} />
                            </div>
                            <div className="field">
                                <label>Categorie</label>
                                <select value={form.categorie} onChange={function (e) { setField('categorie', e.target.value); }}>
                                    {['Vlees', 'Vis', 'Bijgerecht', 'Saus', 'Dessert', 'Drank'].map(function (c) {
                                        return <option key={c} value={c}>{c}</option>;
                                    })}
                                </select>
                            </div>
                            <div className="field">
                                <label>Porties</label>
                                <input type="number" value={form.porties} onChange={function (e) { setField('porties', parseInt(e.target.value) || 0); }} />
                            </div>
                            <div className="field">
                                <label>Preptime (min)</label>
                                <input type="number" value={form.preptime} onChange={function (e) { setField('preptime', parseInt(e.target.value) || 0); }} />
                            </div>
                        </div>

                        {/* Ingrediënten */}
                        <div style={{ marginTop: 24 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <h4 style={{ fontSize: 14, fontWeight: 600 }}>Ingrediënten</h4>
                                <button className="btn btn-brand btn-sm" onClick={addIngredient}>
                                    <i className="fa-solid fa-plus"></i> Toevoegen
                                </button>
                            </div>
                            {(form.ingredienten || []).map(function (ing, idx) {
                                return (
                                    <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                                        <input style={{ flex: 2, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, font: '400 13px DM Sans,sans-serif' }}
                                            placeholder="Ingredient" value={ing.naam} onChange={function (e) { updateIngredient(idx, 'naam', e.target.value); }} />
                                        <input style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, font: '400 13px DM Sans,sans-serif' }}
                                            placeholder="Hoeveelheid" value={ing.hoeveelheid} onChange={function (e) { updateIngredient(idx, 'hoeveelheid', e.target.value); }} />
                                        <select style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, font: '400 13px DM Sans,sans-serif' }}
                                            value={ing.eenheid} onChange={function (e) { updateIngredient(idx, 'eenheid', e.target.value); }}>
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
                                <textarea rows={4} value={form.instructies} onChange={function (e) { setField('instructies', e.target.value); }} />
                            </div>
                            <div className="field full">
                                <label>Notitie</label>
                                <textarea rows={2} value={form.notitie} onChange={function (e) { setField('notitie', e.target.value); }} />
                            </div>
                        </div>

                        <div className="editor-actions">
                            <button className="btn btn-brand" onClick={saveRecept}>
                                <i className="fa-solid fa-save"></i> Opslaan
                            </button>
                            {editing !== 'new' && (
                                <button className="btn btn-red" onClick={deleteRecept}>
                                    <i className="fa-solid fa-trash"></i> Verwijderen
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </>
        );
    }

    // List view
    var filtered = filter === 'Alles' ? recepten : recepten.filter(function (r) { return r.categorie === filter; });

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {categories.map(function (c) {
                        return <button key={c} className={'btn btn-sm ' + (filter === c ? 'btn-brand' : 'btn-ghost')} onClick={function () { setFilter(c); }}>{c}</button>;
                    })}
                </div>
                <button className="btn btn-brand" onClick={newRecept}>
                    <i className="fa-solid fa-plus"></i> Nieuw Recept
                </button>
            </div>

            {filtered.length === 0 && (
                <div className="empty-state">
                    <i className="fa-solid fa-utensils"></i>
                    <p>Geen recepten gevonden</p>
                    <button className="btn btn-brand btn-sm" onClick={newRecept}>Voeg je eerste recept toe</button>
                </div>
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
                        </div>
                    );
                })}
            </div>
        </>
    );
}
