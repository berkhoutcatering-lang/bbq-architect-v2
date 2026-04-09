/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { fmtNl, fmt as fmtUtil } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import EmptyState from '@/components/EmptyState';
import PageHint from '@/components/PageHint';
import { Flame } from 'lucide-react';
import type { Klant } from '@/types';

export default function KlantenPage() {
    return <Suspense fallback={<div style={{ padding: 24, color: 'var(--muted)' }}>Laden...</div>}><Klanten /></Suspense>;
}

function Klanten() {
    const { data: klanten, loading: klantenLoading, insert, update, remove } = useSupabase<Klant>('klanten', []);
    const showToast = useToast();
    const showConfirm = useConfirm();
    const searchParams = useSearchParams();
    const initialZoek = searchParams.get('zoek') || '';

    const [editing, setEditing] = useState<string | number | null>(null);
    const [form, setForm] = useState<Record<string, any> | null>(null);
    const [searchQuery, setSearchQuery] = useState(initialZoek);
    const [filterType, setFilterType] = useState<string>('alle');

    // Fetch linked offertes & events counts per klant
    const [klantStats, setKlantStats] = useState<Record<string, { offertes: number; events: number; omzet: number; offerteList: any[]; eventList: any[]; factuurList: any[] }>>({});

    function loadStats(naam: string) {
        if (klantStats[naam]) return;
        Promise.all([
            supabase.from('offertes').select('id,nummer,status,datum,items,aantal_gasten', { count: 'exact' }).eq('client_naam', naam).order('datum', { ascending: false }),
            supabase.from('events').select('id,name,date,guests,ppp,status', { count: 'exact' }).eq('client_naam', naam).order('date', { ascending: false }),
            supabase.from('facturen').select('id,nummer,status,datum,items', { count: 'exact' }).eq('client_naam', naam).order('datum', { ascending: false }),
        ]).then(function ([offRes, evRes, facRes]) {
            let omzet = 0;
            (offRes.data || []).forEach(function (o: any) {
                (o.items || []).forEach(function (i: any) { omzet += (i.qty || 0) * (i.prijs || 0); });
            });
            (evRes.data || []).forEach(function (e: any) { omzet += (e.guests || 0) * (e.ppp || 0); });
            setKlantStats(function (prev) {
                return Object.assign({}, prev, {
                    [naam]: { offertes: offRes.count || 0, events: evRes.count || 0, omzet: omzet, offerteList: offRes.data || [], eventList: evRes.data || [], factuurList: facRes.data || [] }
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

                    {/* Snelle communicatie */}
                    {editing !== 'new' && (form.telefoon || form.email) && (
                        <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {form.telefoon && (function () {
                                const tel = (form.telefoon || '').replace(/[^0-9+]/g, '');
                                const waTel = tel.startsWith('0') ? '31' + tel.slice(1) : tel.replace('+', '');
                                return (
                                    <a href={'https://wa.me/' + waTel} target="_blank" rel="noopener noreferrer"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: 'rgba(37,211,102,.1)', border: '1px solid rgba(37,211,102,.25)', color: '#25d366', textDecoration: 'none', cursor: 'pointer' }}>
                                        <i className="fa-brands fa-whatsapp" style={{ fontSize: 14 }}></i> WhatsApp
                                    </a>
                                );
                            })()}
                            {form.telefoon && (
                                <a href={'tel:' + form.telefoon}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.25)', color: '#3b82f6', textDecoration: 'none' }}>
                                    <i className="fa-solid fa-phone" style={{ fontSize: 12 }}></i> Bellen
                                </a>
                            )}
                            {form.email && (
                                <a href={'mailto:' + form.email}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: 'rgba(196,163,90,.1)', border: '1px solid rgba(196,163,90,.25)', color: '#c4a35a', textDecoration: 'none' }}>
                                    <i className="fa-solid fa-envelope" style={{ fontSize: 12 }}></i> Email
                                </a>
                            )}
                        </div>
                    )}

                    {/* Klant-historie */}
                    {stats && (
                        <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                            <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', marginBottom: 12 }}>
                                <i className="fa-solid fa-chart-bar" style={{ marginRight: 6 }}></i>Klant Overzicht
                            </h4>
                            <div className="stat-grid grid grid-cols-1 sm:grid-cols-3 gap-3">
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

                            {/* Gedetailleerde historie */}
                            {stats.eventList && stats.eventList.length > 0 && (
                                <div style={{ marginTop: 16 }}>
                                    <h5 style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Events</h5>
                                    {stats.eventList.slice(0, 5).map(function (ev: any) {
                                        const statusColor = ev.status === 'confirmed' ? '#10b981' : ev.status === 'completed' ? '#3b82f6' : '#f59e0b';
                                        return (
                                            <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                                                <span>{ev.name} <span style={{ color: 'var(--muted)' }}>— {ev.date}</span></span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span>{ev.guests}p</span>
                                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, display: 'inline-block' }}></span>
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {stats.offerteList && stats.offerteList.length > 0 && (
                                <div style={{ marginTop: 12 }}>
                                    <h5 style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Offertes</h5>
                                    {stats.offerteList.slice(0, 5).map(function (o: any) {
                                        let totaal = 0;
                                        (o.items || []).forEach(function (i: any) { totaal += (i.qty || 0) * (i.prijs || 0); });
                                        return (
                                            <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                                                <span>{o.nummer} <span style={{ color: 'var(--muted)' }}>— {o.datum}</span></span>
                                                <span style={{ fontWeight: 600 }}>{fmt(totaal)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {stats.factuurList && stats.factuurList.length > 0 && (
                                <div style={{ marginTop: 12 }}>
                                    <h5 style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Facturen</h5>
                                    {stats.factuurList.slice(0, 5).map(function (f: any) {
                                        let totaal = 0;
                                        (f.items || []).forEach(function (i: any) { totaal += (i.qty || 0) * (i.prijs || 0); });
                                        const statusColor = f.status === 'betaald' ? '#10b981' : f.status === 'vervallen' ? '#ef4444' : '#f59e0b';
                                        return (
                                            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                                                <span>{f.nummer} <span style={{ color: 'var(--muted)' }}>— {f.datum}</span></span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ fontWeight: 600 }}>{fmt(totaal)}</span>
                                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, display: 'inline-block' }}></span>
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
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

    if (klantenLoading) {
        return (
            <div className="min-h-screen bg-[#121215] flex items-center justify-center">
                <Flame className="w-8 h-8 text-[#c4a35a] animate-pulse" />
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
            <PageHint id="klanten" title="Klanten" description="Beheer je klantenbestand. Klik op een klant om details te bekijken of koppel direct aan events en offertes." />
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
                {klanten.length === 0 && <EmptyState page="/klanten" onAction={newKlant} />}
                {klanten.length > 0 && filtered.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
                        <i className="fa-solid fa-search" style={{ fontSize: 24, marginBottom: 12, display: 'block', opacity: 0.4 }}></i>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Geen klanten gevonden</div>
                        <div style={{ fontSize: 12 }}>Pas je zoekopdracht of filters aan</div>
                    </div>
                )}
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {k.telefoon && (function () {
                                    const tel = (k.telefoon || '').replace(/[^0-9+]/g, '');
                                    const waTel = tel.startsWith('0') ? '31' + tel.slice(1) : tel.replace('+', '');
                                    return (
                                        <a href={'https://wa.me/' + waTel} target="_blank" rel="noopener noreferrer"
                                            onClick={function (e: React.MouseEvent) { e.stopPropagation(); }}
                                            style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(37,211,102,.1)', color: '#25d366', fontSize: 13, textDecoration: 'none', flexShrink: 0 }}
                                            title="WhatsApp">
                                            <i className="fa-brands fa-whatsapp"></i>
                                        </a>
                                    );
                                })()}
                                <span className={'pill ' + pillColor}>{k.type}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
