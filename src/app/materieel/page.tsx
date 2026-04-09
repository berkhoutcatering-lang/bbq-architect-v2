/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { fmtNl, today } from '@/lib/utils';
import EmptyState from '@/components/EmptyState';
import MetallicCard from '@/components/MetallicCard';
import type { Materieel as MatType } from '@/types';
import { ArrowLeft, Calendar, ClipboardList, Loader2, Plus, Save, Trash2 } from 'lucide-react';

interface NewLogEntry {
    actie: string;
    notitie: string;
}

export default function Materieel() {
    const { data: materieel, loading, insert, update, remove } = useSupabase<MatType>('materieel', []);
    const showToast = useToast();
    const showConfirm = useConfirm();
    const [editing, setEditing] = useState<number | string | null>(null);
    const [form, setForm] = useState<any>(null);
    const [newLog, setNewLog] = useState<NewLogEntry>({ actie: '', notitie: '' });

    function newItem() {
        setEditing('new');
        setForm({ naam: '', type: 'Overig', status: 'ok', aanschaf_datum: '', notitie: '', logboek: [] });
    }

    function editItem(m: any) { setEditing(m.id); setForm(JSON.parse(JSON.stringify(m))); }
    function setField(key: string, val: any) { setForm(Object.assign({}, form, { [key]: val })); }

    function saveItem() {
        if (!form.naam) { showToast('Vul een naam in', 'error'); return; }
        if (editing === 'new') {
            insert(form).then(function () { showToast('Materieel toegevoegd', 'success'); setEditing(null); setForm(null); }).catch(function(err: any) { showToast('Fout: ' + (err.message || 'onbekend'), 'error'); });
        } else {
            const { id, created_at, ...rest } = form;
            update(editing as number, rest).then(function () { showToast('Materieel bijgewerkt', 'success'); setEditing(null); setForm(null); }).catch(function(err: any) { showToast('Fout: ' + (err.message || 'onbekend'), 'error'); });
        }
    }

    function deleteItem() {
        showConfirm('Materieel verwijderen?', function () {
            remove(editing as number).then(function () { showToast('Verwijderd', 'success'); setEditing(null); setForm(null); }).catch(function(err: any) { showToast('Fout: ' + (err.message || 'onbekend'), 'error'); });
        });
    }

    function addLogEntry() {
        if (!newLog.actie) { showToast('Vul een actie in', 'error'); return; }
        const entry = { datum: today(), actie: newLog.actie, notitie: newLog.notitie };
        setField('logboek', (form.logboek || []).concat([entry]));
        setNewLog({ actie: '', notitie: '' });
        showToast('Logboek bijgewerkt — vergeet niet op te slaan', 'info');
    }

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
            <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
                <Loader2 size={32} className="animate-spin" style={{ marginBottom: 12, display: 'block' }} />
                Laden...
            </div>
        </div>
    );

    if (editing !== null && form) {
        return (
            <MetallicCard hover={false}>
                <div className="panel-head">
                    <h3>{editing === 'new' ? 'Nieuw Materieel' : 'Materieel Bewerken'}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={function () { setEditing(null); setForm(null); }}><ArrowLeft size={14} /> Terug</button>
                </div>
                <div className="panel-body">
                    <div className="form-grid">
                        <div className="field"><label>Naam</label><input value={form.naam} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('naam', e.target.value); }} /></div>
                        <div className="field"><label>Type</label>
                            <select value={form.type} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setField('type', e.target.value); }}>
                                {['Smoker', 'BBQ', 'Koeling', 'Transport', 'Overig'].map(function (t) { return <option key={t}>{t}</option>; })}
                            </select>
                        </div>
                        <div className="field"><label>Status</label>
                            <select value={form.status} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setField('status', e.target.value); }}>
                                <option value="ok">OK</option>
                                <option value="warn">Aandacht nodig</option>
                                <option value="danger">Defect</option>
                            </select>
                        </div>
                        <div className="field"><label>Aanschafdatum</label><input type="date" value={form.aanschaf_datum} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('aanschaf_datum', e.target.value); }} /></div>
                        <div className="field full"><label>Notitie</label><textarea rows={2} value={form.notitie || ''} onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setField('notitie', e.target.value); }} /></div>
                    </div>

                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', marginTop: 28, marginBottom: 12 }}>Onderhoudslogboek</h4>
                    {(form.logboek || []).map(function (entry: any, idx: number) {
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
                            placeholder="Actie (bijv. Reiniging)" value={newLog.actie} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setNewLog(Object.assign({}, newLog, { actie: e.target.value })); }} />
                        <input style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, font: '400 13px DM Sans,sans-serif' }}
                            placeholder="Notitie" value={newLog.notitie} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setNewLog(Object.assign({}, newLog, { notitie: e.target.value })); }} />
                        <button className="btn btn-brand btn-sm" onClick={addLogEntry} aria-label="Logboek item toevoegen"><Plus size={14} /></button>
                    </div>

                    <div className="editor-actions">
                        <button className="btn btn-brand" onClick={saveItem}><Save size={14} /> Opslaan</button>
                        {editing !== 'new' && <button className="btn btn-red" onClick={deleteItem}><Trash2 size={14} /> Verwijderen</button>}
                    </div>
                </div>
            </MetallicCard>
        );
    }

    const statusColors: Record<string, string> = { ok: 'var(--green)', warn: 'var(--amber)', danger: 'var(--red)' };
    const statusLabels: Record<string, string> = { ok: 'OK', warn: 'Aandacht', danger: 'Defect' };
    const statusPills: Record<string, string> = { ok: 'pill-green', warn: 'pill-amber', danger: 'pill-red' };

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>Materieel ({materieel.length})</h3>
                <button className="btn btn-brand" onClick={newItem}><Plus size={14} /> Nieuw</button>
            </div>
            {materieel.length === 0 && <EmptyState page="/materieel" onAction={newItem} />}
            <div className="grid-3">
                {materieel.map(function (m: any) {
                    return (
                        <div key={m.id} className="rec-card" onClick={function () { editItem(m); }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <div className="rec-cat" style={{ color: statusColors[m.status] || 'var(--muted)' }}>{m.type}</div>
                                <span className={'pill ' + (statusPills[m.status] || 'pill-green')}>{statusLabels[m.status] || 'OK'}</span>
                            </div>
                            <div className="rec-name">{m.naam}</div>
                            <div className="rec-meta">
                                {m.aanschaf_datum && <span><Calendar size={14} /> {fmtNl(m.aanschaf_datum)}</span>}
                                <span><ClipboardList size={14} /> {(m.logboek || []).length} logs</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
