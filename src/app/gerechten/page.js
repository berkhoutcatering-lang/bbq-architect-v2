'use client';
import { useState, useEffect, useRef } from 'react';
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
    var [tagInput, setTagInput] = useState('');
    var [allergeenInput, setAllergeenInput] = useState('');
    var [labelInput, setLabelInput] = useState('');
    var [uploading, setUploading] = useState(false);
    var [stats, setStats] = useState(null);
    var fileInputRef = useRef(null);

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
        setGangForm({ naam: '', slug: '', minimum: 1, extra_prijs_pp: 0, volgorde: gangen.length + 1, actief: true });
    }
    function editGang(g) {
        setGangEditing(g.id);
        setGangForm({ naam: g.naam, slug: g.slug, minimum: g.minimum, extra_prijs_pp: g.extra_prijs_pp, volgorde: g.volgorde, actief: g.actief !== false });
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
        setForm({
            naam: '', beschrijving: '', gang_slug: activeGang,
            volgorde: gerechten.filter(function (g) { return g.gang_slug === activeGang; }).length + 1,
            foto_url: '', ingredienten: [], bereidingswijze: '',
            allergenen: [], tags: [], kostprijs_pp: ''
        });
        setTagInput(''); setAllergeenInput(''); setLabelInput('');
        setStats(null);
    }
    async function editGerecht(g) {
        setEditing(g.id);
        setForm({
            naam: g.naam,
            beschrijving: g.beschrijving || '',
            gang_slug: g.gang_slug,
            volgorde: g.volgorde,
            foto_url: g.foto_url || '',
            ingredienten: g.ingredienten || [],
            bereidingswijze: g.bereidingswijze || '',
            allergenen: g.allergenen || [],
            tags: g.tags || [],
            kostprijs_pp: g.kostprijs_pp || ''
        });
        setTagInput(''); setAllergeenInput(''); setLabelInput('');
        loadStats(g.naam);
    }

    async function loadStats(naam) {
        // Zoek in offertes hoeveel keer dit gerecht voorkomt
        var offRes = await supabase.from('offertes').select('id, client_naam, datum, menu_selectie').not('menu_selectie', 'is', null);
        var offCount = 0;
        var offList = [];
        if (offRes.data) {
            offRes.data.forEach(function (o) {
                var sel = typeof o.menu_selectie === 'string' ? JSON.parse(o.menu_selectie) : o.menu_selectie;
                var found = false;
                Object.values(sel || {}).forEach(function (dishes) {
                    if (dishes && dishes.indexOf(naam) >= 0) found = true;
                });
                if (found) { offCount++; offList.push({ naam: o.client_naam, datum: o.datum }); }
            });
        }

        // Zoek gemiddelde serveertijden
        var servRes = await supabase.from('service_logs').select('duration_seconds, gang_slug').not('served_at', 'is', null);
        var totalTime = 0; var timeCount = 0;
        if (servRes.data) {
            // We meten gangen waar dit gerecht in zou kunnen zitten
            servRes.data.forEach(function (log) {
                if (log.duration_seconds) { totalTime += log.duration_seconds; timeCount++; }
            });
        }

        setStats({
            offCount: offCount,
            offList: offList.slice(0, 5),
            avgTime: timeCount > 0 ? Math.round(totalTime / timeCount) : null,
            servedCount: timeCount
        });
    }

    async function saveGerecht() {
        if (!form.naam) { showToast('Vul een naam in', 'error'); return; }
        var saveData = Object.assign({}, form);
        if (saveData.kostprijs_pp === '' || saveData.kostprijs_pp === null) saveData.kostprijs_pp = 0;
        else saveData.kostprijs_pp = parseFloat(saveData.kostprijs_pp) || 0;

        if (editing === 'new') {
            var { error } = await supabase.from('gerechten').insert([saveData]);
            if (error) { showToast('Fout: ' + error.message, 'error'); return; }
            showToast('Gerecht toegevoegd!');
        } else {
            var { error } = await supabase.from('gerechten').update(saveData).eq('id', editing);
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

    // ── Foto Upload ──
    async function handleFotoUpload(e) {
        var file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        var ext = file.name.split('.').pop();
        var fileName = 'gerecht_' + Date.now() + '.' + ext;

        var { data, error } = await supabase.storage
            .from('gerechten-fotos')
            .upload(fileName, file, { cacheControl: '3600', upsert: true });

        if (error) {
            showToast('Upload fout: ' + error.message, 'error');
            setUploading(false);
            return;
        }

        var { data: urlData } = supabase.storage
            .from('gerechten-fotos')
            .getPublicUrl(fileName);

        setForm(Object.assign({}, form, { foto_url: urlData.publicUrl }));
        setUploading(false);
        showToast('📸 Foto geüpload!');
    }

    // ── Generic Tag Helpers ──
    function addArrayItem(field, value, setter) {
        var current = form[field] || [];
        if (value.trim() && !current.includes(value.trim())) {
            setForm(Object.assign({}, form, { [field]: current.concat([value.trim()]) }));
        }
        setter('');
    }
    function removeArrayItem(field, idx) {
        var current = (form[field] || []).slice();
        current.splice(idx, 1);
        setForm(Object.assign({}, form, { [field]: current }));
    }
    function handleTagKeyDown(field, value, setter, e) {
        if (e.key === 'Enter' && value.trim()) {
            e.preventDefault();
            addArrayItem(field, value, setter);
        }
    }

    function formatTime(seconds) {
        var m = Math.floor(seconds / 60);
        var s = seconds % 60;
        return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    var gangGerechten = gerechten.filter(function (g) { return g.gang_slug === activeGang; });
    var currentGang = gangen.find(function (g) { return g.slug === activeGang; });

    // ── Quick-add labels ──
    var ALLERGENEN_PRESETS = ['Glutenvrij', 'Lactosevrij', 'Notenvrij', 'Vegetarisch', 'Veganistisch', 'Vis', 'Schaaldieren'];
    var TAG_PRESETS = ['Vega', 'Vegan', 'Signature', 'Populair', 'Nieuw', 'Seizoen'];

    return (
        <div className="main-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>🍽️ Gerechten Beheer</h2>
                <button className="btn btn-ghost btn-sm" onClick={newGang}>⚙️ Gang Toevoegen</button>
            </div>

            {/* Gang tabs */}
            <div className="tab-bar">
                {gangen.map(function (g) {
                    var count = gerechten.filter(function (gr) { return gr.gang_slug === g.slug; }).length;
                    return (
                        <button
                            key={g.slug}
                            className={'tab-btn' + (activeGang === g.slug ? ' active' : '')}
                            onClick={function () { setActiveGang(g.slug); setEditing(null); }}
                        >
                            {g.naam}
                            <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 4 }}>
                                ({count})
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Gang info bar */}
            {currentGang && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(180,140,20,.08)', border: '1px solid rgba(180,140,20,.15)', borderRadius: 10, marginBottom: 16 }}>
                    <div>
                        <span style={{ fontWeight: 600 }}>{currentGang.naam}</span>
                        <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 10 }}>
                            Min. {currentGang.minimum} selecteren
                            {currentGang.extra_prijs_pp > 0 && ' • Extra: +€' + Number(currentGang.extra_prijs_pp).toFixed(2) + ' p.p.'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={function () { editGang(currentGang); }}>✏️ Gang</button>
                        <button className="btn btn-brand btn-sm" onClick={newGerecht}>+ Gerecht</button>
                    </div>
                </div>
            )}

            {/* Gerechten grid */}
            <div className="dish-grid">
                {gangGerechten.map(function (g) {
                    return (
                        <div key={g.id} className="dish-card" onClick={function () { editGerecht(g); }}>
                            {g.foto_url && (
                                <div className="dish-foto-preview" style={{ backgroundImage: 'url(' + g.foto_url + ')' }}></div>
                            )}
                            <div className="dish-name">{g.naam}</div>
                            <div className="dish-desc">{g.beschrijving || '—'}</div>

                            {/* Tags + Allergenen */}
                            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {(g.tags || []).map(function (tag, i) {
                                    return <span key={'t' + i} className="dish-tag-chip">{tag}</span>;
                                })}
                                {(g.allergenen || []).map(function (a, i) {
                                    return <span key={'a' + i} className="dish-allergen-chip">{a}</span>;
                                })}
                            </div>

                            {/* Ingrediënten preview */}
                            {g.ingredienten && g.ingredienten.length > 0 && (
                                <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                    {g.ingredienten.slice(0, 3).map(function (ing, i) {
                                        return <span key={i} className="ingredient-chip-small">{ing}</span>;
                                    })}
                                    {g.ingredienten.length > 3 && <span className="ingredient-chip-small" style={{ opacity: 0.4 }}>+{g.ingredienten.length - 3}</span>}
                                </div>
                            )}

                            {/* Kostprijs badge */}
                            {g.kostprijs_pp > 0 && (
                                <div className="dish-kostprijs">€{Number(g.kostprijs_pp).toFixed(2)} p.p.</div>
                            )}
                        </div>
                    );
                })}
                {gangGerechten.length === 0 && (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
                        Nog geen gerechten in deze gang. Klik <button className="link-btn" onClick={newGerecht}>+ Gerecht</button> om te beginnen.
                    </div>
                )}
            </div>

            {/* ═══ GERECHT MODAL ═══ */}
            {editing && (
                <div className="modal-bg" onClick={function (e) { if (e.target === e.currentTarget) setEditing(null); }}>
                    <div className="modal-box" style={{ maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
                        <h3>{editing === 'new' ? '➕ Nieuw Gerecht' : '✏️ Gerecht Bewerken'}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>

                            {/* Foto */}
                            <div className="field">
                                <label>📸 Foto</label>
                                {form.foto_url ? (
                                    <div className="foto-upload-zone has-foto">
                                        <img src={form.foto_url} alt="Gerecht" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 8 }} />
                                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                            <button type="button" className="btn btn-ghost btn-sm" onClick={function () { fileInputRef.current.click(); }}>🔄 Vervangen</button>
                                            <button type="button" className="btn btn-ghost btn-sm" onClick={function () { setForm(Object.assign({}, form, { foto_url: '' })); }}>🗑️ Verwijder</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="foto-upload-zone" onClick={function () { fileInputRef.current.click(); }}>
                                        {uploading ? <span style={{ color: '#B48C14' }}>⏳ Uploaden...</span> : <span>📷 Klik om foto te uploaden</span>}
                                    </div>
                                )}
                                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFotoUpload} />
                            </div>

                            {/* Naam + Gang */}
                            <div className="form-grid">
                                <div className="field">
                                    <label>Naam</label>
                                    <input value={form.naam || ''} onChange={function (e) { setForm(Object.assign({}, form, { naam: e.target.value })); }} placeholder="bijv. Crispy Zalm" />
                                </div>
                                <div className="field">
                                    <label>Gang</label>
                                    <select value={form.gang_slug || ''} onChange={function (e) { setForm(Object.assign({}, form, { gang_slug: e.target.value })); }}>
                                        {gangen.map(function (g) { return <option key={g.slug} value={g.slug}>{g.naam}</option>; })}
                                    </select>
                                </div>
                            </div>

                            {/* Beschrijving */}
                            <div className="field">
                                <label>Beschrijving</label>
                                <input value={form.beschrijving || ''} onChange={function (e) { setForm(Object.assign({}, form, { beschrijving: e.target.value })); }} placeholder="bijv. Krokant gyoza vel met gerookte zalm" />
                            </div>

                            {/* Ingrediënten */}
                            <div className="field">
                                <label>🧾 Ingrediënten</label>
                                <div className="tag-input-container">
                                    <div className="tag-list">
                                        {(form.ingredienten || []).map(function (tag, idx) {
                                            return (
                                                <span key={idx} className="ingredient-tag">
                                                    {tag}
                                                    <button type="button" className="tag-remove" onClick={function () { removeArrayItem('ingredienten', idx); }}>×</button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <input className="tag-input" value={tagInput} onChange={function (e) { setTagInput(e.target.value); }}
                                        onKeyDown={function (e) { handleTagKeyDown('ingredienten', tagInput, setTagInput, e); }}
                                        placeholder="Typ ingrediënt + Enter" />
                                </div>
                            </div>

                            {/* Bereidingswijze */}
                            <div className="field">
                                <label>👨‍🍳 Bereidingswijze / Opbouw</label>
                                <textarea value={form.bereidingswijze || ''}
                                    onChange={function (e) { setForm(Object.assign({}, form, { bereidingswijze: e.target.value })); }}
                                    placeholder="bijv. Krokant gyoza vel met gerookte zalm en mierikswortel mayo, garneer met borage cress"
                                    rows={3} style={{ resize: 'vertical' }} />
                            </div>

                            {/* Allergenen */}
                            <div className="field">
                                <label>⚠️ Allergenen <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optioneel)</span></label>
                                <div className="tag-input-container">
                                    <div className="tag-list">
                                        {(form.allergenen || []).map(function (a, idx) {
                                            return (
                                                <span key={idx} className="allergen-tag">
                                                    {a}
                                                    <button type="button" className="tag-remove" onClick={function () { removeArrayItem('allergenen', idx); }}>×</button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <input className="tag-input" value={allergeenInput} onChange={function (e) { setAllergeenInput(e.target.value); }}
                                        onKeyDown={function (e) { handleTagKeyDown('allergenen', allergeenInput, setAllergeenInput, e); }}
                                        placeholder="Typ allergeen + Enter" />
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                    {ALLERGENEN_PRESETS.filter(function (p) { return !(form.allergenen || []).includes(p); }).map(function (p) {
                                        return <button key={p} type="button" className="preset-chip" onClick={function () { addArrayItem('allergenen', p, setAllergeenInput); }}>+ {p}</button>;
                                    })}
                                </div>
                            </div>

                            {/* Tags */}
                            <div className="field">
                                <label>🏷️ Labels <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optioneel)</span></label>
                                <div className="tag-input-container">
                                    <div className="tag-list">
                                        {(form.tags || []).map(function (t, idx) {
                                            return (
                                                <span key={idx} className="label-tag">
                                                    {t}
                                                    <button type="button" className="tag-remove" onClick={function () { removeArrayItem('tags', idx); }}>×</button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <input className="tag-input" value={labelInput} onChange={function (e) { setLabelInput(e.target.value); }}
                                        onKeyDown={function (e) { handleTagKeyDown('tags', labelInput, setLabelInput, e); }}
                                        placeholder="Typ label + Enter" />
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                    {TAG_PRESETS.filter(function (p) { return !(form.tags || []).includes(p); }).map(function (p) {
                                        return <button key={p} type="button" className="preset-chip" onClick={function () { addArrayItem('tags', p, setLabelInput); }}>+ {p}</button>;
                                    })}
                                </div>
                            </div>

                            {/* Kostprijs + Volgorde */}
                            <div className="form-grid">
                                <div className="field">
                                    <label>💰 Kostprijs p.p. <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optioneel)</span></label>
                                    <input type="number" step="0.01" value={form.kostprijs_pp || ''} onChange={function (e) { setForm(Object.assign({}, form, { kostprijs_pp: e.target.value })); }} placeholder="€0.00" />
                                </div>
                                <div className="field">
                                    <label>Volgorde</label>
                                    <input type="number" value={form.volgorde != null ? form.volgorde : ''} onChange={function (e) { setForm(Object.assign({}, form, { volgorde: e.target.value === '' ? '' : parseInt(e.target.value) })); }} />
                                </div>
                            </div>

                            {/* ═══ STATISTIEKEN ═══ */}
                            {editing !== 'new' && stats && (
                                <div className="gerecht-stats-panel">
                                    <div className="gerecht-stats-title">📊 Statistieken</div>
                                    <div className="gerecht-stats-grid">
                                        <div className="gerecht-stat-item">
                                            <div className="gerecht-stat-value">{stats.offCount}</div>
                                            <div className="gerecht-stat-label">Offertes</div>
                                        </div>
                                        <div className="gerecht-stat-item">
                                            <div className="gerecht-stat-value">{stats.servedCount}</div>
                                            <div className="gerecht-stat-label">Geserveerd</div>
                                        </div>
                                        <div className="gerecht-stat-item">
                                            <div className="gerecht-stat-value">{stats.avgTime ? formatTime(stats.avgTime) : '—'}</div>
                                            <div className="gerecht-stat-label">Gem. Tijd</div>
                                        </div>
                                    </div>
                                    {stats.offList.length > 0 && (
                                        <div style={{ marginTop: 10 }}>
                                            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Gebruikt in:</div>
                                            {stats.offList.map(function (o, i) {
                                                return (
                                                    <div key={i} style={{ fontSize: 12, padding: '3px 0', display: 'flex', justifyContent: 'space-between' }}>
                                                        <span>{o.naam}</span>
                                                        <span style={{ color: 'var(--muted)' }}>{o.datum}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="modal-actions">
                            {editing !== 'new' && <button className="btn btn-red btn-sm" onClick={function () { deleteGerecht(editing); }}>🗑️ Verwijderen</button>}
                            <button className="btn btn-ghost btn-sm" onClick={function () { setEditing(null); }}>Annuleren</button>
                            <button className="btn btn-brand btn-sm" onClick={saveGerecht}>💾 Opslaan</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ GANG MODAL ═══ */}
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
