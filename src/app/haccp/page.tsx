/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { fmtNl, today } from '@/lib/utils';
import { generatePDF } from '@/lib/pdfGenerator';
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

export default function HACCP() {
    const { data: records, loading, insert, remove } = useSupabase<HaccpRecord>('haccp_records', []);
    const { data: events } = useSupabase<DbEvent>('events', []);
    const { data: offertes } = useSupabase<Offerte>('offertes', []);
    const showToast = useToast();
    const [tab, setTab] = useState('overzicht');
    const [filterEvent, setFilterEvent] = useState('');
    const [form, setForm] = useState<HaccpForm>({
        event_id: '', offerte_id: '', datum: today(), tijd: '', wat: '', temp: '',
        type: 'kern', check_type: 'bereiding', chef: 'Cor', notitie: ''
    });

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
            .sort(function (a: any, b: any) { return b.datum < a.datum ? -1 : 1; });
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

            {tab === 'registratie' && (
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
                            {filtered.length === 0 && <div className="empty-state"><i className="fa-solid fa-shield-halved"></i><p>Geen HACCP registraties</p></div>}
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
