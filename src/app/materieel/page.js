'use client';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { fmtNl, today } from '@/lib/utils';

export default function Materieel() {
    var { data: materieel, insert, update, remove } = useSupabase('materieel', []);
    var showToast = useToast();
    var showConfirm = useConfirm();
    var [editing, setEditing] = useState(null);
    var [form, setForm] = useState(null);
    var [newLog, setNewLog] = useState({ actie: '', notitie: '' });

    function newItem() {
        setEditing('new');
        setForm({ naam: '', type: 'Overig', status: 'ok', aanschaf_datum: '', notitie: '', logboek: [] });
    }

    function editItem(m) { setEditing(m.id); setForm(JSON.parse(JSON.stringify(m))); }
    function setField(key, val) { setForm(Object.assign({}, form, { [key]: val })); }

    function saveItem() {
        if (!form.naam) { showToast('Vul een naam in', 'error'); return; }
        if (editing === 'new') {
            insert(form).then(function () { showToast('Materieel toegevoegd', 'success'); setEditing(null); setForm(null); });
        } else {
            var { id, created_at, ...rest } = form;
            update(editing, rest).then(function () { showToast('Materieel bijgewerkt', 'success'); setEditing(null); setForm(null); });
        }
    }

    function deleteItem() {
        showConfirm('Materieel verwijderen?', function () {
            remove(editing).then(function () { showToast('Verwijderd', 'success'); setEditing(null); setForm(null); });
        });
    }

    function addLogEntry() {
        if (!newLog.actie) { showToast('Vul een actie in', 'error'); return; }
        var entry = { datum: today(), actie: newLog.actie, notitie: newLog.notitie };
        setField('logboek', (form.logboek || []).concat([entry]));
        setNewLog({ actie: '', notitie: '' });
        showToast('Logboek bijgewerkt — vergeet niet op te slaan', 'info');
    }

    // Editor
    if (editing !== null && form) {
        return (
            <div className="panel">
                <div className="panel-head">
                    <h3>{editing === 'new' ? 'Nieuw Materieel' : 'Materieel Bewerken'}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={function () { setEditing(null); setForm(null); }}><i className="fa-solid fa-arrow-left"></i> Terug</button>
                </div>
                <div className="panel-body">
                    <div className="form-grid">
                        <div className="field"><label>Naam</label><input value={form.naam} onChange={function (e) { setField('naam', e.target.value); }} /></div>
                        <div className="field"><label>Type</label>
                            <select value={form.type} onChange={function (e) { setField('type', e.target.value); }}>
                                {['Smoker', 'BBQ', 'Koeling', 'Transport', 'Overig'].map(function (t) { return <option key={t}>{t}</option>; })}
                            </select>
                        </div>
                        <div className="field"><label>Status</label>
                            <select value={form.status} onChange={function (e) { setField('status', e.target.value); }}>
                                <option value="ok">OK</option>
                                <option value="warn">Aandacht nodig</option>
                                <option value="danger">Defect</option>
                            </select>
                        </div>
                        <div className="field"><label>Aanschafdatum</label><input type="date" value={form.aanschaf_datum} onChange={function (e) { setField('aanschaf_datum', e.target.value); }} /></div>
                        <div className="field full"><label>Notitie</label><textarea rows={2} value={form.notitie || ''} onChange={function (e) { setField('notitie', e.target.value); }} /></div>
                    </div>

                    {/* Logboek */}
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', marginTop: 28, marginBottom: 12 }}>Onderhoudslogboek</h4>
                    {(form.logboek || []).map(function (entry, idx) {
                        return (
                            <div key={idx} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                                <span style={{ color: 'var(--muted)', marginRight: 12 }}>{fmtNl(entry.datum)}</span>
                                <span style={{ fontWeight: 600 }}>{entry.actie}</span>
                                {entry.notitie && <span style={{ color: 'var(--muted)', marginLeft: 8 }}>— {entry.notitie}</span>}
                            </div>
                        );
                    })}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <input style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, font: '400 13px DM Sans,sans-serif' }}
                            placeholder="Actie (bijv. Reiniging)" value={newLog.actie} onChange={function (e) { setNewLog(Object.assign({}, newLog, { actie: e.target.value })); }} />
                        <input style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, font: '400 13px DM Sans,sans-serif' }}
                            placeholder="Notitie" value={newLog.notitie} onChange={function (e) { setNewLog(Object.assign({}, newLog, { notitie: e.target.value })); }} />
                        <button className="btn btn-brand btn-sm" onClick={addLogEntry}><i className="fa-solid fa-plus"></i></button>
                    </div>

                    <div className="editor-actions">
                        <button className="btn btn-brand" onClick={saveItem}><i className="fa-solid fa-save"></i> Opslaan</button>
                        {editing !== 'new' && <button className="btn btn-red" onClick={deleteItem}><i className="fa-solid fa-trash"></i> Verwijderen</button>}
                    </div>
                </div>
            </div>
        );
    }

    // Grid
    var statusColors = { ok: 'var(--green)', warn: 'var(--amber)', danger: 'var(--red)' };
    var statusLabels = { ok: 'OK', warn: 'Aandacht', danger: 'Defect' };
    var statusPills = { ok: 'pill-green', warn: 'pill-amber', danger: 'pill-red' };

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>Materieel ({materieel.length})</h3>
                <button className="btn btn-brand" onClick={newItem}><i className="fa-solid fa-plus"></i> Nieuw</button>
            </div>
            {materieel.length === 0 && <div className="empty-state"><i className="fa-solid fa-wrench"></i><p>Nog geen materieel toegevoegd</p></div>}
            <div className="grid-3">
                {materieel.map(function (m) {
                    return (
                        <div key={m.id} className="rec-card" onClick={function () { editItem(m); }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <div className="rec-cat" style={{ color: statusColors[m.status] || 'var(--muted)' }}>{m.type}</div>
                                <span className={'pill ' + (statusPills[m.status] || 'pill-green')}>{statusLabels[m.status] || 'OK'}</span>
                            </div>
                            <div className="rec-name">{m.naam}</div>
                            <div className="rec-meta">
                                {m.aanschaf_datum && <span><i className="fa-solid fa-calendar"></i> {fmtNl(m.aanschaf_datum)}</span>}
                                <span><i className="fa-solid fa-clipboard-list"></i> {(m.logboek || []).length} logs</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
