'use client';
import { useState } from 'react';
import { useSupabase, useSettings } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { fmt, fmtNl, calcLineTotals, today, addDays, genNummer } from '@/lib/utils';

export default function Offertes() {
    var { data: offertes, insert, update, remove } = useSupabase('offertes', []);
    var facturen = useSupabase('facturen', []);
    var { settings } = useSettings();
    var showToast = useToast();
    var showConfirm = useConfirm();
    var [editing, setEditing] = useState(null);
    var [form, setForm] = useState(null);

    function newOfferte() {
        var geldigDagen = (settings && settings.offerte_geldig) || 30;
        var nummer = genNummer((settings && settings.offerte_prefix) || 'OFF-2026-', offertes.length + 1);
        setEditing('new');
        setForm({ nummer: nummer, status: 'concept', client_naam: '', client_adres: '', datum: today(), geldig_tot: addDays(today(), geldigDagen), notitie: '', items: [{ desc: '', qty: 1, prijs: 0, btw: (settings && settings.default_btw) || 21 }] });
    }

    function editOfferte(o) { setEditing(o.id); setForm(JSON.parse(JSON.stringify(o))); }
    function setField(key, val) { setForm(Object.assign({}, form, { [key]: val })); }

    function saveOfferte() {
        if (!form.client_naam) { showToast('Vul een klantnaam in', 'error'); return; }
        if (editing === 'new') {
            insert(form).then(function () { showToast('Offerte aangemaakt', 'success'); setEditing(null); setForm(null); });
        } else {
            var { id, created_at, ...rest } = form;
            update(editing, rest).then(function () { showToast('Offerte bijgewerkt', 'success'); setEditing(null); setForm(null); });
        }
    }

    function deleteOfferte() {
        showConfirm('Weet je zeker dat je deze offerte wilt verwijderen?', function () {
            remove(editing).then(function () { showToast('Offerte verwijderd', 'success'); setEditing(null); setForm(null); });
        });
    }

    function convertToFactuur() {
        var betaaltermijn = (settings && settings.betaaltermijn) || 14;
        var factuurNum = genNummer((settings && settings.factuur_prefix) || 'F2026-', facturen.data.length + 1);
        var factuurData = {
            nummer: factuurNum,
            status: 'concept',
            client_naam: form.client_naam,
            client_adres: form.client_adres,
            datum: today(),
            vervaldatum: addDays(today(), betaaltermijn),
            items: form.items
        };
        facturen.insert(factuurData).then(function () {
            var { id, created_at, ...rest } = Object.assign({}, form, { status: 'geaccepteerd' });
            update(editing, rest).then(function () {
                showToast('Factuur aangemaakt vanuit offerte', 'success');
                setEditing(null); setForm(null);
            });
        });
    }

    function addItem() { setField('items', (form.items || []).concat([{ desc: '', qty: 1, prijs: 0, btw: (settings && settings.default_btw) || 21 }])); }
    function updateItem(idx, key, val) {
        var items = form.items.map(function (item, i) { return i === idx ? Object.assign({}, item, { [key]: val }) : item; });
        setField('items', items);
    }
    function removeItem(idx) { setField('items', form.items.filter(function (_, i) { return i !== idx; })); }

    function downloadOfferte() {
        var totals = calcLineTotals(form.items);
        var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offerte ' + form.nummer + '</title>' +
            '<style>body{font-family:DM Sans,Arial,sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#222}' +
            'h1{color:#FF8C00;margin-bottom:4px}table{width:100%;border-collapse:collapse;margin:20px 0}' +
            'th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #ddd}th{background:#f5f5f5;font-size:12px;text-transform:uppercase}' +
            '.right{text-align:right}.total{font-size:18px;font-weight:bold;color:#FF8C00}</style></head><body>' +
            '<h1>OFFERTE</h1><p>' + form.nummer + '</p>' +
            '<p><strong>Aan:</strong> ' + form.client_naam + '<br>' + (form.client_adres || '') + '</p>' +
            '<p><strong>Datum:</strong> ' + fmtNl(form.datum) + '<br><strong>Geldig tot:</strong> ' + fmtNl(form.geldig_tot) + '</p>' +
            (form.notitie ? '<p><strong>Notitie:</strong> ' + form.notitie + '</p>' : '') +
            '<table><tr><th>Omschrijving</th><th class="right">Aantal</th><th class="right">Prijs</th><th class="right">BTW</th><th class="right">Totaal</th></tr>';
        (form.items || []).forEach(function (item) {
            var lt = (item.qty || 0) * (item.prijs || 0);
            html += '<tr><td>' + (item.desc || '') + '</td><td class="right">' + item.qty + '</td><td class="right">' + fmt(item.prijs) + '</td><td class="right">' + item.btw + '%</td><td class="right">' + fmt(lt) + '</td></tr>';
        });
        html += '</table><p class="right">Subtotaal: ' + fmt(totals.subtotaal) + '<br>BTW: ' + fmt(totals.btw) + '<br><span class="total">Totaal: ' + fmt(totals.totaal) + '</span></p>';
        if (settings) html += '<hr><p style="font-size:12px;color:#888">' + (settings.bedrijfsnaam || '') + ' | ' + (settings.email || '') + '</p>';
        html += '</body></html>';
        var blob = new Blob([html], { type: 'text/html' });
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Offerte_' + form.nummer + '.html'; a.click();
    }

    // Editor
    if (editing !== null && form) {
        var totals = calcLineTotals(form.items);
        var pillMap = { concept: 'pill-blue', verzonden: 'pill-amber', geaccepteerd: 'pill-green', afgewezen: 'pill-red', verlopen: 'pill-red' };
        return (
            <div className="panel">
                <div className="panel-head">
                    <h3>{editing === 'new' ? 'Nieuwe Offerte' : 'Offerte Bewerken'}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={function () { setEditing(null); setForm(null); }}><i className="fa-solid fa-arrow-left"></i> Terug</button>
                </div>
                <div className="panel-body">
                    <div className="form-grid">
                        <div className="field"><label>Offertenummer</label><input value={form.nummer} onChange={function (e) { setField('nummer', e.target.value); }} /></div>
                        <div className="field"><label>Status</label>
                            <select value={form.status} onChange={function (e) { setField('status', e.target.value); }}>
                                {['concept', 'verzonden', 'geaccepteerd', 'afgewezen', 'verlopen'].map(function (s) { return <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>; })}
                            </select>
                        </div>
                        <div className="field"><label>Klantnaam</label><input value={form.client_naam} onChange={function (e) { setField('client_naam', e.target.value); }} /></div>
                        <div className="field"><label>Klantadres</label><input value={form.client_adres} onChange={function (e) { setField('client_adres', e.target.value); }} /></div>
                        <div className="field"><label>Datum</label><input type="date" value={form.datum} onChange={function (e) { setField('datum', e.target.value); }} /></div>
                        <div className="field"><label>Geldig Tot</label><input type="date" value={form.geldig_tot} onChange={function (e) { setField('geldig_tot', e.target.value); }} /></div>
                        <div className="field full"><label>Notitie</label><textarea rows={2} value={form.notitie || ''} onChange={function (e) { setField('notitie', e.target.value); }} /></div>
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
                                    return <tr key={idx}>
                                        <td><input value={item.desc} onChange={function (e) { updateItem(idx, 'desc', e.target.value); }} /></td>
                                        <td><input type="number" value={item.qty} onChange={function (e) { updateItem(idx, 'qty', parseFloat(e.target.value) || 0); }} /></td>
                                        <td><input type="number" step="0.01" value={item.prijs} onChange={function (e) { updateItem(idx, 'prijs', parseFloat(e.target.value) || 0); }} /></td>
                                        <td><input type="number" value={item.btw} onChange={function (e) { updateItem(idx, 'btw', parseFloat(e.target.value) || 0); }} /></td>
                                        <td style={{ fontWeight: 600 }}>{fmt((item.qty || 0) * (item.prijs || 0))}</td>
                                        <td><button className="del-btn" onClick={function () { removeItem(idx); }}><i className="fa-solid fa-trash"></i></button></td>
                                    </tr>;
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
                        <button className="btn btn-brand" onClick={saveOfferte}><i className="fa-solid fa-save"></i> Opslaan</button>
                        <button className="btn btn-cyan" onClick={downloadOfferte}><i className="fa-solid fa-download"></i> Download</button>
                        {editing !== 'new' && form.status === 'geaccepteerd' && <button className="btn btn-green" onClick={convertToFactuur}><i className="fa-solid fa-file-invoice"></i> Naar Factuur</button>}
                        {editing !== 'new' && <button className="btn btn-red" onClick={deleteOfferte}><i className="fa-solid fa-trash"></i> Verwijderen</button>}
                    </div>
                </div>
            </div>
        );
    }

    // List
    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>Offertes ({offertes.length})</h3>
                <button className="btn btn-brand" onClick={newOfferte}><i className="fa-solid fa-plus"></i> Nieuwe Offerte</button>
            </div>
            <div className="panel">
                {offertes.length === 0 && <div className="empty-state"><i className="fa-solid fa-file-signature"></i><p>Nog geen offertes aangemaakt</p></div>}
                {offertes.map(function (o) {
                    var total = 0;
                    (o.items || []).forEach(function (item) { total += (item.qty || 0) * (item.prijs || 0); });
                    var pillMap = { concept: 'pill-blue', verzonden: 'pill-amber', geaccepteerd: 'pill-green', afgewezen: 'pill-red', verlopen: 'pill-red' };
                    return (
                        <div key={o.id} className="ev-row" onClick={function () { editOfferte(o); }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, marginBottom: 2 }}>{o.nummer}</div>
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{o.client_naam} — {fmtNl(o.datum)}</div>
                                {o.notitie && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{o.notitie}</div>}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 600 }}>{fmt(total)}</div>
                                <span className={'pill ' + (pillMap[o.status] || 'pill-blue')}>{o.status}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
