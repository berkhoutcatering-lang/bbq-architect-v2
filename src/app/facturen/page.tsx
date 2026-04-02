/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useSettings } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { fmt, fmtNl, calcLineTotals, today, addDays, genNummer } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { generatePDF } from '@/lib/pdfGenerator';
import type { Factuur } from '@/types';

export default function Facturen() {
    const { data: facturen, loading, insert, update, remove } = useSupabase<Factuur>('facturen', []);
    const { settings } = useSettings();
    const showToast = useToast();
    const showConfirm = useConfirm();
    const [editing, setEditing] = useState<string | number | null>(null);
    const [form, setForm] = useState<Record<string, any> | null>(null);

    function newFactuur() {
        const nummer = genNummer((settings && settings.factuur_prefix) || 'F2026-', facturen.length + 1);
        const betaaltermijn = (settings && settings.betaaltermijn) || 14;
        setEditing('new');
        setForm({ nummer: nummer, status: 'concept', client_naam: '', client_adres: '', datum: today(), vervaldatum: addDays(today(), betaaltermijn), items: [{ desc: '', qty: 1, prijs: 0, btw: (settings && settings.default_btw) || 21 }] });
    }

    function editFactuur(f: Factuur) { setEditing(f.id); setForm(JSON.parse(JSON.stringify(f))); }

    function setField(key: string, val: any) { setForm(Object.assign({}, form, { [key]: val })); }

    function saveFactuur() {
        if (!form!.client_naam) { showToast('Vul een klantnaam in', 'error'); return; }
        const oldFactuur = facturen.find(function (f) { return f.id === editing; });
        const statusChanged = oldFactuur && oldFactuur.status !== form!.status && (form!.status === 'verzonden' || form!.status === 'betaald');
        if (editing === 'new') {
            insert(form!).then(function () { showToast('Factuur aangemaakt', 'success'); setEditing(null); setForm(null); }).catch(function(err: any) { showToast('Fout: ' + (err.message || 'onbekend'), 'error'); });
        } else {
            const { id, created_at, ...rest } = form!;
            update(editing as number, rest).then(function () {
                showToast('Factuur bijgewerkt', 'success');
                if (statusChanged) { drainInventory(form!); }
                setEditing(null); setForm(null);
            }).catch(function(err: any) { showToast('Fout: ' + (err.message || 'onbekend'), 'error'); });
        }
    }

    function drainInventory(factuur: Record<string, any>) {
        supabase.from('inventory').select('*').then(function (res: any) {
            const items = res.data || [];
            if (items.length === 0) return;
            const deducted: string[] = [];
            (factuur.items || []).forEach(function (lineItem: any) {
                const desc = (lineItem.desc || '').toLowerCase();
                items.forEach(function (inv: any) {
                    if (desc.indexOf(inv.naam.toLowerCase()) >= 0) {
                        const newStock = Math.max(0, (inv.current_stock || 0) - (lineItem.qty || 0));
                        supabase.from('inventory').update({ current_stock: newStock }).eq('id', inv.id).then(function () { });
                        deducted.push(inv.naam + ' -' + lineItem.qty);
                    }
                });
            });
            if (deducted.length > 0) {
                showToast('📉 Voorraad afgetrokken: ' + deducted.join(', '), 'info');
            }
        });
    }

    function deleteFactuur() {
        showConfirm('Weet je zeker dat je deze factuur wilt verwijderen?', function () {
            remove(editing as number).then(function () { showToast('Factuur verwijderd', 'success'); setEditing(null); setForm(null); }).catch(function(err: any) { showToast('Fout: ' + (err.message || 'onbekend'), 'error'); });
        });
    }

    function addItem() { setField('items', (form!.items || []).concat([{ desc: '', qty: 1, prijs: 0, btw: (settings && settings.default_btw) || 21 }])); }
    function updateItem(idx: number, key: string, val: any) {
        const items = form!.items.map(function (item: any, i: number) { return i === idx ? Object.assign({}, item, { [key]: val }) : item; });
        setField('items', items);
    }
    function removeItem(idx: number) { setField('items', form!.items.filter(function (_: any, i: number) { return i !== idx; })); }

    function downloadFactuur() {
        const totals = calcLineTotals(form!.items);
        generatePDF({ type: 'factuur', form: form, settings: settings, totals: totals });
    }

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
            <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 32, marginBottom: 12, display: 'block' }}></i>
                Laden...
            </div>
        </div>
    );

    if (editing !== null && form) {
        const totals = calcLineTotals(form.items);
        return (
            <div className="panel">
                <div className="panel-head">
                    <h3>{editing === 'new' ? 'Nieuwe Factuur' : 'Factuur Bewerken'}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={function () { setEditing(null); setForm(null); }}>
                        <i className="fa-solid fa-arrow-left"></i> Terug
                    </button>
                </div>
                <div className="panel-body">
                    <div className="form-grid">
                        <div className="field"><label>Factuurnummer</label><input value={form.nummer} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('nummer', e.target.value); }} /></div>
                        <div className="field"><label>Status</label>
                            <select value={form.status} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setField('status', e.target.value); }}>
                                {['concept', 'verzonden', 'betaald', 'vervallen'].map(function (s) { return <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>; })}
                            </select>
                        </div>
                        <div className="field"><label>Klantnaam</label><input value={form.client_naam} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('client_naam', e.target.value); }} /></div>
                        <div className="field"><label>Klantadres</label><input value={form.client_adres} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('client_adres', e.target.value); }} /></div>
                        <div className="field"><label>Datum</label><input type="date" value={form.datum} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('datum', e.target.value); }} /></div>
                        <div className="field"><label>Vervaldatum</label><input type="date" value={form.vervaldatum} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('vervaldatum', e.target.value); }} /></div>
                    </div>
                    <div style={{ marginTop: 24 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <h4 style={{ fontSize: 14, fontWeight: 600 }}>Regels</h4>
                            <button className="btn btn-brand btn-sm" onClick={addItem}><i className="fa-solid fa-plus"></i> Regel</button>
                        </div>
                        <table className="tbl">
                            <thead><tr><th>Omschrijving</th><th style={{ width: 80 }}>Aantal</th><th style={{ width: 100 }}>Prijs</th><th style={{ width: 70 }}>BTW%</th><th style={{ width: 90 }}>Totaal</th><th style={{ width: 30 }}></th></tr></thead>
                            <tbody>
                                {(form.items || []).map(function (item: any, idx: number) {
                                    return (
                                        <tr key={idx}>
                                            <td><input value={item.desc} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateItem(idx, 'desc', e.target.value); }} /></td>
                                            <td><input type="number" value={item.qty} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateItem(idx, 'qty', parseFloat(e.target.value) || 0); }} /></td>
                                            <td><input type="number" step="0.01" value={item.prijs} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateItem(idx, 'prijs', parseFloat(e.target.value) || 0); }} /></td>
                                            <td><input type="number" value={item.btw} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateItem(idx, 'btw', parseFloat(e.target.value) || 0); }} /></td>
                                            <td style={{ fontWeight: 600 }}>{fmt((item.qty || 0) * (item.prijs || 0))}</td>
                                            <td><button className="del-btn" onClick={function () { removeItem(idx); }}><i className="fa-solid fa-trash"></i></button></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <div style={{ textAlign: 'right', marginTop: 12, fontSize: 14 }}>
                            <div style={{ color: 'var(--muted)' }}>Subtotaal: {fmt(totals.subtotaal)}</div>
                            <div style={{ color: 'var(--muted)' }}>BTW: {fmt(totals.btw)}</div>
                            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--brand)' }}>Totaal: {fmt(totals.totaal)}</div>
                        </div>
                    </div>
                    <div className="editor-actions">
                        <button className="btn btn-brand" onClick={saveFactuur}><i className="fa-solid fa-save"></i> Opslaan</button>
                        <button className="btn btn-cyan" onClick={downloadFactuur}><i className="fa-solid fa-file-pdf"></i> PDF</button>
                        {editing !== 'new' && <button className="btn btn-red" onClick={deleteFactuur}><i className="fa-solid fa-trash"></i> Verwijderen</button>}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>Facturen ({facturen.length})</h3>
                <button className="btn btn-brand" onClick={newFactuur}><i className="fa-solid fa-plus"></i> Nieuwe Factuur</button>
            </div>
            <div className="panel">
                {facturen.length === 0 && <div className="empty-state"><i className="fa-solid fa-file-invoice"></i><p>Nog geen facturen aangemaakt</p></div>}
                {facturen.map(function (f) {
                    let total = 0;
                    (f.items || []).forEach(function (item: any) { total += (item.qty || 0) * (item.prijs || 0); });
                    const pill = f.status === 'betaald' ? 'pill-green' : f.status === 'verzonden' ? 'pill-amber' : f.status === 'vervallen' ? 'pill-red' : 'pill-blue';
                    return (
                        <div key={f.id} className="ev-row" onClick={function () { editFactuur(f); }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, marginBottom: 2 }}>{f.nummer}</div>
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{f.client_naam} — {fmtNl(f.datum)}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 600 }}>{fmt(total)}</div>
                                <span className={'pill ' + pill}>{f.status}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
