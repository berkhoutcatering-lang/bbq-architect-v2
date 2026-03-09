'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';

export default function Gerechten() {
    var showToast = useToast();
    var showConfirm = useConfirm();
    var [gangen, setGangen] = useState([]);
    var [gerechten, setGerechten] = useState([]);
    var [activeGang, setActiveGang] = useState(null);
    var [editing, setEditing] = useState(null);
    var [form, setForm] = useState({});
    var [gangEditing, setGangEditing] = useState(null);
    var [gangForm, setGangForm] = useState({});

    useEffect(function () { loadData(); }, []);

    async function loadData() {
        var g = await supabase.from('gangen').select('*').order('volgorde');
        if (g.data) {
            setGangen(g.data);
            if (!activeGang && g.data.length > 0) setActiveGang(g.data[0].slug);
        }
        var r = await supabase.from('gerechten').select('*').order('volgorde');
        if (r.data) setGerechten(r.data);
    }

    // ── Gang CRUD ──
    function newGang() {
        setGangEditing('new');
        setGangForm({ naam: '', slug: '', minimum: 1, extra_prijs_pp: 0, volgorde: gangen.length + 1 });
    }
    function editGang(g) {
        setGangEditing(g.id);
        setGangForm({ naam: g.naam, slug: g.slug, minimum: g.minimum, extra_prijs_pp: g.extra_prijs_pp, volgorde: g.volgorde });
    }
    async function saveGang() {
        if (!gangForm.naam || !gangForm.slug) { showToast('Vul naam en slug in', 'error'); return; }
        if (gangEditing === 'new') {
            var { error } = await supabase.from('gangen').insert([gangForm]);
            if (error) { showToast('Fout: ' + error.message, 'error'); return; }
            showToast('Gang toegevoegd!');
        } else {
            var { error } = await supabase.from('gangen').update(gangForm).eq('id', gangEditing);
            if (error) { showToast('Fout: ' + error.message, 'error'); return; }
            showToast('Gang bijgewerkt!');
        }
        setGangEditing(null);
        loadData();
    }
    async function deleteGang(id) {
        showConfirm('Weet je zeker dat je deze gang wilt verwijderen?', async function () {
            await supabase.from('gangen').delete().eq('id', id);
            showToast('Gang verwijderd');
            setGangEditing(null);
            loadData();
        });
    }

    // ── Gerecht CRUD ──
    function newGerecht() {
        setEditing('new');
        setForm({ naam: '', beschrijving: '', gang_slug: activeGang, volgorde: gerechten.filter(function (g) { return g.gang_slug === activeGang; }).length + 1 });
    }
    function editGerecht(g) {
        setEditing(g.id);
        setForm({ naam: g.naam, beschrijving: g.beschrijving || '', gang_slug: g.gang_slug, volgorde: g.volgorde });
    }
    async function saveGerecht() {
        if (!form.naam) { showToast('Vul een naam in', 'error'); return; }
        if (editing === 'new') {
            var { error } = await supabase.from('gerechten').insert([form]);
            if (error) { showToast('Fout: ' + error.message, 'error'); return; }
            showToast('Gerecht toegevoegd!');
        } else {
            var { error } = await supabase.from('gerechten').update(form).eq('id', editing);
            if (error) { showToast('Fout: ' + error.message, 'error'); return; }
            showToast('Gerecht bijgewerkt!');
        }
        setEditing(null);
        loadData();
    }
    async function deleteGerecht(id) {
        showConfirm('Weet je zeker dat je dit gerecht wilt verwijderen?', async function () {
            await supabase.from('gerechten').delete().eq('id', id);
            showToast('Gerecht verwijderd');
            setEditing(null);
            loadData();
        });
    }

    var gangGerechten = gerechten.filter(function (g) { return g.gang_slug === activeGang; });
    var currentGang = gangen.find(function (g) { return g.slug === activeGang; });

    return (
        <div className="main-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>🍽️ Gerechten Beheer</h2>
                <button className="btn btn-ghost btn-sm" onClick={newGang}>⚙️ Gang Toevoegen</button>
            </div>

            {/* Gang tabs */}
            <div className="tab-bar">
                {gangen.map(function (g) {
                    return (
                        <button
                            key={g.slug}
                            className={'tab-btn' + (activeGang === g.slug ? ' active' : '')}
                            onClick={function () { setActiveGang(g.slug); setEditing(null); }}
                        >
                            {g.naam}
                            <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>
                                (min {g.minimum})
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Gang info bar */}
            {currentGang && (
                <div className="gang-info-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(180,140,20,.08)', border: '1px solid rgba(180,140,20,.15)', borderRadius: 10, marginBottom: 16 }}>
                    <div>
                        <span style={{ fontWeight: 600 }}>{currentGang.naam}</span>
                        <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 10 }}>
                            Minimaal {currentGang.minimum} selecteren
                            {currentGang.extra_prijs_pp > 0 && ' • Extra: +€' + Number(currentGang.extra_prijs_pp).toFixed(2) + ' p.p.'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={function () { editGang(currentGang); }}>✏️ Bewerk Gang</button>
                        <button className="btn btn-brand btn-sm" onClick={newGerecht}>+ Gerecht</button>
                    </div>
                </div>
            )}

            {/* Gerechten grid */}
            <div className="dish-grid">
                {gangGerechten.map(function (g) {
                    return (
                        <div key={g.id} className="dish-card" onClick={function () { editGerecht(g); }}>
                            <div className="dish-name">{g.naam}</div>
                            <div className="dish-desc">{g.beschrijving || '—'}</div>
                        </div>
                    );
                })}
                {gangGerechten.length === 0 && (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
                        Nog geen gerechten in deze gang. Klik <button className="link-btn" onClick={newGerecht}>+ Gerecht</button> om te beginnen.
                    </div>
                )}
            </div>

            {/* Edit Gerecht Modal */}
            {editing && (
                <div className="modal-bg" onClick={function (e) { if (e.target === e.currentTarget) setEditing(null); }}>
                    <div className="modal-box" style={{ maxWidth: 440 }}>
                        <h3>{editing === 'new' ? '➕ Nieuw Gerecht' : '✏️ Gerecht Bewerken'}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                            <div className="field">
                                <label>Naam</label>
                                <input value={form.naam || ''} onChange={function (e) { setForm(Object.assign({}, form, { naam: e.target.value })); }} placeholder="bijv. Sliders" />
                            </div>
                            <div className="field">
                                <label>Beschrijving</label>
                                <input value={form.beschrijving || ''} onChange={function (e) { setForm(Object.assign({}, form, { beschrijving: e.target.value })); }} placeholder="bijv. Mini burger van de Yoder" />
                            </div>
                            <div className="field">
                                <label>Gang</label>
                                <select value={form.gang_slug || ''} onChange={function (e) { setForm(Object.assign({}, form, { gang_slug: e.target.value })); }}>
                                    {gangen.map(function (g) { return <option key={g.slug} value={g.slug}>{g.naam}</option>; })}
                                </select>
                            </div>
                            <div className="field">
                                <label>Volgorde</label>
                                <input type="number" value={form.volgorde != null ? form.volgorde : ''} onChange={function (e) { setForm(Object.assign({}, form, { volgorde: e.target.value === '' ? '' : parseInt(e.target.value) })); }} />
                            </div>
                        </div>
                        <div className="modal-actions">
                            {editing !== 'new' && <button className="btn btn-red btn-sm" onClick={function () { deleteGerecht(editing); }}>🗑️ Verwijderen</button>}
                            <button className="btn btn-ghost btn-sm" onClick={function () { setEditing(null); }}>Annuleren</button>
                            <button className="btn btn-brand btn-sm" onClick={saveGerecht}>💾 Opslaan</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Gang Modal */}
            {gangEditing && (
                <div className="modal-bg" onClick={function (e) { if (e.target === e.currentTarget) setGangEditing(null); }}>
                    <div className="modal-box" style={{ maxWidth: 440 }}>
                        <h3>{gangEditing === 'new' ? '➕ Nieuwe Gang' : '⚙️ Gang Bewerken'}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                            <div className="field">
                                <label>Naam</label>
                                <input value={gangForm.naam || ''} onChange={function (e) { setGangForm(Object.assign({}, gangForm, { naam: e.target.value })); }} placeholder="bijv. Bites" />
                            </div>
                            <div className="field">
                                <label>Slug (code-naam)</label>
                                <input value={gangForm.slug || ''} onChange={function (e) { setGangForm(Object.assign({}, gangForm, { slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })); }} placeholder="bijv. bites" />
                            </div>
                            <div className="form-grid">
                                <div className="field">
                                    <label>Minimum selectie</label>
                                    <input type="number" value={gangForm.minimum != null ? gangForm.minimum : ''} onChange={function (e) { setGangForm(Object.assign({}, gangForm, { minimum: e.target.value === '' ? '' : parseInt(e.target.value) })); }} />
                                </div>
                                <div className="field">
                                    <label>Extra prijs p.p. (€)</label>
                                    <input type="number" step="0.25" value={gangForm.extra_prijs_pp != null ? gangForm.extra_prijs_pp : ''} onChange={function (e) { setGangForm(Object.assign({}, gangForm, { extra_prijs_pp: e.target.value === '' ? '' : parseFloat(e.target.value) })); }} />
                                </div>
                            </div>
                            <div className="field">
                                <label>Volgorde</label>
                                <input type="number" value={gangForm.volgorde != null ? gangForm.volgorde : ''} onChange={function (e) { setGangForm(Object.assign({}, gangForm, { volgorde: e.target.value === '' ? '' : parseInt(e.target.value) })); }} />
                            </div>
                        </div>
                        <div className="modal-actions">
                            {gangEditing !== 'new' && <button className="btn btn-red btn-sm" onClick={function () { deleteGang(gangEditing); }}>🗑️ Verwijderen</button>}
                            <button className="btn btn-ghost btn-sm" onClick={function () { setGangEditing(null); }}>Annuleren</button>
                            <button className="btn btn-brand btn-sm" onClick={saveGang}>💾 Opslaan</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
