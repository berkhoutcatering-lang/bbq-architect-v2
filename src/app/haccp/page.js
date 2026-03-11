'use client';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { fmtNl, today } from '@/lib/utils';
import { generatePDF } from '@/lib/pdfGenerator';

export default function HACCP() {
    var { data: records, insert, remove } = useSupabase('haccp_records', []);
    var { data: events } = useSupabase('events', []);
    var { data: offertes } = useSupabase('offertes', []);
    var showToast = useToast();
    var [tab, setTab] = useState('overzicht');
    var [filterEvent, setFilterEvent] = useState('');
    var [form, setForm] = useState({
        event_id: '', offerte_id: '', datum: today(), tijd: '', wat: '', temp: '',
        type: 'kern', check_type: 'bereiding', chef: 'Cor', notitie: ''
    });

    function setField(key, val) { setForm(Object.assign({}, form, { [key]: val })); }

    function getStatus(type, temp) {
        var t = parseFloat(temp);
        if (isNaN(t)) return 'ok';
        if (type === 'koeling') return t >= 0 && t <= 7 ? 'ok' : t <= 10 ? 'warn' : 'danger';
        if (type === 'kern') return t >= 75 ? 'ok' : t >= 65 ? 'warn' : 'danger';
        if (type === 'warmhoud') return t >= 60 ? 'ok' : t >= 55 ? 'warn' : 'danger';
        return 'ok';
    }

    function saveRecord() {
        if (!form.wat || !form.temp) { showToast('Vul product en temperatuur in', 'error'); return; }
        var status = getStatus(form.type, form.temp);
        var data = Object.assign({}, form, {
            temp: parseFloat(form.temp),
            status: status,
            event_id: form.event_id ? parseInt(form.event_id) : null,
            offerte_id: form.offerte_id || null,
            auto_logged: false
        });
        insert(data).then(function () {
            showToast(status === 'ok' ? '✅ Meting OK geregistreerd' : status === 'warn' ? '⚠️ Temperatuur in risicozone!' : '🔴 AFWIJKING — Temperatuur buiten norm!', status === 'ok' ? 'success' : 'error');
            setForm({ event_id: '', offerte_id: '', datum: today(), tijd: '', wat: '', temp: '', type: 'kern', check_type: 'bereiding', chef: 'Cor', notitie: '' });
        });
    }

    // Filter logic
    var filtered = records;
    if (filterEvent === 'afwijkingen') {
        filtered = records.filter(function (r) { return r.status === 'danger' || r.status === 'warn'; });
    } else if (filterEvent) {
        filtered = records.filter(function (r) {
            return r.event_id === parseInt(filterEvent) || r.offerte_id === filterEvent;
        });
    }

    // Group by event/offerte for timeline
    function getEventGroups() {
        var groups = {};
        records.forEach(function (r) {
            var key = r.offerte_id || (r.event_id ? 'ev_' + r.event_id : 'los');
            if (!groups[key]) groups[key] = { records: [], naam: '', datum: '' };
            groups[key].records.push(r);
            // Find naam
            if (r.offerte_id) {
                var off = offertes.find(function (o) { return String(o.id) === r.offerte_id; });
                if (off) { groups[key].naam = off.client_naam || 'Onbekend'; groups[key].datum = off.datum || ''; groups[key].offerte = off; }
            } else if (r.event_id) {
                var ev = events.find(function (e) { return e.id === r.event_id; });
                if (ev) { groups[key].naam = ev.name || 'Onbekend'; groups[key].datum = ev.date || ''; }
            }
        });
        return Object.keys(groups).map(function (key) { return Object.assign({ id: key }, groups[key]); })
            .filter(function (g) { return g.records.length > 0; })
            .sort(function (a, b) { return b.datum < a.datum ? -1 : 1; });
    }

    function downloadHACCPRapport(group) {
        generatePDF({
            type: 'haccp',
            eventName: group.naam,
            eventDatum: group.datum,
            eventGasten: group.offerte ? group.offerte.aantal_gasten : '',
            records: group.records.sort(function (a, b) { return (a.datum + a.tijd) < (b.datum + b.tijd) ? -1 : 1; })
        });
        showToast('📄 HACCP Rapport gedownload');
    }

    var checkTypeLabels = {
        ontvangst: '📦 Ontvangst', opslag: '❄️ Opslag/Koeling',
        bereiding: '🔥 Bereiding', regenereren: '♻️ Regenereren', uitgifte: '🍽️ Uitgifte'
    };

    return (
        <>
            <div className="tab-bar">
                <button className={'tab-btn' + (tab === 'overzicht' ? ' active' : '')} onClick={function () { setTab('overzicht'); }}>Overzicht</button>
                <button className={'tab-btn' + (tab === 'registratie' ? ' active' : '')} onClick={function () { setTab('registratie'); }}>Registratie</button>
                <button className={'tab-btn' + (tab === 'dossier' ? ' active' : '')} onClick={function () { setTab('dossier'); }}>📋 Dossier</button>
            </div>

            {tab === 'registratie' && (
                <div className="panel">
                    <div className="panel-head"><h3>🌡️ Temperatuur Registreren</h3></div>
                    <div className="panel-body">
                        <div className="form-grid">
                            <div className="field">
                                <label>Event / Offerte</label>
                                <select value={form.offerte_id} onChange={function (e) { setField('offerte_id', e.target.value); }}>
                                    <option value="">— Optioneel —</option>
                                    {offertes.map(function (o) { return <option key={o.id} value={o.id}>{o.client_naam} — {o.datum}</option>; })}
                                </select>
                            </div>
                            <div className="field">
                                <label>Check Type</label>
                                <select value={form.check_type} onChange={function (e) { setField('check_type', e.target.value); }}>
                                    <option value="ontvangst">📦 Ontvangst</option>
                                    <option value="opslag">❄️ Opslag/Koeling</option>
                                    <option value="bereiding">🔥 Bereiding</option>
                                    <option value="regenereren">♻️ Regenereren</option>
                                    <option value="uitgifte">🍽️ Uitgifte</option>
                                </select>
                            </div>
                            <div className="field">
                                <label>Temp Type</label>
                                <select value={form.type} onChange={function (e) { setField('type', e.target.value); }}>
                                    <option value="kern">Kerntemperatuur (≥75°C)</option>
                                    <option value="koeling">Koeling (0-7°C)</option>
                                    <option value="warmhoud">Warmhouden (≥60°C)</option>
                                </select>
                            </div>
                            <div className="field">
                                <label>Chef</label>
                                <input value={form.chef} onChange={function (e) { setField('chef', e.target.value); }} placeholder="Cor" />
                            </div>
                            <div className="field"><label>Datum</label><input type="date" value={form.datum} onChange={function (e) { setField('datum', e.target.value); }} /></div>
                            <div className="field"><label>Tijd</label><input type="time" value={form.tijd} onChange={function (e) { setField('tijd', e.target.value); }} /></div>
                            <div className="field"><label>Product</label><input value={form.wat} onChange={function (e) { setField('wat', e.target.value); }} placeholder="bijv. Bavette kern" /></div>
                            <div className="field">
                                <label>Temperatuur (°C)</label>
                                <input type="number" step="0.1" value={form.temp} onChange={function (e) { setField('temp', e.target.value); }} />
                            </div>
                            <div className="field full"><label>Notitie</label><input value={form.notitie} onChange={function (e) { setField('notitie', e.target.value); }} /></div>
                        </div>

                        {/* Real-time boundary warning */}
                        {form.temp && (function () {
                            var s = getStatus(form.type, form.temp);
                            if (s === 'ok') return null;
                            return (
                                <div className={'haccp-boundary-warn haccp-boundary-' + s}>
                                    <i className={'fa-solid ' + (s === 'warn' ? 'fa-triangle-exclamation' : 'fa-skull-crossbones')}></i>
                                    <span>{s === 'warn' ? '⚠️ Temperatuur in risicozone!' : '🔴 AFWIJKING — Temperatuur buiten veilige norm!'}</span>
                                </div>
                            );
                        })()}

                        <div style={{ marginTop: 16 }}>
                            <button className="btn btn-brand" onClick={saveRecord}><i className="fa-solid fa-thermometer-half"></i> Registreren</button>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'overzicht' && (
                <>
                    <div style={{ marginBottom: 14, display: 'flex', gap: 8 }}>
                        <select style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 10, font: '400 14px DM Sans,sans-serif', flex: 1 }}
                            value={filterEvent} onChange={function (e) { setFilterEvent(e.target.value); }}>
                            <option value="">Alle Records</option>
                            <option value="afwijkingen">🔴 Afwijkingen</option>
                            {offertes.map(function (o) { return <option key={o.id} value={o.id}>{o.client_naam} — {o.datum}</option>; })}
                            {events.map(function (ev) { return <option key={ev.id} value={ev.id}>{ev.name}</option>; })}
                        </select>
                    </div>
                    <div className="panel">
                        {filtered.length === 0 && <div className="empty-state"><i className="fa-solid fa-shield-halved"></i><p>Geen HACCP registraties</p></div>}
                        {filtered.slice().reverse().map(function (rec) {
                            var pillClass = rec.status === 'ok' ? 'pill-green' : rec.status === 'warn' ? 'pill-amber' : 'pill-red';
                            var ev = events.find(function (e) { return e.id === rec.event_id; });
                            var off = rec.offerte_id ? offertes.find(function (o) { return String(o.id) === rec.offerte_id; }) : null;
                            var eventLabel = off ? off.client_naam : (ev ? ev.name : '');
                            return (
                                <div key={rec.id} className="ev-row">
                                    <div style={{ width: 48, height: 48, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0, background: rec.status === 'ok' ? 'rgba(34,197,94,.12)' : rec.status === 'warn' ? 'rgba(245,158,11,.12)' : 'rgba(239,68,68,.12)', color: rec.status === 'ok' ? 'var(--green)' : rec.status === 'warn' ? 'var(--amber)' : 'var(--red)' }}>
                                        {rec.temp}°
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, marginBottom: 2 }}>{rec.wat}</div>
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                            {checkTypeLabels[rec.check_type] || rec.check_type || rec.type} • {fmtNl(rec.datum)} {rec.tijd || ''}
                                            {eventLabel && <span> • {eventLabel}</span>}
                                            {rec.chef && <span> • 👨‍🍳 {rec.chef}</span>}
                                            {rec.auto_logged && <span className="pill pill-blue" style={{ fontSize: 9, marginLeft: 6 }}>auto</span>}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span className={'pill ' + pillClass}>{rec.status === 'ok' ? 'OK' : rec.status === 'warn' ? 'Let op' : 'Afwijking'}</span>
                                        <button className="del-btn" onClick={function () { remove(rec.id); }}><i className="fa-solid fa-trash"></i></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {tab === 'dossier' && (
                <>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
                        NVWA-ready dossiers per event. Download als PDF voor archivering.
                    </div>
                    {getEventGroups().length === 0 && (
                        <div className="empty-state"><i className="fa-solid fa-folder-open"></i><p>Geen HACCP dossiers beschikbaar</p></div>
                    )}
                    {getEventGroups().map(function (group) {
                        var okCount = group.records.filter(function (r) { return r.status === 'ok'; }).length;
                        var warnCount = group.records.filter(function (r) { return r.status === 'warn'; }).length;
                        var dangerCount = group.records.filter(function (r) { return r.status === 'danger'; }).length;
                        return (
                            <div key={group.id} className="haccp-dossier-card">
                                <div className="haccp-dossier-head">
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 14 }}>{group.naam || 'Losse metingen'}</div>
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtNl(group.datum)} • {group.records.length} metingen</div>
                                    </div>
                                    <button className="btn btn-brand btn-sm" onClick={function () { downloadHACCPRapport(group); }}>
                                        <i className="fa-solid fa-file-pdf"></i> Download Rapport
                                    </button>
                                </div>
                                <div className="haccp-dossier-stats">
                                    <span className="haccp-stat-ok">✅ {okCount} OK</span>
                                    {warnCount > 0 && <span className="haccp-stat-warn">⚠️ {warnCount} Let op</span>}
                                    {dangerCount > 0 && <span className="haccp-stat-danger">🔴 {dangerCount} Afwijking</span>}
                                </div>
                                <div className="haccp-timeline">
                                    {group.records.sort(function (a, b) { return (a.datum + (a.tijd || '')) < (b.datum + (b.tijd || '')) ? -1 : 1; }).map(function (rec) {
                                        return (
                                            <div key={rec.id} className={'haccp-timeline-item haccp-tl-' + (rec.status || 'ok')}>
                                                <div className="haccp-tl-dot"></div>
                                                <div className="haccp-tl-content">
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontWeight: 600, fontSize: 12 }}>{rec.wat}</span>
                                                        <span style={{ fontWeight: 800, fontSize: 14 }}>{rec.temp}°C</span>
                                                    </div>
                                                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                                                        {rec.tijd || ''} • {checkTypeLabels[rec.check_type] || rec.type} • {rec.chef || 'Cor'}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </>
            )}
        </>
    );
}
