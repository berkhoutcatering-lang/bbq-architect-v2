/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import PageHint from '@/components/PageHint';
import { Flame, Link, Unlink } from 'lucide-react';
import type { InventoryItem, Gang } from '@/types';

export default function Gerechten() {
    const showToast = useToast();
    const showConfirm = useConfirm();
    const { data: inventoryData } = useSupabase<InventoryItem>('inventory', []);
    const [gangen, setGangen] = useState<any[]>([]);
    const [gerechten, setGerechten] = useState<any[]>([]);
    const [activeGang, setActiveGang] = useState<string | null>(null);
    const [editing, setEditing] = useState<string | number | null>(null);
    const [form, setForm] = useState<Record<string, any>>({});
    const [gangEditing, setGangEditing] = useState<string | number | null>(null);
    const [gangForm, setGangForm] = useState<Record<string, any>>({});
    const [tagInput, setTagInput] = useState('');
    const [allergeenInput, setAllergeenInput] = useState('');
    const [labelInput, setLabelInput] = useState('');
    const [battleInput, setBattleInput] = useState('');
    const [uploading, setUploading] = useState(false);
    const [stats, setStats] = useState<Record<string, any> | null>(null);
    const [hwInput, setHwInput] = useState<Record<string, any>>({ naam: '', ratio: 1, buffer_pct: 10, min_extra: 0, categorie: 'servies' });
    const [costInput, setCostInput] = useState<Record<string, any>>({ naam: '', qty_pp: '', unit: 'kg', yield: 1.0 });
    const [dataLoading, setDataLoading] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const serviceImageRef = useRef<HTMLInputElement>(null);
    const WINKELS = ['Sligro', 'Crisp', 'PLUS', 'Overig'];
    const HW_CATS = ['servies', 'apparatuur', 'branding', 'meubilair'];
    const COST_UNITS = ['kg', 'g', 'L', 'ml', 'stuks'];

    useEffect(function () { loadData().finally(function () { setDataLoading(false); }); }, []);

    async function loadData() {
        const g = await supabase.from('gangen').select('*').order('volgorde');
        if (g.data) {
            setGangen(g.data);
            if (!activeGang && g.data.length > 0) setActiveGang(g.data[0].slug);
        }
        const r = await supabase.from('gerechten').select('*').order('volgorde');
        if (r.data) setGerechten(r.data);
    }

    function newGang() {
        setGangEditing('new');
        setGangForm({ naam: '', slug: '', minimum: 1, extra_prijs_pp: 0, volgorde: gangen.length + 1, actief: true });
    }
    function editGang(g: any) {
        setGangEditing(g.id);
        setGangForm({ naam: g.naam, slug: g.slug, minimum: g.minimum, extra_prijs_pp: g.extra_prijs_pp, volgorde: g.volgorde, actief: g.actief !== false });
    }
    async function saveGang() {
        if (!gangForm.naam || !gangForm.slug) { showToast('Vul naam en slug in', 'error'); return; }
        if (gangEditing === 'new') {
            const { error } = await supabase.from('gangen').insert([gangForm]);
            if (error) { showToast('Fout: ' + error.message, 'error'); return; }
            showToast('Gang toegevoegd!');
        } else {
            const { error } = await supabase.from('gangen').update(gangForm).eq('id', gangEditing);
            if (error) { showToast('Fout: ' + error.message, 'error'); return; }
            showToast('Gang bijgewerkt!');
        }
        setGangEditing(null);
        loadData();
    }
    async function deleteGang(id: number | string) {
        showConfirm('Weet je zeker dat je deze gang wilt verwijderen?', async function () {
            await supabase.from('gangen').delete().eq('id', id);
            showToast('Gang verwijderd');
            setGangEditing(null);
            loadData();
        });
    }

    function newGerecht() {
        setEditing('new');
        setForm({
            naam: '', beschrijving: '', gang_slug: activeGang,
            volgorde: gerechten.filter(function (g) { return g.gang_slug === activeGang; }).length + 1,
            foto_url: '', ingredienten: [], bereidingswijze: '',
            allergenen: [], tags: [], kostprijs_pp: '',
            service_image: '', battle_plan_steps: [], target_prep_time: 0,
            hardware_items: [], ingredienten_winkels: {},
            ingredient_costs: [], actief: false
        });
        setTagInput(''); setAllergeenInput(''); setLabelInput(''); setBattleInput('');
        setHwInput({ naam: '', ratio: 1, buffer_pct: 10, min_extra: 0, categorie: 'servies' });
        setCostInput({ naam: '', qty_pp: '', unit: 'kg', yield: 1.0 });
        setStats(null);
    }
    async function editGerecht(g: any) {
        setEditing(g.id);

        const rawIngs = g.ingredienten || [];
        const mappedIngs = Array.isArray(rawIngs) ? rawIngs : (typeof rawIngs === 'string' ? rawIngs.split(',').map(function (s: string) { return s.trim(); }).filter(Boolean) : []);

        setForm({
            naam: g.naam,
            beschrijving: g.beschrijving || '',
            gang_slug: g.gang_slug,
            volgorde: g.volgorde,
            foto_url: g.foto_url || '',
            ingredienten: mappedIngs.map(function (i: any) {
                if (typeof i === 'object' && i !== null) return (i.hoeveelheid ? i.hoeveelheid + (i.eenheid ? ' ' + i.eenheid + ' ' : ' ') : '') + (i.naam || JSON.stringify(i));
                return String(i);
            }),
            bereidingswijze: g.bereidingswijze || '',
            allergenen: g.allergenen || [],
            tags: g.tags || [],
            kostprijs_pp: g.kostprijs_pp || '',
            service_image: g.service_image || '',
            battle_plan_steps: g.battle_plan_steps || [],
            target_prep_time: g.target_prep_time || 0,
            hardware_items: g.hardware_items || [],
            ingredienten_winkels: g.ingredienten_winkels || {},
            ingredient_costs: g.ingredient_costs || [],
            actief: g.actief !== false
        });
        setTagInput(''); setAllergeenInput(''); setLabelInput(''); setBattleInput('');
        setHwInput({ naam: '', ratio: 1, buffer_pct: 10, min_extra: 0, categorie: 'servies' });
        setCostInput({ naam: '', qty_pp: '', unit: 'kg', yield: 1.0 });
        loadStats(g.naam);
    }

    async function loadStats(naam: string) {
        const offRes = await supabase.from('offertes').select('id, client_naam, datum, menu_selectie').not('menu_selectie', 'is', null);
        let offCount = 0;
        const offList: { naam: string; datum: string }[] = [];
        if (offRes.data) {
            offRes.data.forEach(function (o: any) {
                const sel = typeof o.menu_selectie === 'string' ? JSON.parse(o.menu_selectie) : o.menu_selectie;
                let found = false;
                Object.values(sel || {}).forEach(function (dishes: any) {
                    if (dishes && dishes.indexOf(naam) >= 0) found = true;
                });
                if (found) { offCount++; offList.push({ naam: o.client_naam, datum: o.datum }); }
            });
        }

        const servRes = await supabase.from('service_logs').select('duration_seconds, gang_slug').not('served_at', 'is', null);
        let totalTime = 0; let timeCount = 0;
        if (servRes.data) {
            servRes.data.forEach(function (log: any) {
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
        const saveData = Object.assign({}, form);
        if (saveData.kostprijs_pp === '' || saveData.kostprijs_pp === null) saveData.kostprijs_pp = 0;
        else saveData.kostprijs_pp = parseFloat(saveData.kostprijs_pp) || 0;

        const dbData: Record<string, any> = Object.assign({}, saveData);

        if (editing === 'new') {
            const { error } = await supabase.from('gerechten').insert([dbData]);
            if (error) { showToast('Fout: ' + error.message, 'error'); return; }
            showToast('Gerecht toegevoegd!');
        } else {
            const { error } = await supabase.from('gerechten').update(dbData).eq('id', editing);
            if (error) { showToast('Fout: ' + error.message, 'error'); return; }
            showToast('Gerecht bijgewerkt!');
        }
        setEditing(null);
        loadData();
    }
    async function deleteGerecht(id: number | string) {
        showConfirm('Weet je zeker dat je dit gerecht wilt verwijderen?', async function () {
            await supabase.from('gerechten').delete().eq('id', id);
            showToast('Gerecht verwijderd');
            setEditing(null);
            loadData();
        });
    }

    async function handleFotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        const ext = file.name.split('.').pop();
        const fileName = 'gerecht_' + Date.now() + '.' + ext;

        const { data, error } = await supabase.storage
            .from('gerechten-fotos')
            .upload(fileName, file, { cacheControl: '3600', upsert: true });

        if (error) {
            showToast('Upload fout: ' + error.message, 'error');
            setUploading(false);
            return;
        }

        const { data: urlData } = supabase.storage
            .from('gerechten-fotos')
            .getPublicUrl(fileName);

        setForm(Object.assign({}, form, { foto_url: urlData.publicUrl }));
        setUploading(false);
        showToast('📸 Foto geüpload!');
    }

    async function handleServiceImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        const ext = file.name.split('.').pop();
        const fileName = 'service_' + Date.now() + '.' + ext;
        const { data, error } = await supabase.storage
            .from('gerechten-fotos')
            .upload(fileName, file, { cacheControl: '3600', upsert: true });
        if (error) {
            showToast('Upload fout: ' + error.message, 'error');
            setUploading(false);
            return;
        }
        const { data: urlData } = supabase.storage
            .from('gerechten-fotos')
            .getPublicUrl(fileName);
        setForm(Object.assign({}, form, { service_image: urlData.publicUrl }));
        setUploading(false);
        showToast('🎯 Service foto geüpload!');
    }

    function addArrayItem(field: string, value: string, setter: (v: string) => void) {
        const current = form[field] || [];
        if (value.trim() && !current.includes(value.trim())) {
            setForm(Object.assign({}, form, { [field]: current.concat([value.trim()]) }));
        }
        setter('');
    }
    function removeArrayItem(field: string, idx: number) {
        const current = (form[field] || []).slice();
        current.splice(idx, 1);
        setForm(Object.assign({}, form, { [field]: current }));
    }
    function handleTagKeyDown(field: string, value: string, setter: (v: string) => void, e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter' && value.trim()) {
            e.preventDefault();
            addArrayItem(field, value, setter);
        }
    }

    function addHardwareItem() {
        if (!hwInput.naam.trim()) return;
        const items = (form.hardware_items || []).concat([Object.assign({}, hwInput, { naam: hwInput.naam.trim() })]);
        setForm(Object.assign({}, form, { hardware_items: items }));
        setHwInput({ naam: '', ratio: 1, buffer_pct: 10, min_extra: 0, categorie: 'servies' });
    }
    function removeHardwareItem(idx: number) {
        const items = (form.hardware_items || []).slice();
        items.splice(idx, 1);
        setForm(Object.assign({}, form, { hardware_items: items }));
    }
    function setWinkelTag(ingredient: string, winkel: string) {
        const winkels = Object.assign({}, form.ingredienten_winkels || {});
        if (winkel) winkels[ingredient] = winkel;
        else delete winkels[ingredient];
        setForm(Object.assign({}, form, { ingredienten_winkels: winkels }));
    }

    function addCostItem() {
        if (!costInput.naam.trim()) return;
        const items = (form.ingredient_costs || []).concat([Object.assign({}, costInput, { naam: costInput.naam.trim(), qty_pp: parseFloat(costInput.qty_pp) || 0, yield: parseFloat(costInput.yield) || 1.0 })]);
        setForm(Object.assign({}, form, { ingredient_costs: items }));
        setCostInput({ naam: '', qty_pp: '', unit: 'kg', yield: 1.0 });
    }
    function removeCostItem(idx: number) {
        const items = (form.ingredient_costs || []).slice();
        items.splice(idx, 1);
        setForm(Object.assign({}, form, { ingredient_costs: items }));
    }
    function getInvPrice(naam: string) {
        const inv = inventoryData.find(function (i) { return i.naam && i.naam.toLowerCase() === naam.toLowerCase(); });
        return inv ? { price: inv.purchase_price || 0, unit: inv.unit || 'kg', yield_factor: inv.yield_factor || 1.0 } : null;
    }
    function calcCostPP(item: any) {
        const inv = getInvPrice(item.naam);
        const price = inv ? inv.price : 0;
        const yld = item.yield || (inv ? inv.yield_factor : 1.0) || 1.0;
        let unitFactor = 1;
        if (item.unit === 'g' && inv && inv.unit === 'kg') unitFactor = 0.001;
        if (item.unit === 'ml' && inv && inv.unit === 'L') unitFactor = 0.001;
        return ((item.qty_pp || 0) * unitFactor / yld) * price;
    }
    const totalFoodcostPP = (form.ingredient_costs || []).reduce(function (sum: number, item: any) { return sum + calcCostPP(item); }, 0);

    function formatTime(seconds: number) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    const gangGerechten = gerechten.filter(function (g) { return g.gang_slug === activeGang; });
    const currentGang = gangen.find(function (g) { return g.slug === activeGang; });

    const ALLERGENEN_PRESETS = ['Glutenvrij', 'Lactosevrij', 'Notenvrij', 'Vegetarisch', 'Veganistisch', 'Vis', 'Schaaldieren'];
    const TAG_PRESETS = ['Vega', 'Vegan', 'Signature', 'Populair', 'Nieuw', 'Seizoen'];

    if (dataLoading) {
        return (
            <div className="min-h-screen bg-[#121215] flex items-center justify-center">
                <Flame className="w-8 h-8 text-[#c4a35a] animate-pulse" />
            </div>
        );
    }

    return (
        <div className="main-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>🍽️ Gerechten Beheer</h2>
                <button className="btn btn-ghost btn-sm" onClick={newGang}>⚙️ Gang Toevoegen</button>
            </div>

            <PageHint id="gerechten" title="Gerechten" description="Overzicht van al je gerechten met ingredienten en kostprijzen. Koppel gerechten aan gangen voor menu-samenstelling." />

            <div className="tab-bar">
                {gangen.map(function (g) {
                    const count = gerechten.filter(function (gr) { return gr.gang_slug === g.slug; }).length;
                    return (
                        <button
                            key={g.slug}
                            className={'tab-btn' + (activeGang === g.slug ? ' active' : '')}
                            onClick={function () { setActiveGang(g.slug); setEditing(null); }}
                        >
                            {g.naam}
                            <span style={{ fontSize: 12, opacity: 0.5, marginLeft: 4 }}>
                                ({count})
                            </span>
                        </button>
                    );
                })}
            </div>

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

            {gangGerechten.length === 0 && <EmptyState page="/gerechten" onAction={newGerecht} />}

            <div className="dish-grid">
                {gangGerechten.map(function (g) {
                    return (
                        <div key={g.id} className="dish-card" onClick={function () { editGerecht(g); }} style={{ opacity: g.actief === false ? 0.55 : 1 }}>
                            {g.foto_url && (
                                <div className="dish-foto-preview" style={{ backgroundImage: 'url(' + g.foto_url + ')' }}></div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <div className="dish-name" style={{ margin: 0, flex: 1 }}>{g.naam}</div>
                                {g.actief === false && <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, background: 'rgba(239,68,68,.15)', color: '#ef4444', fontWeight: 700, flexShrink: 0 }}>inactief</span>}
                            </div>
                            <div className="dish-desc">{g.beschrijving || '—'}</div>

                            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {(g.tags || []).map(function (tag: string, i: number) {
                                    return <span key={'t' + i} className="dish-tag-chip">{tag}</span>;
                                })}
                                {(g.allergenen || []).map(function (a: string, i: number) {
                                    return <span key={'a' + i} className="dish-allergen-chip">{a}</span>;
                                })}
                            </div>

                            {g.ingredienten && g.ingredienten.length > 0 && (
                                <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                    {g.ingredienten.slice(0, 3).map(function (ing: any, i: number) {
                                        const rawText = typeof ing === 'object' && ing !== null ? (ing.hoeveelheid ? ing.hoeveelheid + (ing.eenheid ? ' ' + ing.eenheid + ' ' : ' ') : '') + (ing.naam || JSON.stringify(ing)) : ing;
                                        return <span key={i} className="ingredient-chip-small">{rawText}</span>;
                                    })}
                                    {g.ingredienten.length > 3 && <span className="ingredient-chip-small" style={{ opacity: 0.4 }}>+{g.ingredienten.length - 3}</span>}
                                </div>
                            )}

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

            {editing && (
                <div className="modal-bg" onClick={function (e: React.MouseEvent<HTMLDivElement>) { if (e.target === e.currentTarget) setEditing(null); }}>
                    <div className="modal-box" style={{ maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h3>{editing === 'new' ? '➕ Nieuw Gerecht' : '✏️ Gerecht Bewerken'}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>

                            <div className="field">
                                <label>📸 Foto</label>
                                {form.foto_url ? (
                                    <div className="foto-upload-zone has-foto">
                                        <img src={form.foto_url} alt="Gerecht" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 8 }} />
                                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                            <button type="button" className="btn btn-ghost btn-sm" onClick={function () { fileInputRef.current!.click(); }}>🔄 Vervangen</button>
                                            <button type="button" className="btn btn-ghost btn-sm" onClick={function () { setForm(Object.assign({}, form, { foto_url: '' })); }}>🗑️ Verwijder</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="foto-upload-zone" onClick={function () { fileInputRef.current!.click(); }}>
                                        {uploading ? <span style={{ color: '#B48C14' }}>⏳ Uploaden...</span> : <span>📷 Klik om foto te uploaden</span>}
                                    </div>
                                )}
                                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFotoUpload} />
                            </div>

                            <div className="form-grid">
                                <div className="field">
                                    <label>Naam</label>
                                    <input value={form.naam || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { naam: e.target.value })); }} placeholder="bijv. Crispy Zalm" />
                                </div>
                                <div className="field">
                                    <label>Gang</label>
                                    <select value={form.gang_slug || ''} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setForm(Object.assign({}, form, { gang_slug: e.target.value })); }}>
                                        {gangen.map(function (g) { return <option key={g.slug} value={g.slug}>{g.naam}</option>; })}
                                    </select>
                                </div>
                            </div>

                            <div className="field">
                                <label>Beschrijving</label>
                                <input value={form.beschrijving || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { beschrijving: e.target.value })); }} placeholder="bijv. Krokant gyoza vel met gerookte zalm" />
                            </div>

                            <div className="field">
                                <label>🧾 Ingrediënten</label>
                                <div className="tag-input-container">
                                    <div className="tag-list">
                                        {(form.ingredienten || []).map(function (tag: string, idx: number) {
                                            return (
                                                <span key={idx} className="ingredient-tag">
                                                    {tag}
                                                    <button type="button" className="tag-remove" onClick={function () { removeArrayItem('ingredienten', idx); }}>×</button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <input className="tag-input" value={tagInput} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setTagInput(e.target.value); }}
                                        onKeyDown={function (e: React.KeyboardEvent<HTMLInputElement>) { handleTagKeyDown('ingredienten', tagInput, setTagInput, e); }}
                                        placeholder="Typ ingrediënt + Enter" />
                                </div>
                            </div>

                            <div className="field">
                                <label>👨‍🍳 Bereidingswijze / Opbouw</label>
                                <textarea value={form.bereidingswijze || ''}
                                    onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setForm(Object.assign({}, form, { bereidingswijze: e.target.value })); }}
                                    placeholder="bijv. Krokant gyoza vel met gerookte zalm en mierikswortel mayo, garneer met borage cress"
                                    rows={3} style={{ resize: 'vertical' }} />
                            </div>

                            <div style={{ borderTop: '1px solid rgba(180,140,20,.15)', paddingTop: 14, marginTop: 4 }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: '#B48C14', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
                                    🔥 The Architect — Service Mode
                                </div>

                                <div className="field">
                                    <label>🎯 Service Foto <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(perfecte opmaak)</span></label>
                                    {form.service_image ? (
                                        <div className="foto-upload-zone has-foto">
                                            <img src={form.service_image} alt="Service" style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 8 }} />
                                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                                <button type="button" className="btn btn-ghost btn-sm" onClick={function () { serviceImageRef.current!.click(); }}>🔄 Vervangen</button>
                                                <button type="button" className="btn btn-ghost btn-sm" onClick={function () { setForm(Object.assign({}, form, { service_image: '' })); }}>🗑️ Verwijder</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="foto-upload-zone" onClick={function () { serviceImageRef.current!.click(); }} style={{ borderColor: 'rgba(180,140,20,.2)' }}>
                                            {uploading ? <span style={{ color: '#B48C14' }}>⏳ Uploaden...</span> : <span>🎯 Klik om service foto te uploaden</span>}
                                        </div>
                                    )}
                                    <input ref={serviceImageRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleServiceImageUpload} />
                                </div>

                                <div className="field">
                                    <label>⚔️ Battle Plan <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(stappen voor de chef)</span></label>
                                    <div className="tag-input-container">
                                        <div className="tag-list">
                                            {(form.battle_plan_steps || []).map(function (step: string, idx: number) {
                                                return (
                                                    <span key={idx} className="battle-step-tag">
                                                        <span style={{ color: '#B48C14', fontWeight: 700, marginRight: 4 }}>{idx + 1}.</span>
                                                        {step}
                                                        <button type="button" className="tag-remove" onClick={function () { removeArrayItem('battle_plan_steps', idx); }}>×</button>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                        <input className="tag-input" value={battleInput} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setBattleInput(e.target.value); }}
                                            onKeyDown={function (e: React.KeyboardEvent<HTMLInputElement>) { handleTagKeyDown('battle_plan_steps', battleInput, setBattleInput, e); }}
                                            placeholder="Typ stap + Enter (bijv. Flat Top 220°C)" />
                                    </div>
                                </div>

                                <div className="field">
                                    <label>⏱️ Doeltijd <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optioneel, in seconden)</span></label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <input type="number" min="0" step="30" value={form.target_prep_time || ''}
                                            onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { target_prep_time: e.target.value === '' ? 0 : parseInt(e.target.value) })); }}
                                            placeholder="bijv. 300 (= 5 min)" style={{ maxWidth: 160 }} />
                                        {form.target_prep_time > 0 && (
                                            <span style={{ fontSize: 13, color: '#B48C14', fontWeight: 600 }}>
                                                = {formatTime(form.target_prep_time)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div style={{ borderTop: '1px solid rgba(180,140,20,.15)', paddingTop: 14, marginTop: 4 }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: '#B48C14', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
                                    🍽️ Hardware per Gast
                                </div>

                                {(form.hardware_items || []).length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                                        {(form.hardware_items || []).map(function (hw: any, idx: number) {
                                            return (
                                                <div key={idx} className="hw-item-row">
                                                    <span className="hw-item-cat">{hw.categorie === 'servies' ? '🍽️' : hw.categorie === 'apparatuur' ? '🔥' : hw.categorie === 'branding' ? '💡' : '🪑'}</span>
                                                    <span className="hw-item-name">{hw.naam}</span>
                                                    <span className="hw-item-detail">×{hw.ratio}/gast</span>
                                                    <span className="hw-item-detail">+{hw.buffer_pct}%</span>
                                                    {hw.min_extra > 0 && <span className="hw-item-detail">+{hw.min_extra} extra</span>}
                                                    <button type="button" className="tag-remove" onClick={function () { removeHardwareItem(idx); }}>×</button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                    <div className="field" style={{ flex: 2, minWidth: 120 }}>
                                        <label>Item naam</label>
                                        <input value={hwInput.naam} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setHwInput(Object.assign({}, hwInput, { naam: e.target.value })); }}
                                            onKeyDown={function (e: React.KeyboardEvent<HTMLInputElement>) { if (e.key === 'Enter') { e.preventDefault(); addHardwareItem(); } }}
                                            placeholder="bijv. Churchill Dessertbord" style={{ fontSize: 12, padding: '7px 10px' }} />
                                    </div>
                                    <div className="field" style={{ minWidth: 60, flex: '0 1 70px' }}>
                                        <label>Ratio</label>
                                        <input type="number" step="0.1" min="0" value={hwInput.ratio}
                                            onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setHwInput(Object.assign({}, hwInput, { ratio: parseFloat(e.target.value) || 0 })); }}
                                            style={{ fontSize: 12, padding: '7px 10px' }} />
                                    </div>
                                    <div className="field" style={{ minWidth: 60, flex: '0 1 70px' }}>
                                        <label>Buffer%</label>
                                        <input type="number" min="0" value={hwInput.buffer_pct}
                                            onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setHwInput(Object.assign({}, hwInput, { buffer_pct: parseInt(e.target.value) || 0 })); }}
                                            style={{ fontSize: 12, padding: '7px 10px' }} />
                                    </div>
                                    <div className="field" style={{ minWidth: 70, flex: '0 1 80px' }}>
                                        <label>Categorie</label>
                                        <select value={hwInput.categorie} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setHwInput(Object.assign({}, hwInput, { categorie: e.target.value })); }}
                                            style={{ fontSize: 12, padding: '7px 6px' }}>
                                            {HW_CATS.map(function (c) { return <option key={c} value={c}>{c}</option>; })}
                                        </select>
                                    </div>
                                    <button type="button" className="btn btn-brand btn-sm" onClick={addHardwareItem} style={{ height: 34 }}>+</button>
                                </div>
                            </div>

                            {(form.ingredienten || []).length > 0 && (
                                <div style={{ borderTop: '1px solid rgba(180,140,20,.15)', paddingTop: 14, marginTop: 4 }}>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: '#B48C14', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
                                        🛒 Winkel per Ingrediënt
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {(form.ingredienten || []).map(function (ing: string, idx: number) {
                                            const currentWinkel = (form.ingredienten_winkels || {})[ing] || '';
                                            return (
                                                <div key={idx} className="winkel-tag-row">
                                                    <span className="winkel-tag-name">{ing}</span>
                                                    <select className="winkel-tag-select" value={currentWinkel}
                                                        onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setWinkelTag(ing, e.target.value); }}>
                                                        <option value="">—</option>
                                                        {WINKELS.map(function (w) { return <option key={w} value={w}>{w}</option>; })}
                                                    </select>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div style={{ borderTop: '1px solid rgba(180,140,20,.15)', paddingTop: 14, marginTop: 4 }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: '#B48C14', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
                                    💰 Kostprijsberekening
                                </div>

                                {(form.ingredient_costs || []).length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                                        {(form.ingredient_costs || []).map(function (item: any, idx: number) {
                                            const inv = getInvPrice(item.naam);
                                            const costPP = calcCostPP(item);
                                            return (
                                                <div key={idx} className="ingredient-cost-row">
                                                    <div className="ingredient-cost-info">
                                                        <span className="ingredient-cost-name">{item.naam}</span>
                                                        {inv ? (
                                                            <span className="ingredient-cost-linked"><Link size={14} /> €{inv.price.toFixed(2)}/{inv.unit}</span>
                                                        ) : (
                                                            <span className="ingredient-cost-unlinked"><Unlink size={14} /> niet in voorraad</span>
                                                        )}
                                                    </div>
                                                    <div className="ingredient-cost-details">
                                                        <span className="ingredient-cost-chip">{item.qty_pp} {item.unit}/gast</span>
                                                        {item.yield && item.yield < 1 && <span className="ingredient-cost-chip">yield {(item.yield * 100).toFixed(0)}%</span>}
                                                        <span className={'ingredient-cost-price' + (costPP > 0 ? '' : ' empty')}>€{costPP.toFixed(2)}</span>
                                                    </div>
                                                    <button type="button" className="tag-remove" onClick={function () { removeCostItem(idx); }}>×</button>
                                                </div>
                                            );
                                        })}

                                        <div className="ingredient-cost-total">
                                            <span>Totale Foodcost p.p.</span>
                                            <span className="ingredient-cost-total-value">€{totalFoodcostPP.toFixed(2)}</span>
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                    <div className="field" style={{ flex: 2, minWidth: 120 }}>
                                        <label>Ingrediënt</label>
                                        <input value={costInput.naam} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setCostInput(Object.assign({}, costInput, { naam: e.target.value })); }}
                                            onKeyDown={function (e: React.KeyboardEvent<HTMLInputElement>) { if (e.key === 'Enter') { e.preventDefault(); addCostItem(); } }}
                                            placeholder="bijv. Bavette" style={{ fontSize: 12, padding: '7px 10px' }}
                                            list="inv-suggestions" />
                                        <datalist id="inv-suggestions">
                                            {inventoryData.map(function (inv) { return <option key={inv.id} value={inv.naam} />; })}
                                        </datalist>
                                    </div>
                                    <div className="field" style={{ minWidth: 70, flex: '0 1 80px' }}>
                                        <label>Qty p.p.</label>
                                        <input type="number" step="0.01" min="0" value={costInput.qty_pp}
                                            onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setCostInput(Object.assign({}, costInput, { qty_pp: e.target.value })); }}
                                            placeholder="0.08" style={{ fontSize: 12, padding: '7px 10px' }} />
                                    </div>
                                    <div className="field" style={{ minWidth: 60, flex: '0 1 70px' }}>
                                        <label>Eenheid</label>
                                        <select value={costInput.unit} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setCostInput(Object.assign({}, costInput, { unit: e.target.value })); }}
                                            style={{ fontSize: 12, padding: '7px 6px' }}>
                                            {COST_UNITS.map(function (u) { return <option key={u} value={u}>{u}</option>; })}
                                        </select>
                                    </div>
                                    <div className="field" style={{ minWidth: 60, flex: '0 1 70px' }}>
                                        <label>Yield</label>
                                        <input type="number" step="0.05" min="0.1" max="1" value={costInput.yield}
                                            onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setCostInput(Object.assign({}, costInput, { yield: parseFloat(e.target.value) || 1.0 })); }}
                                            style={{ fontSize: 12, padding: '7px 10px' }} />
                                    </div>
                                    <button type="button" className="btn btn-brand btn-sm" onClick={addCostItem} style={{ height: 34 }}>+</button>
                                </div>
                            </div>

                            <div className="field">
                                <label>⚠️ Allergenen <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optioneel)</span></label>
                                <div className="tag-input-container">
                                    <div className="tag-list">
                                        {(form.allergenen || []).map(function (a: string, idx: number) {
                                            return (
                                                <span key={idx} className="allergen-tag">
                                                    {a}
                                                    <button type="button" className="tag-remove" onClick={function () { removeArrayItem('allergenen', idx); }}>×</button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <input className="tag-input" value={allergeenInput} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setAllergeenInput(e.target.value); }}
                                        onKeyDown={function (e: React.KeyboardEvent<HTMLInputElement>) { handleTagKeyDown('allergenen', allergeenInput, setAllergeenInput, e); }}
                                        placeholder="Typ allergeen + Enter" />
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                    {ALLERGENEN_PRESETS.filter(function (p) { return !(form.allergenen || []).includes(p); }).map(function (p) {
                                        return <button key={p} type="button" className="preset-chip" onClick={function () { addArrayItem('allergenen', p, setAllergeenInput); }}>+ {p}</button>;
                                    })}
                                </div>
                            </div>

                            <div className="field">
                                <label>🏷️ Labels <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optioneel)</span></label>
                                <div className="tag-input-container">
                                    <div className="tag-list">
                                        {(form.tags || []).map(function (t: string, idx: number) {
                                            return (
                                                <span key={idx} className="label-tag">
                                                    {t}
                                                    <button type="button" className="tag-remove" onClick={function () { removeArrayItem('tags', idx); }}>×</button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <input className="tag-input" value={labelInput} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setLabelInput(e.target.value); }}
                                        onKeyDown={function (e: React.KeyboardEvent<HTMLInputElement>) { handleTagKeyDown('tags', labelInput, setLabelInput, e); }}
                                        placeholder="Typ label + Enter" />
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                    {TAG_PRESETS.filter(function (p) { return !(form.tags || []).includes(p); }).map(function (p) {
                                        return <button key={p} type="button" className="preset-chip" onClick={function () { addArrayItem('tags', p, setLabelInput); }}>+ {p}</button>;
                                    })}
                                </div>
                            </div>

                            <div className="form-grid">
                                <div className="field">
                                    <label>💰 Kostprijs p.p. <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optioneel)</span></label>
                                    <input type="number" step="0.01" value={form.kostprijs_pp || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { kostprijs_pp: e.target.value })); }} placeholder="€0.00" />
                                </div>
                                <div className="field">
                                    <label>Volgorde</label>
                                    <input type="number" value={form.volgorde != null ? form.volgorde : ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setForm(Object.assign({}, form, { volgorde: e.target.value === '' ? '' : parseInt(e.target.value) })); }} />
                                </div>
                            </div>

                            <div className="field">
                                <label>Status</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <button
                                        type="button"
                                        onClick={function () { setForm(Object.assign({}, form, { actief: !form.actief })); }}
                                        style={{
                                            padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                            fontWeight: 700, fontSize: 12, transition: 'all .15s',
                                            background: form.actief ? 'rgba(74,222,128,.15)' : 'rgba(239,68,68,.1)',
                                            color: form.actief ? '#4ade80' : '#ef4444',
                                        }}
                                    >
                                        {form.actief ? '✅ Actief' : '⏸ Inactief'}
                                    </button>
                                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                                        {form.actief ? 'Zichtbaar in offertes en menu' : 'Verborgen — niet beschikbaar voor offertes'}
                                    </span>
                                </div>
                            </div>

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
                                            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Gebruikt in:</div>
                                            {stats.offList.map(function (o: any, i: number) {
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
                            {editing !== 'new' && <button className="btn btn-red btn-sm" onClick={function () { deleteGerecht(editing as number); }}>🗑️ Verwijderen</button>}
                            <button className="btn btn-ghost btn-sm" onClick={function () { setEditing(null); }}>Annuleren</button>
                            <button className="btn btn-brand btn-sm" onClick={saveGerecht}>💾 Opslaan</button>
                        </div>
                    </div>
                </div>
            )}

            {gangEditing && (
                <div className="modal-bg" onClick={function (e: React.MouseEvent<HTMLDivElement>) { if (e.target === e.currentTarget) setGangEditing(null); }}>
                    <div className="modal-box" style={{ maxWidth: 440, width: '100%' }}>
                        <h3>{gangEditing === 'new' ? '➕ Nieuwe Gang' : '⚙️ Gang Bewerken'}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                            <div className="field">
                                <label>Naam</label>
                                <input value={gangForm.naam || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setGangForm(Object.assign({}, gangForm, { naam: e.target.value })); }} placeholder="bijv. Bites" />
                            </div>
                            <div className="field">
                                <label>Slug (code-naam)</label>
                                <input value={gangForm.slug || ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setGangForm(Object.assign({}, gangForm, { slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })); }} placeholder="bijv. bites" />
                            </div>
                            <div className="form-grid">
                                <div className="field">
                                    <label>Minimum selectie</label>
                                    <input type="number" value={gangForm.minimum != null ? gangForm.minimum : ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setGangForm(Object.assign({}, gangForm, { minimum: e.target.value === '' ? '' : parseInt(e.target.value) })); }} />
                                </div>
                                <div className="field">
                                    <label>Extra prijs p.p. (€)</label>
                                    <input type="number" step="0.25" value={gangForm.extra_prijs_pp != null ? gangForm.extra_prijs_pp : ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setGangForm(Object.assign({}, gangForm, { extra_prijs_pp: e.target.value === '' ? '' : parseFloat(e.target.value) })); }} />
                                </div>
                            </div>
                            <div className="field">
                                <label>Volgorde</label>
                                <input type="number" value={gangForm.volgorde != null ? gangForm.volgorde : ''} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setGangForm(Object.assign({}, gangForm, { volgorde: e.target.value === '' ? '' : parseInt(e.target.value) })); }} />
                            </div>
                        </div>
                        <div className="modal-actions">
                            {gangEditing !== 'new' && <button className="btn btn-red btn-sm" onClick={function () { deleteGang(gangEditing as number); }}>🗑️ Verwijderen</button>}
                            <button className="btn btn-ghost btn-sm" onClick={function () { setGangEditing(null); }}>Annuleren</button>
                            <button className="btn btn-brand btn-sm" onClick={saveGang}>💾 Opslaan</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
