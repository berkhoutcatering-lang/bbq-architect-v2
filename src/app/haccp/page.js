'use client';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { fmtNl, today } from '@/lib/utils';

export default function HACCP() {
    var { data: records, insert, remove } = useSupabase('haccp_records', []);
    var { data: events } = useSupabase('events', []);
    var showToast = useToast();
    var [tab, setTab] = useState('overzicht');
    var [filterEvent, setFilterEvent] = useState('');
    var [form, setForm] = useState({ event_id: '', datum: today(), tijd: '', wat: '', temp: '', type: 'kern', notitie: '' });

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
        if (!form.wat || !form.temp) { showToast('Vul alle velden in', 'error'); return; }
        var status = getStatus(form.type, form.temp);
        var data = Object.assign({}, form, { temp: parseFloat(form.temp), status: status, event_id: form.event_id ? parseInt(form.event_id) : null });
        insert(data).then(function () {
            showToast(status === 'ok' ? 'Meting OK geregistreerd' : 'Waarschuwing: temperatuur buiten norm!', status === 'ok' ? 'success' : 'error');
            setForm({ event_id: '', datum: today(), tijd: '', wat: '', temp: '', type: 'kern', notitie: '' });
        });
    }

    var filtered = filterEvent ? records.filter(function (r) { return r.event_id === parseInt(filterEvent); }) : records;

    return (
        <>
            <div className="tab-bar">
                <button className={'tab-btn' + (tab === 'overzicht' ? ' active' : '')} onClick={function () { setTab('overzicht'); }}>Overzicht</button>
                <button className={'tab-btn' + (tab === 'registratie' ? ' active' : '')} onClick={function () { setTab('registratie'); }}>Registratie</button>
            </div>

            {tab === 'registratie' && (
                <div className="panel">
                    <div className="panel-head"><h3>Temperatuur Registreren</h3></div>
                    <div className="panel-body">
                        <div className="form-grid">
                            <div className="field">
                                <label>Event</label>
                                <select value={form.event_id} onChange={function (e) { setField('event_id', e.target.value); }}>
                                    <option value="">— Optioneel —</option>
                                    {events.map(function (ev) { return <option key={ev.id} value={ev.id}>{ev.name}</option>; })}
                                </select>
                            </div>
                            <div className="field">
                                <label>Type</label>
                                <select value={form.type} onChange={function (e) { setField('type', e.target.value); }}>
                                    <option value="kern">Kerntemperatuur (≥75°C)</option>
                                    <option value="koeling">Koeling (0-7°C)</option>
                                    <option value="warmhoud">Warmhouden (≥60°C)</option>
                                </select>
                            </div>
                            <div className="field"><label>Datum</label><input type="date" value={form.datum} onChange={function (e) { setField('datum', e.target.value); }} /></div>
                            <div className="field"><label>Tijd</label><input type="time" value={form.tijd} onChange={function (e) { setField('tijd', e.target.value); }} /></div>
                            <div className="field"><label>Wat</label><input value={form.wat} onChange={function (e) { setField('wat', e.target.value); }} placeholder="bijv. Pulled Pork kern" /></div>
                            <div className="field"><label>Temperatuur (°C)</label><input type="number" step="0.1" value={form.temp} onChange={function (e) { setField('temp', e.target.value); }} /></div>
                            <div className="field full"><label>Notitie</label><input value={form.notitie} onChange={function (e) { setField('notitie', e.target.value); }} /></div>
                        </div>
                        <div style={{ marginTop: 16 }}>
                            <button className="btn btn-brand" onClick={saveRecord}><i className="fa-solid fa-thermometer-half"></i> Registreren</button>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'overzicht' && (
                <>
                    <div style={{ marginBottom: 14 }}>
                        <select style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 10, font: '400 14px DM Sans,sans-serif' }}
                            value={filterEvent} onChange={function (e) { setFilterEvent(e.target.value); }}>
                            <option value="">Alle Events</option>
                            {events.map(function (ev) { return <option key={ev.id} value={ev.id}>{ev.name}</option>; })}
                        </select>
                    </div>
                    <div className="panel">
                        {filtered.length === 0 && <div className="empty-state"><i className="fa-solid fa-shield-halved"></i><p>Geen HACCP registraties</p></div>}
                        {filtered.slice().reverse().map(function (rec) {
                            var pillClass = rec.status === 'ok' ? 'pill-green' : rec.status === 'warn' ? 'pill-amber' : 'pill-red';
                            var ev = events.find(function (e) { return e.id === rec.event_id; });
                            return (
                                <div key={rec.id} className="ev-row">
                                    <div style={{ width: 48, height: 48, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0, background: rec.status === 'ok' ? 'rgba(34,197,94,.12)' : rec.status === 'warn' ? 'rgba(245,158,11,.12)' : 'rgba(239,68,68,.12)', color: rec.status === 'ok' ? 'var(--green)' : rec.status === 'warn' ? 'var(--amber)' : 'var(--red)' }}>
                                        {rec.temp}°
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, marginBottom: 2 }}>{rec.wat}</div>
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                            {rec.type} • {fmtNl(rec.datum)} {rec.tijd || ''}
                                            {ev && <span> • {ev.name}</span>}
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
        </>
    );
}
