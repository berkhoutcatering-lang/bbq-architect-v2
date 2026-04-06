/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { fmtNl } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import type { Klant } from '@/types';

export default function KlantenPage() {
    return <Suspense fallback={<div style={{ padding: 24, color: 'var(--muted)' }}>Laden...</div>}><Klanten /></Suspense>;
}

function Klanten() {
    const { data: klanten, insert, update, remove } = useSupabase<Klant>('klanten', []);
    const showToast = useToast();
    const showConfirm = useConfirm();
    const searchParams = useSearchParams();
    const initialZoek = searchParams.get('zoek') || '';

    const [editing, setEditing] = useState<string | number | null>(null);
    const [form, setForm] = useState<Record<string, any> | null>(null);
    const [searchQuery, setSearchQuery] = useState(initialZoek);
    const [filterType, setFilterType] = useState<string>('alle');

    // Fetch linked offertes & events counts per klant
    const [klantStats, setKlantStats] = useState<Record<string, { offertes: number; events: number; omzet: number }>>({});

    function loadStats(naam: string) {
        if (klantStats[naam]) return;
        Promise.all([
            supabase.from('offertes').select('id,items', { count: 'exact' }).eq('client_naam', naam),
            supabase.from('events').select('id,guests,ppp', { count: 'exact' }).eq('client_naam', naam),
        ]).then(function ([offRes, evRes]) {
            let omzet = 0;
            (offRes.data || []).forEach(function (o: any) {
                (o.items || []).forEach(function (i: any) { omzet += (i.qty || 0) * (i.prijs || 0); });
            });
            (evRes.data || []).forEach(function (e: any) { omzet += (e.guests || 0) * (e.ppp || 0); });
            setKlantStats(function (prev) {
                return Object.assign({}, prev, {
                    [naam]: { offertes: offRes.count || 0, events: evRes.count || 0, omzet: omzet }
                });
            });
        });
    }

    function newKlant() {
        setEditing('new');
        setForm({ naam: '', bedrijf: '', adres: '', postcode: '', plaats: '', telefoon: '', email: '', type: 'Particulier', notities: '' });
    }

    function editKlant(k: Klant) {
        setEditing(k.id);
        setForm(JSON.parse(JSON.stringify(k)));
        loadStats(k.naam);
    }

    function setField(key: string, val: any) { setForm(Object.assign({}, form, { [key]: val })); }

    function saveKlant() {
        if (!form!.naam) { showToast('Vul een naam in', 'error'); return; }
        if (editing === 'new') {
            insert(form!).then(function () {
                showToast('Klant aangemaakt', 'success');
                setEditing(null); setForm(null);
            });
        } else {
            const { id, created_at, ...rest } = form!;
            update(editing as number, rest).then(function () {
                showToast('Klant bijgewerkt', 'success');
                setEditing(null); setForm(null);
            });
        }
    }

    function deleteKlant() {
        showConfirm('Weet je zeker dat je deze klant wilt verwijderen?', function () {
            remove(editing as number).then(function () {
                showToast('Klant verwijderd', 'success');
                setEditing(null); setForm(null);
            });
        });
    }

    const fmt = (n: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);

    if (editing !== null && form) {
        const stats = klantStats[form.naam];
        return (
            <div className="panel">
                <div className="panel-head">
                    <h3>{editing === 'new' ? 'Nieuwe Klant' : 'Klant Bewerken'}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={function () { setEditing(null); setForm(null); }}><i className="fa-solid fa-arrow-left"></i> Terug</button>
                </div>
                <div className="panel-body">
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', marginBottom: 12 }}>Contactgegevens</h4>
                    <div className="form-grid">
                        <div className="field full"><label>Naam / Contactpersoon</label><input value={form.naam} onChange={function (e) { setField('naam', e.target.value); }} /></div>
                        <div className="field"><label>Bedrijfsnaam</label><input value={form.bedrijf || ''} onChange={function (e) { setField('bedrijf', e.target.value); }} /></div>
                        <div className="field"><label>Type</label>
                            <select value={form.type} onChange={function (e) { setField('type', e.target.value); }}>
                                {['Particulier', 'Zakelijk', 'Festival', 'Horeca'].map(function (t) { return <option key={t}>{t}</option>; })}
                            </select>
                        </div>
                        <div className="field"><label>Email</label><input type="email" value={form.email || ''} onChange={function (e) { setField('email', e.target.value); }} /></div>
                        <div className="field"><label>Telefoon</label><input value={form.telefoon || ''} onChange={function (e) { setField('telefoon', e.target.value); }} /></div>
                        <div className="field full"><label>Adres</label><input value={form.adres || ''} onChange={function (e) { setField('adres', e.target.value); }} /></div>
                        <div className="field"><label>Postcode</label><input value={form.postcode || ''} onChange={function (e) { setField('postcode', e.target.value); }} /></div>
                        <div className="field"><label>Plaats</label><input value={form.plaats || ''} onChange={function (e) { setField('plaats', e.target.value); }} /></div>
                        <div className="field full"><label>Notities</label><textarea rows={3} value={form.notities || ''} onChange={function (e) { setField('notities', e.target.value); }} /></div>
                    </div>

                    {stats && (
                        <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                            <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', marginBottom: 12 }}>
                                <i className="fa-solid fa-chart-bar" style={{ marginRight: 6 }}></i>Klant Overzicht
                            </h4>
                            <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                                <div className="stat-card">
                                    <div className="stat-label">Offertes</div>
                                    <div className="stat-val">{stats.offertes}</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-label">Events</div>
                                    <div className="stat-val">{stats.events}</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-label">Totale Waarde</div>
                                    <div className="stat-val" style={{ color: 'var(--brand)' }}>{fmt(stats.omzet)}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="editor-actions">
                        <button className="btn btn-brand" onClick={saveKlant}><i className="fa-solid fa-save"></i> Opslaan</button>
                        {editing !== 'new' && <button className="btn btn-red" onClick={deleteKlant}><i className="fa-solid fa-trash"></i> Verwijderen</button>}
                    </div>
                </div>
            </div>
        );
    }

    const filtered = klanten.filter(function (k) {
        if (filterType !== 'alle' && k.type !== filterType) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (k.naam || '').toLowerCase().includes(q) ||
                (k.bedrijf || '').toLowerCase().includes(q) ||
                (k.email || '').toLowerCase().includes(q) ||
                (k.plaats || '').toLowerCase().includes(q);
        }
        return true;
    }).sort(function (a, b) { return (a.naam || '').localeCompare(b.naam || ''); });

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>Klanten ({filtered.length}{filtered.length !== klanten.length ? ' / ' + klanten.length : ''})</h3>
                <button className="btn btn-brand" onClick={newKlant}><i className="fa-solid fa-plus"></i> Nieuwe Klant</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    value={searchQuery}
                    onChange={function (e) { setSearchQuery(e.target.value); }}
                    placeholder="Zoek op naam, bedrijf, email, plaats..."
                    style={{ flex: 1, minWidth: 180, padding: '7px 12px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
                />
                {['alle', 'Particulier', 'Zakelijk', 'Festival', 'Horeca'].map(function (s) {
                    return <button key={s} className={'btn btn-sm ' + (filterType === s ? 'btn-brand' : 'btn-ghost')}
                        onClick={function () { setFilterType(s); }}
                        style={{ fontSize: 11 }}>{s === 'alle' ? 'Alle' : s}</button>;
                })}
            </div>
            <div className="panel">
                {klanten.length === 0 && <div className="empty-state"><i className="fa-solid fa-users"></i><p>Nog geen klanten aangemaakt</p><button className="btn btn-brand btn-sm" onClick={newKlant}>Eerste Klant Toevoegen</button></div>}
                {filtered.map(function (k) {
                    const pillColor = k.type === 'Zakelijk' ? 'pill-blue' : k.type === 'Festival' ? 'pill-purple' : k.type === 'Horeca' ? 'pill-cyan' : 'pill-amber';
                    return (
                        <div key={k.id} className="ev-row" onClick={function () { editKlant(k); }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, var(--brand), #d4b36a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#111', flexShrink: 0 }}>
                                {(k.naam || '?')[0].toUpperCase()}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {k.naam}
                                    {k.bedrijf && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>({k.bedrijf})</span>}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                    {k.email && <><i className="fa-solid fa-envelope" style={{ marginRight: 4, fontSize: 10 }}></i>{k.email}</>}
                                    {k.telefoon && <span style={{ marginLeft: 12 }}><i className="fa-solid fa-phone" style={{ marginRight: 4, fontSize: 10 }}></i>{k.telefoon}</span>}
                                    {k.plaats && <span style={{ marginLeft: 12 }}><i className="fa-solid fa-location-dot" style={{ marginRight: 4, fontSize: 10 }}></i>{k.plaats}</span>}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <span className={'pill ' + pillColor}>{k.type}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
