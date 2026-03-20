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

                        {form.temp && (function () {
                            var s = getStatus(form.type, form.temp);
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
                            value={filterEvent} onChange={function (e) { setFilterEvent(e.target.value); }}>
                            <option value="">Alle Records</option>
                            <option value="afwijkingen">🔴 Afwijkingen</option>
                            {offertes.map(function (o) { return <option key={o.id} value={o.id}>{o.client_naam} — {o.datum}</option>; })}
                            {events.map(function (ev) { return <option key={ev.id} value={ev.id}>{ev.name}</option>; })}
                        </select>
                    </div>
                    <div className="panel">
                        <div className="panel-body">
                            {filtered.length === 0 && <div className="empty-state"><i className="fa-solid fa-shield-halved"></i><p>Geen HACCP registraties</p></div>}
                            {filtered.slice().reverse().map(function (rec) {
                                var pillClass = rec.status === 'ok' ? 'pill-green' : rec.status === 'warn' ? 'pill-amber' : 'pill-red';
                                var ev = events.find(function (e) { return e.id === rec.event_id; });
                                var off = rec.offerte_id ? offertes.find(function (o) { return String(o.id) === rec.offerte_id; }) : null;
                                var eventLabel = off ? off.client_naam : (ev ? ev.name : '');
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
                        {getEventGroups().map(function (group) {
                            var okCount = group.records.filter(function (r) { return r.status === 'ok'; }).length;
                            var warnCount = group.records.filter(function (r) { return r.status === 'warn'; }).length;
                            var dangerCount = group.records.filter(function (r) { return r.status === 'danger'; }).length;
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
                                        {group.records.sort(function (a, b) { return (a.datum + (a.tijd || '')) < (b.datum + (b.tijd || '')) ? -1 : 1; }).map(function (rec) {
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
