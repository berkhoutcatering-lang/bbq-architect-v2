'use client';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useSettings } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { fmt, fmtNl, calcLineTotals, today, addDays, genNummer } from '@/lib/utils';

export default function Facturen() {
    var { data: facturen, insert, update, remove } = useSupabase('facturen', []);
    var { settings } = useSettings();
    var showToast = useToast();
    var showConfirm = useConfirm();
    var [editing, setEditing] = useState(null);
    var [form, setForm] = useState(null);

    function newFactuur() {
        var nummer = genNummer((settings && settings.factuur_prefix) || 'F2026-', facturen.length + 1);
        var betaaltermijn = (settings && settings.betaaltermijn) || 14;
        setEditing('new');
        setForm({ nummer: nummer, status: 'concept', client_naam: '', client_adres: '', datum: today(), vervaldatum: addDays(today(), betaaltermijn), items: [{ desc: '', qty: 1, prijs: 0, btw: (settings && settings.default_btw) || 21 }] });
    }

    function editFactuur(f) { setEditing(f.id); setForm(JSON.parse(JSON.stringify(f))); }

    function setField(key, val) { setForm(Object.assign({}, form, { [key]: val })); }

    function saveFactuur() {
        if (!form.client_naam) { showToast('Vul een klantnaam in', 'error'); return; }
        if (editing === 'new') {
            insert(form).then(function () { showToast('Factuur aangemaakt', 'success'); setEditing(null); setForm(null); });
        } else {
            var { id, created_at, ...rest } = form;
            update(editing, rest).then(function () { showToast('Factuur bijgewerkt', 'success'); setEditing(null); setForm(null); });
        }
    }

    function deleteFactuur() {
        showConfirm('Weet je zeker dat je deze factuur wilt verwijderen?', function () {
            remove(editing).then(function () { showToast('Factuur verwijderd', 'success'); setEditing(null); setForm(null); });
        });
    }

    function addItem() { setField('items', (form.items || []).concat([{ desc: '', qty: 1, prijs: 0, btw: (settings && settings.default_btw) || 21 }])); }
    function updateItem(idx, key, val) {
        var items = form.items.map(function (item, i) { return i === idx ? Object.assign({}, item, { [key]: val }) : item; });
        setField('items', items);
    }
    function removeItem(idx) { setField('items', form.items.filter(function (_, i) { return i !== idx; })); }

    function downloadFactuur() {
        var totals = calcLineTotals(form.items);
        var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Factuur ' + form.nummer + '</title>' +
            '<style>body{font-family:DM Sans,Arial,sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#222}' +
            'h1{color:#FF8C00;margin-bottom:4px}table{width:100%;border-collapse:collapse;margin:20px 0}' +
            'th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #ddd}th{background:#f5f5f5;font-size:12px;text-transform:uppercase}' +
            '.right{text-align:right}.total{font-size:18px;font-weight:bold;color:#FF8C00}</style></head><body>' +
            '<h1>FACTUUR</h1><p>' + form.nummer + '</p>' +
            '<p><strong>Aan:</strong> ' + form.client_naam + '<br>' + (form.client_adres || '') + '</p>' +
            '<p><strong>Datum:</strong> ' + fmtNl(form.datum) + '<br><strong>Vervaldatum:</strong> ' + fmtNl(form.vervaldatum) + '</p>' +
            '<table><tr><th>Omschrijving</th><th class="right">Aantal</th><th class="right">Prijs</th><th class="right">BTW</th><th class="right">Totaal</th></tr>';
        (form.items || []).forEach(function (item) {
            var lt = (item.qty || 0) * (item.prijs || 0);
            html += '<tr><td>' + (item.desc || '') + '</td><td class="right">' + item.qty + '</td><td class="right">' + fmt(item.prijs) + '</td><td class="right">' + item.btw + '%</td><td class="right">' + fmt(lt) + '</td></tr>';
        });
        html += '</table><p class="right">Subtotaal: ' + fmt(totals.subtotaal) + '<br>BTW: ' + fmt(totals.btw) + '<br><span class="total">Totaal: ' + fmt(totals.totaal) + '</span></p>';
        if (settings) html += '<hr><p style="font-size:12px;color:#888">' + (settings.bedrijfsnaam || '') + ' | ' + (settings.email || '') + ' | KVK: ' + (settings.kvk || '') + ' | BTW: ' + (settings.btw || '') + ' | IBAN: ' + (settings.iban || '') + '</p>';
        html += '</body></html>';
        var blob = new Blob([html], { type: 'text/html' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'Factuur_' + form.nummer + '.html';
        a.click();
    }

    // Editor
    if (editing !== null && form) {
        var totals = calcLineTotals(form.items);
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
                        <div className="field"><label>Factuurnummer</label><input value={form.nummer} onChange={function (e) { setField('nummer', e.target.value); }} /></div>
                        <div className="field"><label>Status</label>
                            <select value={form.status} onChange={function (e) { setField('status', e.target.value); }}>
                                {['concept', 'verzonden', 'betaald', 'vervallen'].map(function (s) { return <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>; })}
                            </select>
                        </div>
                        <div className="field"><label>Klantnaam</label><input value={form.client_naam} onChange={function (e) { setField('client_naam', e.target.value); }} /></div>
                        <div className="field"><label>Klantadres</label><input value={form.client_adres} onChange={function (e) { setField('client_adres', e.target.value); }} /></div>
                        <div className="field"><label>Datum</label><input type="date" value={form.datum} onChange={function (e) { setField('datum', e.target.value); }} /></div>
                        <div className="field"><label>Vervaldatum</label><input type="date" value={form.vervaldatum} onChange={function (e) { setField('vervaldatum', e.target.value); }} /></div>
                    </div>
                    <div style={{ marginTop: 24 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <h4 style={{ fontSize: 14, fontWeight: 600 }}>Regels</h4>
                            <button className="btn btn-brand btn-sm" onClick={addItem}><i className="fa-solid fa-plus"></i> Regel</button>
                        </div>
                        <table className="tbl">
                            <thead><tr><th>Omschrijving</th><th style={{ width: 80 }}>Aantal</th><th style={{ width: 100 }}>Prijs</th><th style={{ width: 70 }}>BTW%</th><th style={{ width: 90 }}>Totaal</th><th style={{ width: 30 }}></th></tr></thead>
                            <tbody>
                                {(form.items || []).map(function (item, idx) {
                                    return (
                                        <tr key={idx}>
                                            <td><input value={item.desc} onChange={function (e) { updateItem(idx, 'desc', e.target.value); }} /></td>
                                            <td><input type="number" value={item.qty} onChange={function (e) { updateItem(idx, 'qty', parseFloat(e.target.value) || 0); }} /></td>
                                            <td><input type="number" step="0.01" value={item.prijs} onChange={function (e) { updateItem(idx, 'prijs', parseFloat(e.target.value) || 0); }} /></td>
                                            <td><input type="number" value={item.btw} onChange={function (e) { updateItem(idx, 'btw', parseFloat(e.target.value) || 0); }} /></td>
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
                        <button className="btn btn-cyan" onClick={downloadFactuur}><i className="fa-solid fa-download"></i> Download</button>
                        {editing !== 'new' && <button className="btn btn-red" onClick={deleteFactuur}><i className="fa-solid fa-trash"></i> Verwijderen</button>}
                    </div>
                </div>
            </div>
        );
    }

    // List
    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>Facturen ({facturen.length})</h3>
                <button className="btn btn-brand" onClick={newFactuur}><i className="fa-solid fa-plus"></i> Nieuwe Factuur</button>
            </div>
            <div className="panel">
                {facturen.length === 0 && <div className="empty-state"><i className="fa-solid fa-file-invoice"></i><p>Nog geen facturen aangemaakt</p></div>}
                {facturen.map(function (f) {
                    var total = 0;
                    (f.items || []).forEach(function (item) { total += (item.qty || 0) * (item.prijs || 0); });
                    var pill = f.status === 'betaald' ? 'pill-green' : f.status === 'verzonden' ? 'pill-amber' : f.status === 'vervallen' ? 'pill-red' : 'pill-blue';
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
