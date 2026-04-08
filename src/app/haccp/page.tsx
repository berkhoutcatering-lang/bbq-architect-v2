/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { fmtNl, today } from '@/lib/utils';
import { generatePDF } from '@/lib/pdfGenerator';
import EmptyState from '@/components/EmptyState';
import type { HaccpRecord, DbEvent, Offerte } from '@/types';

interface HaccpForm {
    event_id: string;
    offerte_id: string;
    datum: string;
    tijd: string;
    wat: string;
    temp: string;
    type: string;
    check_type: string;
    chef: string;
    notitie: string;
}

interface EventGroup {
    id: string;
    records: any[];
    naam: string;
    datum: string;
    offerte?: any;
}

const QUICK_PRODUCTS = [
    'Bavette', 'Spareribs', 'Pulled Pork', 'Kip', 'Worst', 'Zalm',
    'Burger', 'Groenten', 'Saus', 'Salade', 'Brood', 'Anders'
];

export default function HACCP() {
    const { data: records, loading, insert, remove } = useSupabase<HaccpRecord>('haccp_records', []);
    const { data: events } = useSupabase<DbEvent>('events', []);
    const { data: offertes } = useSupabase<Offerte>('offertes', []);
    const showToast = useToast();
    const [tab, setTab] = useState('overzicht');
    const [filterEvent, setFilterEvent] = useState('');
    const [isMobile, setIsMobile] = useState(false);
    const [form, setForm] = useState<HaccpForm>({
        event_id: '', offerte_id: '', datum: today(), tijd: '', wat: '', temp: '',
        type: 'kern', check_type: 'bereiding', chef: 'Cor', notitie: ''
    });

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    function setField(key: string, val: string) { setForm(Object.assign({}, form, { [key]: val })); }

    function getStatus(type: string, temp: string): string {
        const t = parseFloat(temp);
        if (isNaN(t)) return 'ok';
        if (type === 'koeling') return t >= 0 && t <= 7 ? 'ok' : t <= 10 ? 'warn' : 'danger';
        if (type === 'kern') return t >= 75 ? 'ok' : t >= 65 ? 'warn' : 'danger';
        if (type === 'warmhoud') return t >= 60 ? 'ok' : t >= 55 ? 'warn' : 'danger';
        return 'ok';
    }

    function saveRecord() {
        if (!form.wat || !form.temp) { showToast('Vul product en temperatuur in', 'error'); return; }
        const status = getStatus(form.type, form.temp);
        const data = Object.assign({}, form, {
            temp: parseFloat(form.temp),
            status: status,
            event_id: form.event_id ? parseInt(form.event_id) : null,
            offerte_id: form.offerte_id || null,
            auto_logged: false
        });
        insert(data as any).then(function () {
            showToast(status === 'ok' ? '\u2705 Meting OK geregistreerd' : status === 'warn' ? '\u26a0\ufe0f Temperatuur in risicozone!' : '\ud83d\udd34 AFWIJKING \u2014 Temperatuur buiten norm!', status === 'ok' ? 'success' : 'error');
            setForm({ event_id: '', offerte_id: '', datum: today(), tijd: '', wat: '', temp: '', type: 'kern', check_type: 'bereiding', chef: 'Cor', notitie: '' });
        }).catch(function(err: any) { showToast('Fout: ' + (err.message || 'onbekend'), 'error'); });
    }

    const filtered = (function () {
        if (filterEvent === 'afwijkingen') {
            return records.filter(function (r: any) { return r.status === 'danger' || r.status === 'warn'; });
        } else if (filterEvent) {
            return records.filter(function (r: any) {
                return r.event_id === parseInt(filterEvent) || r.offerte_id === filterEvent;
            });
        }
        return records;
    })();

    function getEventGroups(): EventGroup[] {
        const groups: Record<string, any> = {};
        records.forEach(function (r: any) {
            const key = r.offerte_id || (r.event_id ? 'ev_' + r.event_id : 'los');
            if (!groups[key]) groups[key] = { records: [], naam: '', datum: '' };
            groups[key].records.push(r);
            if (r.offerte_id) {
                const off = offertes.find(function (o: any) { return String(o.id) === r.offerte_id; });
                if (off) { groups[key].naam = off.client_naam || 'Onbekend'; groups[key].datum = off.datum || ''; groups[key].offerte = off; }
            } else if (r.event_id) {
                const ev = events.find(function (e: any) { return e.id === r.event_id; });
                if (ev) { groups[key].naam = ev.name || 'Onbekend'; groups[key].datum = ev.date || ''; }
            }
        });
        return Object.keys(groups).map(function (key) { return Object.assign({ id: key }, groups[key]); })
            .filter(function (g: any) { return g.records.length > 0; })
            .sort(function (a: any, b: any) { return (b.datum || '').localeCompare(a.datum || ''); });
    }

    function downloadHACCPRapport(group: EventGroup) {
        generatePDF({
            type: 'haccp',
            eventName: group.naam,
            eventDatum: group.datum,
            eventGasten: group.offerte ? group.offerte.aantal_gasten : '',
            records: group.records.sort(function (a: any, b: any) { return (a.datum + a.tijd) < (b.datum + b.tijd) ? -1 : 1; })
        } as any);
        showToast('\ud83d\udcc4 HACCP Rapport gedownload');
    }

    const checkTypeLabels: Record<string, string> = {
        ontvangst: '\ud83d\udce6 Ontvangst', opslag: '\u2744\ufe0f Opslag/Koeling',
        bereiding: '\ud83d\udd25 Bereiding', regenereren: '\u267b\ufe0f Regenereren', uitgifte: '\ud83c\udf7d\ufe0f Uitgifte'
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
            <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 32, marginBottom: 12, display: 'block' }}></i>
                Laden...
            </div>
        </div>
    );

    return (
        <div className="artisan-page haccp-page">
            <h1 className="hero-title mb-16" style={{ fontSize: 24 }}>HACCP MONITORING</h1>

            <div className="tab-bar">
                <button className={'tab-btn' + (tab === 'overzicht' ? ' active' : '')} onClick={function () { setTab('overzicht'); }}>OVERZICHT</button>
                <button className={'tab-btn' + (tab === 'registratie' ? ' active' : '')} onClick={function () { setTab('registratie'); }}>REGISTRATIE</button>
                <button className={'tab-btn' + (tab === 'dossier' ? ' active' : '')} onClick={function () { setTab('dossier'); }}>DOSSIER</button>
            </div>

            {tab === 'registratie' && isMobile && (
                <div style={{ padding: '0 4px' }}>
                    {/* Step 1: Product selectie */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>Product</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                            {QUICK_PRODUCTS.map(function (p) {
                                return (
                                    <button key={p} onClick={function () { setField('wat', p); }}
                                        style={{
                                            height: 64, borderRadius: 14, fontSize: 13, fontWeight: 600,
                                            background: form.wat === p ? 'rgba(59,130,246,.15)' : 'var(--card-solid)',
                                            border: form.wat === p ? '2px solid #3b82f6' : '1px solid var(--border)',
                                            color: form.wat === p ? '#3b82f6' : 'var(--text)',
                                            cursor: 'pointer', transition: 'all 0.15s'
                                        }}>
                                        {p}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Step 2: Temp type pills */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>Type meting</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {[{ val: 'kern', label: 'Kern ≥75°C', icon: '🔥' }, { val: 'koeling', label: 'Koeling 0-7°C', icon: '❄️' }, { val: 'warmhoud', label: 'Warmhoud ≥60°C', icon: '♨️' }].map(function (t) {
                                return (
                                    <button key={t.val} onClick={function () { setField('type', t.val); }}
                                        style={{
                                            flex: 1, height: 56, borderRadius: 14, fontSize: 12, fontWeight: 600,
                                            background: form.type === t.val ? 'rgba(59,130,246,.15)' : 'var(--card-solid)',
                                            border: form.type === t.val ? '2px solid #3b82f6' : '1px solid var(--border)',
                                            color: form.type === t.val ? '#3b82f6' : 'var(--text)',
                                            cursor: 'pointer', transition: 'all 0.15s', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 2
                                        }}>
                                        <span style={{ fontSize: 14 }}>{t.icon}</span>
                                        <span>{t.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Step 3: Numpad temperature input */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>Temperatuur</label>
                        <div style={{
                            textAlign: 'center', padding: '16px 0', marginBottom: 8,
                            background: form.temp ? (function () { const s = getStatus(form.type, form.temp); return s === 'ok' ? 'rgba(16,185,129,.08)' : s === 'warn' ? 'rgba(245,158,11,.08)' : 'rgba(239,68,68,.08)'; })() : 'var(--card-solid)',
                            border: form.temp ? (function () { const s = getStatus(form.type, form.temp); return '2px solid ' + (s === 'ok' ? '#10b981' : s === 'warn' ? '#f59e0b' : '#ef4444'); })() : '1px solid var(--border)',
                            borderRadius: 16, transition: 'all 0.2s'
                        }}>
                            <span style={{
                                fontSize: 48, fontWeight: 300, letterSpacing: '-2px',
                                color: form.temp ? (function () { const s = getStatus(form.type, form.temp); return s === 'ok' ? '#10b981' : s === 'warn' ? '#f59e0b' : '#ef4444'; })() : 'var(--muted-light)'
                            }}>
                                {form.temp || '—'}
                            </span>
                            <span style={{ fontSize: 24, color: 'var(--muted)', marginLeft: 4 }}>°C</span>
                            {form.temp && (function () {
                                const s = getStatus(form.type, form.temp);
                                return <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, color: s === 'ok' ? '#10b981' : s === 'warn' ? '#f59e0b' : '#ef4444' }}>
                                    {s === 'ok' ? '✓ OK' : s === 'warn' ? '⚠ Risicozone' : '✗ AFWIJKING'}
                                </div>;
                            })()}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxWidth: 280, margin: '0 auto' }}>
                            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(function (key) {
                                return (
                                    <button key={key} onClick={function () {
                                        if (key === '⌫') { setField('temp', form.temp.slice(0, -1)); }
                                        else { setField('temp', form.temp + key); }
                                    }}
                                        style={{
                                            height: 64, borderRadius: 14, fontSize: key === '⌫' ? 20 : 24, fontWeight: 500,
                                            background: 'var(--card-solid)', border: '1px solid var(--border)',
                                            color: 'var(--text)', cursor: 'pointer', transition: 'all 0.1s',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                        {key}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Save button */}
                    <button onClick={saveRecord} disabled={!form.wat || !form.temp}
                        style={{
                            width: '100%', height: 64, borderRadius: 14, fontSize: 16, fontWeight: 700,
                            background: (!form.wat || !form.temp) ? 'var(--card-solid)' : 'linear-gradient(135deg, #c4a35a, #a8893e)',
                            border: 'none', color: (!form.wat || !form.temp) ? 'var(--muted)' : '#000',
                            cursor: (!form.wat || !form.temp) ? 'not-allowed' : 'pointer',
                            letterSpacing: '0.05em', textTransform: 'uppercase', transition: 'all 0.2s'
                        }}>
                        <i className="fa-solid fa-fire" style={{ marginRight: 8 }}></i>
                        REGISTREER METING
                    </button>
                </div>
            )}

            {tab === 'registratie' && !isMobile && (
                <div className="panel">
                    <div className="panel-head"><h3><i className="fa-solid fa-thermometer"></i> TEMPERATUUR REGISTREREN</h3></div>
                    <div className="panel-body">
                        <div className="form-grid">
                            <div className="field">
                                <label>Event / Offerte</label>
                                <select value={form.offerte_id} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setField('offerte_id', e.target.value); }}>
                                    <option value="">— Optioneel —</option>
                                    {offertes.map(function (o: any) { return <option key={o.id} value={o.id}>{o.client_naam} — {o.datum}</option>; })}
                                </select>
                            </div>
                            <div className="field">
                                <label>Check Type</label>
                                <select value={form.check_type} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setField('check_type', e.target.value); }}>
                                    <option value="ontvangst">📦 Ontvangst</option>
                                    <option value="opslag">❄️ Opslag/Koeling</option>
                                    <option value="bereiding">🔥 Bereiding</option>
                                    <option value="regenereren">♻️ Regenereren</option>
                                    <option value="uitgifte">🍽️ Uitgifte</option>
                                </select>
                            </div>
                            <div className="field">
                                <label>Temp Type</label>
                                <select value={form.type} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setField('type', e.target.value); }}>
                                    <option value="kern">Kerntemperatuur (≥75°C)</option>
                                    <option value="koeling">Koeling (0-7°C)</option>
                                    <option value="warmhoud">Warmhouden (≥60°C)</option>
                                </select>
                            </div>
                            <div className="field">
                                <label>Chef</label>
                                <input value={form.chef} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('chef', e.target.value); }} placeholder="Cor" />
                            </div>
                            <div className="field"><label>Datum</label><input type="date" value={form.datum} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('datum', e.target.value); }} /></div>
                            <div className="field"><label>Tijd</label><input type="time" value={form.tijd} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('tijd', e.target.value); }} /></div>
                            <div className="field"><label>Product</label><input value={form.wat} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('wat', e.target.value); }} placeholder="bijv. Bavette kern" /></div>
                            <div className="field">
                                <label>Temperatuur (°C)</label>
                                <input type="number" step="0.1" value={form.temp} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('temp', e.target.value); }} />
                            </div>
                            <div className="field full"><label>Notitie</label><input value={form.notitie} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('notitie', e.target.value); }} /></div>
                        </div>

                        {form.temp && (function () {
                            const s = getStatus(form.type, form.temp);
                            if (s === 'ok') return null;
                            return (
                                <div className={'haccp-boundary-warn haccp-boundary-' + s} style={{ marginTop: 20 }}>
                                    <i className={'fa-solid ' + (s === 'warn' ? 'fa-triangle-exclamation' : 'fa-skull-crossbones')}></i>
                                    <span>{s === 'warn' ? '⚠️ Temperatuur in risicozone!' : '🔴 AFWIJKING — Temperatuur buiten veilige norm!'}</span>
                                </div>
                            );
                        })()}

                        <div style={{ marginTop: 24 }}>
                            <button className="btn-brand" onClick={saveRecord}><i className="fa-solid fa-fire"></i> METING OPSLAAN</button>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'overzicht' && (
                <>
                    <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
                        <select className="artisan-select" style={{ flex: 1, padding: 10, background: 'var(--card-solid)', border: '1px solid var(--border-steel)', borderRadius: 8, color: 'var(--brand)' }}
                            value={filterEvent} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setFilterEvent(e.target.value); }}>
                            <option value="">Alle Records</option>
                            <option value="afwijkingen">🔴 Afwijkingen</option>
                            {offertes.map(function (o: any) { return <option key={o.id} value={o.id}>{o.client_naam} — {o.datum}</option>; })}
                            {events.map(function (ev: any) { return <option key={ev.id} value={ev.id}>{ev.name}</option>; })}
                        </select>
                    </div>
                    <div className="panel">
                        <div className="panel-body">
                            {filtered.length === 0 && <EmptyState page="/haccp" onAction={function () { setTab('registratie'); }} />}
                            {filtered.slice().reverse().map(function (rec: any) {
                                const pillClass = rec.status === 'ok' ? 'pill-green' : rec.status === 'warn' ? 'pill-amber' : 'pill-red';
                                const ev = events.find(function (e: any) { return e.id === rec.event_id; });
                                const off = rec.offerte_id ? offertes.find(function (o: any) { return String(o.id) === rec.offerte_id; }) : null;
                                const eventLabel = off ? off.client_naam : (ev ? ev.name : '');
                                return (
                                    <div key={rec.id} className="side-row" style={{ padding: '16px 0' }}>
                                        <div style={{ width: 44, height: 44, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0, background: 'var(--bg)', border: '1px solid var(--border)', color: rec.status === 'ok' ? 'var(--green)' : rec.status === 'warn' ? 'var(--amber)' : 'var(--red)' }}>
                                            {rec.temp}°
                                        </div>
                                        <div style={{ flex: 1, marginLeft: 16 }}>
                                            <div style={{ fontWeight: 600, fontSize: 14 }}>{rec.wat}</div>
                                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                                {checkTypeLabels[rec.check_type] || rec.check_type || rec.type} • {fmtNl(rec.datum)} {rec.tijd || ''}
                                                {eventLabel && <span> • {eventLabel}</span>}
                                                {rec.chef && <span> • 👨‍🍳 {rec.chef}</span>}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <span className={'pill ' + pillClass}>{rec.status === 'ok' ? 'OK' : rec.status === 'warn' ? 'Let op' : 'Afwijking'}</span>
                                            <button className="del-btn" style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }} onClick={function () { remove(rec.id); }}><i className="fa-solid fa-trash"></i></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            {tab === 'dossier' && (
                <div className="panel">
                    <div className="panel-head"><h3><i className="fa-solid fa-folder-open"></i> NVWA-READY DOSSIERS</h3></div>
                    <div className="panel-body">
                        {getEventGroups().length === 0 && (
                            <div className="empty-state"><i className="fa-solid fa-folder-open"></i><p>Geen HACCP dossiers beschikbaar</p></div>
                        )}
                        {getEventGroups().map(function (group: EventGroup) {
                            const okCount = group.records.filter(function (r: any) { return r.status === 'ok'; }).length;
                            const warnCount = group.records.filter(function (r: any) { return r.status === 'warn'; }).length;
                            const dangerCount = group.records.filter(function (r: any) { return r.status === 'danger'; }).length;
                            return (
                                <div key={group.id} className="haccp-dossier-card artisan-panel mb-16" style={{ padding: 20 }}>
                                    <div className="haccp-dossier-head" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--brand)' }}>{group.naam || 'Losse metingen'}</div>
                                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtNl(group.datum)} • {group.records.length} metingen</div>
                                        </div>
                                        <button className="btn-brand btn-sm" style={{ padding: '6px 12px', fontSize: 12 }} onClick={function () { downloadHACCPRapport(group); }}>
                                            <i className="fa-solid fa-file-pdf"></i> PDF RAPPORT
                                        </button>
                                    </div>
                                    <div className="haccp-dossier-stats" style={{ display: 'flex', gap: 12, marginBottom: 16, fontSize: 12, fontWeight: 600 }}>
                                        <span style={{ color: 'var(--green)' }}>✅ {okCount} OK</span>
                                        {warnCount > 0 && <span style={{ color: 'var(--amber)' }}>⚠️ {warnCount} WAARSCHUWING</span>}
                                        {dangerCount > 0 && <span style={{ color: 'var(--red)' }}>🔴 {dangerCount} AFWIJKING</span>}
                                    </div>
                                    <div className="haccp-timeline" style={{ borderLeft: '1px solid var(--border)', paddingLeft: 16 }}>
                                        {group.records.sort(function (a: any, b: any) { return (a.datum + (a.tijd || '')) < (b.datum + (b.tijd || '')) ? -1 : 1; }).map(function (rec: any) {
                                            return (
                                                <div key={rec.id} className={'haccp-timeline-item mb-16'} style={{ position: 'relative' }}>
                                                    <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                                                        <span>{rec.wat}</span>
                                                        <span style={{ color: rec.status === 'ok' ? 'var(--green)' : 'var(--red)' }}>{rec.temp}°C</span>
                                                    </div>
                                                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                                                        {rec.tijd || ''} • {checkTypeLabels[rec.check_type] || rec.type} • {rec.chef || 'Cor'}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
