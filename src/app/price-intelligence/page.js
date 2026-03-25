'use client';
import { useState, useRef } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';

var LEVERANCIERS = ['Sligro', 'Hanos', 'Bidfood'];

export default function PriceIntelligence() {
    var { data: prijzen, insert: insertPrijs, remove: removePrijs } = useSupabase('supplier_prices', []);
    var showToast = useToast();
    var showConfirm = useConfirm();
    var [tab, setTab] = useState('overzicht');
    var [importLev, setImportLev] = useState('Sligro');
    var [importing, setImporting] = useState(false);
    var [preview, setPreview] = useState(null);
    var [dragOver, setDragOver] = useState(false);
    var [showInfo, setShowInfo] = useState(false);
    var fileRef = useRef();

    function detectSeparator(line) {
        var counts = { ',': 0, ';': 0, '\t': 0 };
        for (var i = 0; i < line.length; i++) {
            if (counts[line[i]] !== undefined) counts[line[i]]++;
        }
        return Object.keys(counts).reduce(function (a, b) { return counts[a] >= counts[b] ? a : b; });
    }

    function fuzzyMatch(headers, keywords) {
        var h = headers.map(function (x) { return x.toLowerCase().trim(); });
        for (var i = 0; i < h.length; i++) {
            for (var k = 0; k < keywords.length; k++) {
                if (h[i].includes(keywords[k])) return i;
            }
        }
        return -1;
    }

    function parseCSV(text) {
        var lines = text.split('\n').filter(function (l) { return l.trim(); });
        if (lines.length < 2) return null;
        var sep = detectSeparator(lines[0]);
        var headers = lines[0].split(sep).map(function (h) { return h.replace(/"/g, '').trim(); });
        var nameIdx = fuzzyMatch(headers, ['naam', 'product', 'artikel', 'omschrijving', 'description', 'item', 'oms']);
        var priceIdx = fuzzyMatch(headers, ['prijs', 'price', 'bedrag', 'amount', 'netto', 'excl', 'kosten', 'tarief']);
        var unitIdx = fuzzyMatch(headers, ['eenheid', 'unit', 'per', 'verpakking', 'inhoud']);
        if (nameIdx < 0) nameIdx = 0;
        if (priceIdx < 0) priceIdx = 1;
        var rows = [];
        for (var i = 1; i < lines.length; i++) {
            var cols = lines[i].split(sep).map(function (c) { return c.replace(/"/g, '').trim(); });
            if (!cols[nameIdx] || cols[nameIdx].length < 2) continue;
            var priceStr = (cols[priceIdx] || '0').replace(',', '.').replace(/[^0-9.]/g, '');
            var prijs = parseFloat(priceStr) || 0;
            if (prijs <= 0) continue;
            rows.push({ product_naam: cols[nameIdx], prijs: prijs, eenheid: unitIdx >= 0 && cols[unitIdx] ? cols[unitIdx] : 'stuks' });
        }
        return { rows: rows, headers: headers, nameIdx: nameIdx, priceIdx: priceIdx };
    }

    function handleFile(file) {
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
            var result = parseCSV(ev.target.result);
            if (!result || result.rows.length === 0) {
                showToast('CSV kon niet worden gelezen of bevat geen geldige prijzen', 'error');
                return;
            }
            setPreview(result);
        };
        reader.readAsText(file);
    }

    function handleInputChange(e) { handleFile(e.target.files[0]); }
    function handleDrop(e) { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }

    async function importRows() {
        if (!preview) return;
        setImporting(true);
        var datum = new Date().toISOString().split('T')[0];
        try {
            for (var i = 0; i < preview.rows.length; i++) {
                var row = preview.rows[i];
                await insertPrijs({ leverancier: importLev, product_naam: row.product_naam, prijs: row.prijs, eenheid: row.eenheid, datum: datum });
            }
            showToast(preview.rows.length + ' prijzen geïmporteerd voor ' + importLev, 'success');
            setPreview(null);
            if (fileRef.current) fileRef.current.value = '';
        } catch (err) {
            showToast('Import mislukt: ' + (err.message || err), 'error');
        }
        setImporting(false);
    }

    function buildComparison() {
        var map = {};
        var sorted = (prijzen || []).slice().sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
        sorted.forEach(function (r) {
            if (!map[r.product_naam]) map[r.product_naam] = {};
            if (!map[r.product_naam][r.leverancier]) {
                map[r.product_naam][r.leverancier] = { prijs: r.prijs, eenheid: r.eenheid, datum: r.datum };
            }
        });
        return map;
    }

    function buildAlerts() {
        var alerts = [];
        var byKey = {};
        (prijzen || []).forEach(function (r) {
            var key = r.leverancier + '|' + r.product_naam;
            if (!byKey[key]) byKey[key] = [];
            byKey[key].push(r);
        });
        Object.keys(byKey).forEach(function (key) {
            var records = byKey[key].slice().sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); });
            if (records.length >= 2) {
                var prev = records[records.length - 2];
                var curr = records[records.length - 1];
                if (prev.prijs > 0) {
                    var pct = ((curr.prijs - prev.prijs) / prev.prijs) * 100;
                    if (pct > 5) {
                        var parts = key.split('|');
                        alerts.push({ leverancier: parts[0], product: parts.slice(1).join('|'), prev_prijs: prev.prijs, curr_prijs: curr.prijs, eenheid: curr.eenheid, pct: pct, datum: curr.datum });
                    }
                }
            }
        });
        return alerts.sort(function (a, b) { return b.pct - a.pct; });
    }

    function clearAll() {
        showConfirm('Alle prijsdata verwijderen? Dit kan niet ongedaan worden gemaakt.', function () {
            Promise.all((prijzen || []).map(function (p) { return removePrijs(p.id); }))
                .then(function () { showToast('Alle prijzen verwijderd', 'success'); });
        });
    }

    function fmt2(n) { return '€\u00a0' + parseFloat(n).toFixed(2).replace('.', ','); }

    var comparison = buildComparison();
    var products = Object.keys(comparison).sort();
    var alerts = buildAlerts();

    var importHistory = (function () {
        var byKey = {};
        (prijzen || []).forEach(function (p) {
            var key = p.leverancier + '|' + (p.datum || (p.created_at || '').split('T')[0]);
            if (!byKey[key]) byKey[key] = { leverancier: p.leverancier, datum: p.datum || (p.created_at || '').split('T')[0], count: 0 };
            byKey[key].count++;
        });
        return Object.values(byKey).sort(function (a, b) { return b.datum.localeCompare(a.datum); });
    })();

    return (
        <>
            {alerts.length > 0 && (
                <div style={{ marginBottom: 16, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
                    <i className="fa-solid fa-triangle-exclamation" style={{ color: 'var(--red)', fontSize: 18, flexShrink: 0 }}></i>
                    <span style={{ color: 'var(--red)', fontWeight: 600, flex: 1 }}>
                        {alerts.length} prijsstijging{alerts.length > 1 ? 'en' : ''} &gt;5% gedetecteerd
                    </span>
                    <button onClick={function () { setTab('alerts'); }} style={{ background: 'rgba(239,68,68,.2)', color: 'var(--red)', border: 'none', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        Bekijk alerts
                    </button>
                </div>
            )}

            <div className="tab-bar">
                <button className={'tab-btn' + (tab === 'overzicht' ? ' active' : '')} onClick={function () { setTab('overzicht'); }}>
                    <i className="fa-solid fa-table"></i> Overzicht
                </button>
                <button className={'tab-btn' + (tab === 'import' ? ' active' : '')} onClick={function () { setTab('import'); }}>
                    <i className="fa-solid fa-file-csv"></i> Import
                </button>
                <button className={'tab-btn' + (tab === 'alerts' ? ' active' : '')} onClick={function () { setTab('alerts'); }}>
                    <i className="fa-solid fa-bell"></i> Alerts
                    {alerts.length > 0 && (
                        <span style={{ background: 'var(--red)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, marginLeft: 5, fontWeight: 700 }}>{alerts.length}</span>
                    )}
                </button>
                <button
                    onClick={function () { setShowInfo(true); }}
                    style={{ marginLeft: 'auto', background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.2)', color: '#3b82f6', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                    <i className="fa-solid fa-circle-info"></i>
                    Hoe werkt dit?
                </button>
            </div>

            {tab === 'overzicht' && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <span style={{ color: 'var(--muted)', fontSize: 13 }}>{products.length} producten · {(prijzen || []).length} prijsregels</span>
                        {(prijzen || []).length > 0 && (
                            <button className="btn btn-red btn-sm" onClick={clearAll}><i className="fa-solid fa-trash"></i> Wis alles</button>
                        )}
                    </div>
                    {products.length === 0 ? (
                        <div className="empty-state">
                            <i className="fa-solid fa-tags"></i>
                            <p>Nog geen prijzen — importeer een CSV via het <strong>Import</strong> tabblad</p>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--card-solid)' }}>
                                        <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--muted)', fontWeight: 600 }}>Product</th>
                                        {LEVERANCIERS.map(function (lev) {
                                            return <th key={lev} style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--muted)', fontWeight: 600 }}>{lev}</th>;
                                        })}
                                        <th style={{ textAlign: 'center', padding: '10px 14px', color: 'var(--muted)', fontWeight: 600 }}>Goedkoopste</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {products.map(function (product) {
                                        var row = comparison[product];
                                        var prices = LEVERANCIERS.map(function (lev) { return row[lev] ? row[lev].prijs : null; });
                                        var validPrices = prices.filter(function (p) { return p !== null; });
                                        var minPrice = validPrices.length > 0 ? Math.min.apply(null, validPrices) : null;
                                        var cheapestIdx = minPrice !== null ? prices.indexOf(minPrice) : -1;
                                        return (
                                            <tr key={product} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '10px 14px', fontWeight: 500 }}>{product}</td>
                                                {LEVERANCIERS.map(function (lev, idx) {
                                                    var d = row[lev];
                                                    var isCheapest = idx === cheapestIdx && d;
                                                    return (
                                                        <td key={lev} style={{ textAlign: 'right', padding: '10px 14px' }}>
                                                            {d ? (
                                                                <span style={{ color: isCheapest ? 'var(--green)' : 'var(--text)', fontWeight: isCheapest ? 700 : 400 }}>
                                                                    {isCheapest && <span style={{ marginRight: 4 }}>★</span>}
                                                                    {fmt2(d.prijs)}<span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 3 }}>/{d.eenheid}</span>
                                                                </span>
                                                            ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                                                        </td>
                                                    );
                                                })}
                                                <td style={{ textAlign: 'center', padding: '10px 14px' }}>
                                                    {cheapestIdx >= 0 ? (
                                                        <span style={{ background: 'rgba(34,197,94,.15)', color: 'var(--green)', padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>{LEVERANCIERS[cheapestIdx]}</span>
                                                    ) : '—'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {tab === 'import' && (
                <>
                    <div className="panel" style={{ marginBottom: 16 }}>
                        <div className="panel-head"><h3>CSV Importeren</h3></div>
                        <div className="panel-body">
                            <div className="form-grid" style={{ marginBottom: 20 }}>
                                <div className="field">
                                    <label>Leverancier</label>
                                    <select value={importLev} onChange={function (e) { setImportLev(e.target.value); setPreview(null); }}>
                                        {LEVERANCIERS.map(function (l) { return <option key={l}>{l}</option>; })}
                                    </select>
                                </div>
                            </div>
                            <div
                                onDrop={handleDrop}
                                onDragOver={function (e) { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={function () { setDragOver(false); }}
                                onClick={function () { fileRef.current && fileRef.current.click(); }}
                                style={{ border: '2px dashed ' + (dragOver ? 'var(--brand)' : 'var(--border)'), borderRadius: 14, padding: '36px 24px', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'var(--brand-light)' : 'transparent', transition: 'all .2s' }}
                            >
                                <i className="fa-solid fa-cloud-arrow-up" style={{ fontSize: 36, color: 'var(--brand)', marginBottom: 12, display: 'block' }}></i>
                                <p style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 4 }}>Sleep een CSV-bestand hierheen</p>
                                <p style={{ color: 'var(--muted)', fontSize: 12 }}>of klik om te kiezen · Sligro, Hanos of Bidfood prijslijst (.csv)</p>
                            </div>
                            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleInputChange} />
                            <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--card-solid)', borderRadius: 10, fontSize: 12, color: 'var(--muted)' }}>
                                <i className="fa-solid fa-circle-info" style={{ marginRight: 6 }}></i>
                                Kolommen worden automatisch herkend. Verwacht: productnaam + prijs (komma of punt als decimaalteken).
                            </div>
                            {preview && (
                                <div style={{ marginTop: 20 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <span style={{ fontWeight: 600, color: 'var(--green)' }}><i className="fa-solid fa-check-circle" style={{ marginRight: 6 }}></i>{preview.rows.length} producten gevonden</span>
                                        <button className="btn btn-brand" onClick={importRows} disabled={importing}>
                                            {importing ? <><i className="fa-solid fa-spinner fa-spin"></i> Importeren...</> : <><i className="fa-solid fa-upload"></i> Importeer voor {importLev}</>}
                                        </button>
                                    </div>
                                    <div style={{ overflowX: 'auto', maxHeight: 280, overflowY: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                            <thead style={{ position: 'sticky', top: 0, background: 'var(--card-solid)' }}>
                                                <tr>
                                                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600 }}>Product</th>
                                                    <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600 }}>Prijs</th>
                                                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600 }}>Eenheid</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {preview.rows.slice(0, 100).map(function (row, i) {
                                                    return (
                                                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                                            <td style={{ padding: '7px 12px' }}>{row.product_naam}</td>
                                                            <td style={{ textAlign: 'right', padding: '7px 12px', color: 'var(--brand)', fontWeight: 600 }}>{fmt2(row.prijs)}</td>
                                                            <td style={{ padding: '7px 12px', color: 'var(--muted)' }}>{row.eenheid}</td>
                                                        </tr>
                                                    );
                                                })}
                                                {preview.rows.length > 100 && (
                                                    <tr><td colSpan={3} style={{ padding: '10px 12px', color: 'var(--muted)', textAlign: 'center' }}>... en {preview.rows.length - 100} meer producten</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="panel">
                        <div className="panel-head"><h3>Importgeschiedenis</h3></div>
                        <div className="panel-body">
                            {importHistory.length === 0 ? (
                                <div className="empty-state"><i className="fa-solid fa-clock-rotate-left"></i><p>Nog geen imports</p></div>
                            ) : (
                                importHistory.map(function (e, i) {
                                    var levColor = e.leverancier === 'Sligro' ? '#e67e22' : e.leverancier === 'Hanos' ? '#3b82f6' : '#22c55e';
                                    return (
                                        <div key={i} className="check-row">
                                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: levColor, flexShrink: 0 }}></div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600 }}>{e.leverancier}</div>
                                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{e.datum} · {e.count} producten</div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </>
            )}

            {tab === 'alerts' && (
                <>
                    {alerts.length === 0 ? (
                        <div className="empty-state">
                            <i className="fa-solid fa-shield-check" style={{ color: 'var(--green)' }}></i>
                            <p style={{ color: 'var(--green)' }}>Geen prijsstijgingen &gt;5% gevonden</p>
                            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Import meerdere CSVs van dezelfde leverancier om prijswijzigingen te detecteren</p>
                        </div>
                    ) : (
                        <div className="panel">
                            <div className="panel-head">
                                <h3>Prijsalerts</h3>
                                <span style={{ fontSize: 12, color: 'var(--red)' }}>{alerts.length} stijging{alerts.length > 1 ? 'en' : ''} &gt;5%</span>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--card-solid)' }}>
                                            <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--muted)', fontWeight: 600 }}>Product</th>
                                            <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--muted)', fontWeight: 600 }}>Leverancier</th>
                                            <th style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--muted)', fontWeight: 600 }}>Vorige prijs</th>
                                            <th style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--muted)', fontWeight: 600 }}>Nieuwe prijs</th>
                                            <th style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--muted)', fontWeight: 600 }}>Stijging</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {alerts.map(function (alert, i) {
                                            return (
                                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{alert.product}</td>
                                                    <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{alert.leverancier}</td>
                                                    <td style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--muted)', textDecoration: 'line-through' }}>{fmt2(alert.prev_prijs)}</td>
                                                    <td style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--red)', fontWeight: 700 }}>{fmt2(alert.curr_prijs)}</td>
                                                    <td style={{ textAlign: 'right', padding: '10px 14px' }}>
                                                        <span style={{ background: 'rgba(239,68,68,.15)', color: 'var(--red)', padding: '3px 10px', borderRadius: 8, fontWeight: 700, fontSize: 13 }}>+{alert.pct.toFixed(1)}%</span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Info Modal */}
            {showInfo && (
                <div
                    style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                    onClick={function () { setShowInfo(false); }}
                >
                    <div
                        style={{ background: '#121215', border: '1px solid rgba(255,255,255,.1)', borderRadius: 20, padding: 32, maxWidth: 600, width: '100%', position: 'relative' }}
                        onClick={function (e) { e.stopPropagation(); }}
                    >
                        <button
                            onClick={function () { setShowInfo(false); }}
                            style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', color: 'rgba(255,255,255,.3)', fontSize: 24, cursor: 'pointer' }}
                        >
                            ×
                        </button>

                        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20, color: '#3b82f6' }}>
                            <i className="fa-solid fa-file-csv" style={{ marginRight: 10 }}></i>
                            Inkoopprijzen importeren
                        </h2>

                        <div style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,.7)' }}>
                            <p style={{ marginBottom: 12 }}>
                                Met deze tool kun je prijzen van de Sligro, Hanos of Bidfood inladen. Dit helpt je om altijd de meest actuele marge-berekening te hebben.
                            </p>

                            <div style={{ background: 'rgba(255,255,255,.03)', padding: 16, borderRadius: 12, marginBottom: 12 }}>
                                <strong style={{ display: 'block', color: '#fff', marginBottom: 8, fontSize: 12, textTransform: 'uppercase' }}>
                                    Hoe kom ik aan een CSV?
                                </strong>
                                <ul style={{ paddingLeft: 18 }}>
                                    <li style={{ marginBottom: 4 }}><strong>Sligro:</strong> Ga naar 'Mijn Sligro' &gt; Bestelgeschiedenis &gt; Export (kies CSV).</li>
                                    <li style={{ marginBottom: 4 }}><strong>Hanos:</strong> In de webshop bij 'Mijn Hanos' kun je prijslijsten downloaden als CSV.</li>
                                    <li style={{ marginBottom: 4 }}><strong>Bidfood:</strong> Gebruik 'Mijn Bidfood' &gt; Downloads &gt; Prijslijsten.</li>
                                </ul>
                            </div>

                            <div style={{ background: 'rgba(59,130,246,.05)', padding: 16, borderRadius: 12 }}>
                                <strong style={{ display: 'block', color: '#3b82f6', marginBottom: 8, fontSize: 12, textTransform: 'uppercase' }}>
                                    Wist je dat?
                                </strong>
                                <p>
                                    De AI leert de CSV kolommen automatisch. Het systeem herkent zelf waar de productnaam en de prijs staan, ook als de volgorde anders is.
                                    Na de import vergelijkt het systeem de nieuwe prijzen met de oude en krijg je een melding bij prijsstijgingen &gt;5%.
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={function () { setShowInfo(false); }}
                            style={{ marginTop: 24, width: '100%', background: '#3b82f6', color: '#000', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 800, cursor: 'pointer' }}
                        >
                            Begrepen, aan de slag!
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
