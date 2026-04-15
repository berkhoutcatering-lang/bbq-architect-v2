/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useRef, useEffect } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import Papa from 'papaparse';
import EmptyState from '@/components/EmptyState';
import PageHint from '@/components/PageHint';
import { AlertTriangle, CloudUpload, Flame, Info, X } from 'lucide-react';

const DEFAULT_LEVERANCIERS = ['Sligro', 'Hanos', 'Bidfood'];

export default function PriceIntelligence() {
    const { data: prijzen, loading: prijzenLoading, insert: insertPrijs, remove: removePrijs } = useSupabase('supplier_prices', []);
    const { data: inventory } = useSupabase('inventory', []);
    const showToast: (msg: string, type?: string) => void = useToast();
    const showConfirm: (msg: string, onConfirm: () => void) => void = useConfirm();
    const [tab, setTab] = useState('overzicht');
    const [newLeverancier, setNewLeverancier] = useState('');

    // Dynamic leveranciers: defaults + any from imported data + custom added
    const [customLevs, setCustomLevs] = useState<string[]>([]);
    const importedLevs = [...new Set((prijzen || []).map((p: any) => p.leverancier).filter(Boolean))];
    const LEVERANCIERS = [...new Set([...DEFAULT_LEVERANCIERS, ...importedLevs, ...customLevs])];

    const [importStep, setImportStep] = useState(1);
    const [importLev, setImportLev] = useState('Sligro');
    const [csvData, setCsvData] = useState<{ headers: string[]; rows: Record<string, any>[] } | null>(null);
    const [mapping, setMapping] = useState({ product_naam: '', prijs: '', eenheid: '' });
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);
    const [importResults, setImportResults] = useState({ success: 0, error: 0 });

    const [dragOver, setDragOver] = useState(false);
    const [showInfo, setShowInfo] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    // Remember last mapping per leverancier for quick re-import
    const MAPPING_STORAGE_KEY = 'bbq_price_mappings';
    function getSavedMapping(lev: string): { product_naam: string; prijs: string; eenheid: string } | null {
        try { const saved = JSON.parse(localStorage.getItem(MAPPING_STORAGE_KEY) || '{}'); return saved[lev] || null; } catch { return null; }
    }
    function saveMappingForLev(lev: string, m: { product_naam: string; prijs: string; eenheid: string }) {
        try { const saved = JSON.parse(localStorage.getItem(MAPPING_STORAGE_KEY) || '{}'); saved[lev] = m; localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(saved)); } catch { /* ignore */ }
    }

    function autoMap(headers: string[]) {
        // First try saved mapping for this leverancier
        const saved = getSavedMapping(importLev);
        if (saved && headers.includes(saved.product_naam) && headers.includes(saved.prijs)) {
            setMapping(saved);
            return true; // Indicates we can skip the mapping step
        }
        // Fallback to auto-detect
        const map = { product_naam: '', prijs: '', eenheid: '' };
        headers.forEach(function (h) {
            const low = h.toLowerCase().trim();
            if (['naam', 'product', 'artikel', 'omschrijving', 'description', 'item'].some(k => low.includes(k))) map.product_naam = h;
            if (['prijs', 'price', 'bedrag', 'amount', 'netto', 'excl'].some(k => low.includes(k))) map.prijs = h;
            if (['eenheid', 'unit', 'per', 'verpakking'].some(k => low.includes(k))) map.eenheid = h;
        });
        setMapping(map);
        return false;
    }

    function handleFile(file: File | undefined) {
        if (!file) return;
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: function (results: any) {
                if (results.errors.length > 0) {
                    showToast('Fout bij het lezen van CSV: ' + results.errors[0].message, 'error');
                    return;
                }
                if (results.data.length === 0) {
                    showToast('CSV is leeg', 'info');
                    return;
                }
                setCsvData({
                    headers: results.meta.fields,
                    rows: results.data
                });
                const hasSavedMapping = autoMap(results.meta.fields);
                setImportStep(hasSavedMapping ? 3 : 2); // Skip mapping step if we remember it
            }
        });
    }

    async function startImport() {
        if (!csvData || !mapping.product_naam || !mapping.prijs) return;
        setImporting(true);
        setImportStep(4);
        setImportResults({ success: 0, error: 0 });

        const rows = csvData.rows;
        const datum = new Date().toISOString().split('T')[0];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const name = row[mapping.product_naam];
            const priceStr = String(row[mapping.prijs] || '0').replace(',', '.').replace(/[^0-9.]/g, '');
            const price = parseFloat(priceStr);
            const unit = mapping.eenheid ? row[mapping.eenheid] : 'stuks';

            if (name && !isNaN(price) && price > 0) {
                try {
                    await insertPrijs({
                        leverancier: importLev,
                        product_naam: name,
                        prijs: price,
                        eenheid: unit || 'stuks',
                        datum: datum
                    });
                    setImportResults(prev => ({ ...prev, success: prev.success + 1 }));
                } catch (e) {
                    setImportResults(prev => ({ ...prev, error: prev.error + 1 }));
                }
            } else {
                setImportResults(prev => ({ ...prev, error: prev.error + 1 }));
            }
            setImportProgress(Math.round(((i + 1) / rows.length) * 100));
        }
        setImporting(false);
        saveMappingForLev(importLev, mapping);
        showToast('Import voltooid!', 'success');
    }

    function resetImport() {
        setImportStep(1);
        setCsvData(null);
        setImportProgress(0);
        setImportResults({ success: 0, error: 0 });
        if (fileRef.current) fileRef.current.value = '';
    }

    function buildComparison(): Record<string, Record<string, any>> {
        const map: Record<string, Record<string, any>> = {};
        const sorted = (prijzen || []).slice().sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        sorted.forEach((r: any) => {
            if (!map[r.product_naam]) map[r.product_naam] = {};
            if (!map[r.product_naam][r.leverancier]) {
                map[r.product_naam][r.leverancier] = { prijs: r.prijs, eenheid: r.eenheid, datum: r.datum };
            }
        });
        return map;
    }

    function buildAlerts() {
        const alerts: any[] = [];
        const byKey: Record<string, any[]> = {};
        (prijzen || []).forEach((r: any) => {
            const key = r.leverancier + '|' + r.product_naam;
            if (!byKey[key]) byKey[key] = [];
            byKey[key].push(r);
        });
        Object.keys(byKey).forEach(key => {
            const records = byKey[key].slice().sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            if (records.length >= 2) {
                const prev = records[records.length - 2];
                const curr = records[records.length - 1];
                if (prev.prijs > 0) {
                    const pct = ((curr.prijs - prev.prijs) / prev.prijs) * 100;
                    if (pct > 5) {
                        const parts = key.split('|');
                        alerts.push({ leverancier: parts[0], product: parts.slice(1).join('|'), prev_prijs: prev.prijs, curr_prijs: curr.prijs, eenheid: curr.eenheid, pct: pct, datum: curr.datum });
                    }
                }
            }
        });
        return alerts.sort((a, b) => b.pct - a.pct);
    }

    function fmt2(n: number | string) { return '€\u00a0' + parseFloat(String(n)).toFixed(2).replace('.', ','); }

    const comparison = buildComparison();
    const products = Object.keys(comparison).sort();
    const alerts = buildAlerts();

    if (prijzenLoading) {
        return (
            <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
                <Flame className="w-8 h-8 text-[var(--color-accent-gold)] animate-pulse" />
            </div>
        );
    }

    return (
        <div className="artisan-page">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div>
                    <h1 className="hero-title">PRICE INTELLIGENCE</h1>
                    <p style={{ color: 'var(--muted)', fontSize: 12, letterSpacing: 1 }}>MONITOR INKOOPPRIJZEN & MARGES</p>
                </div>
                <button
                    onClick={() => setShowInfo(true)}
                    style={{ background: 'color-mix(in srgb, var(--blue) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--blue) 20%, transparent)', color: 'var(--blue)', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                    <Info size={14} /> HELP
                </button>
            </div>

            <PageHint id="price-intelligence" title="Price Intelligence" description="Monitor inkoopprijzen van leveranciers. Importeer CSV-bestanden om prijzen te vergelijken en marges te beschermen." />

            {products.length === 0 && tab === 'overzicht' && <EmptyState page="/price-intelligence" onAction={() => setTab('import')} />}

            {alerts.length > 0 && (
                <div style={{ marginBottom: 16, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
                    <AlertTriangle size={18} style={{ color: 'var(--red)' }} />
                    <span style={{ color: 'var(--red)', fontWeight: 600, flex: 1 }}>{alerts.length} prijsstijgingen &gt;5% gedetecteerd</span>
                    <button onClick={() => setTab('alerts')} className="btn-red" style={{ padding: '5px 12px', fontSize: 12 }}>BEKIJK ALERTS</button>
                </div>
            )}

            <div className="tab-bar mb-24">
                <button className={'tab-btn' + (tab === 'overzicht' ? ' active' : '')} onClick={() => setTab('overzicht')}>OVERZICHT</button>
                <button className={'tab-btn' + (tab === 'import' ? ' active' : '')} onClick={() => setTab('import')}>IMPORT WIZARD</button>
                <button className={'tab-btn' + (tab === 'alerts' ? ' active' : '')} onClick={() => setTab('alerts')}>ALERTS {alerts.length > 0 && <span className="badge-red">{alerts.length}</span>}</button>
            </div>

            {tab === 'overzicht' && (
                <div className="artisan-panel">
                    <div className="panel-head"><h3>PRODUCT VERGELIJKING</h3></div>
                    <div className="panel-body" style={{ overflowX: 'auto' }}>
                        <table className="tbl">
                            <thead>
                                <tr>
                                    <th>PRODUCT</th>
                                    {LEVERANCIERS.map(l => <th key={l} style={{ textAlign: 'right' }}>{l.toUpperCase()}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {products.map(p => {
                                    const row = comparison[p];
                                    // Find cheapest supplier
                                    let cheapest = Infinity;
                                    let cheapestLev = '';
                                    LEVERANCIERS.forEach(l => { if (row[l] && row[l].prijs < cheapest) { cheapest = row[l].prijs; cheapestLev = l; } });
                                    // Check if product is in inventory
                                    const inVoorraad = (inventory || []).some((inv: any) => inv.naam && p.toLowerCase().includes(inv.naam.toLowerCase()));
                                    return (
                                        <tr key={p} style={inVoorraad ? { background: 'rgba(196,163,90,.04)' } : {}}>
                                            <td style={{ fontWeight: 800 }}>
                                                {p.toUpperCase()}
                                                {inVoorraad && <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--color-accent-gold)', background: 'color-mix(in srgb, var(--color-accent-gold) 12%, transparent)', padding: '4px 8px', borderRadius: 4 }}>VOORRAAD</span>}
                                            </td>
                                            {LEVERANCIERS.map(l => (
                                                <td key={l} style={{ textAlign: 'right', background: (row[l] && l === cheapestLev && Object.keys(row).length > 1) ? 'rgba(16,185,129,.06)' : 'transparent' }}>
                                                    {row[l] ? (
                                                        <span style={{ color: l === cheapestLev ? 'var(--emerald)' : 'var(--white)', fontWeight: l === cheapestLev ? 700 : 400 }}>
                                                            {l === cheapestLev && Object.keys(row).length > 1 && <span style={{ fontSize: 9, marginRight: 4 }}>&#x2714;</span>}
                                                            {fmt2(row[l].prijs)} <span style={{ fontSize: 12, color: 'var(--muted)' }}>/{row[l].eenheid}</span>
                                                        </span>
                                                    ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tab === 'import' && (
                <div style={{ maxWidth: 800, margin: '0 auto' }}>
                    {importStep === 1 && (
                        <div className="artisan-panel" style={{ textAlign: 'center', padding: 48 }}>
                            <CloudUpload size={48} style={{ color: 'var(--brand)' }} />
                            <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 16 }}>UPLOAD PRIJSLIJST</h2>
                            <p style={{ color: 'var(--muted)', marginBottom: 32 }}>Sleep je Sligro, Hanos of Bidfood CSV hierheen om te beginnen.</p>

                            <div className="field mb-24" style={{ maxWidth: 400, margin: '0 auto 24px' }}>
                                <label>SELECTEER LEVERANCIER</label>
                                <select value={importLev} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setImportLev(e.target.value)}>
                                    {LEVERANCIERS.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                    <input value={newLeverancier} onChange={(e) => setNewLeverancier(e.target.value)} placeholder="Eigen leverancier toevoegen..." style={{ flex: 1, padding: '6px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
                                    {newLeverancier.trim() && (
                                        <button onClick={() => { setCustomLevs(prev => [...prev, newLeverancier.trim()]); setImportLev(newLeverancier.trim()); setNewLeverancier(''); showToast('Leverancier toegevoegd'); }}
                                            style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, background: 'color-mix(in srgb, var(--color-accent-gold) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--color-accent-gold) 30%, transparent)', borderRadius: 6, color: 'var(--color-accent-gold)', cursor: 'pointer' }}>+ Toevoegen</button>
                                    )}
                                </div>
                            </div>

                            <div
                                onDrop={(e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                                onDragOver={(e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onClick={() => fileRef.current?.click()}
                                style={{ border: '2px dashed ' + (dragOver ? 'var(--blue)' : 'var(--border)'), borderRadius: 20, padding: 40, cursor: 'pointer', background: dragOver ? 'color-mix(in srgb, var(--blue) 5%, transparent)' : 'rgba(255,255,255,.02)', transition: 'all .2s' }}
                            >
                                <div style={{ fontSize: 14, fontWeight: 800, color: dragOver ? 'var(--blue)' : 'var(--white)' }}>KLIK OF SLEEP BESTAND</div>
                                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>CSV BESTANDEN WORDEN ONDERSTEUND</div>
                            </div>
                            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFile(e.target.files?.[0])} />
                        </div>
                    )}

                    {importStep === 2 && csvData && (
                        <div className="artisan-panel">
                            <div className="panel-head"><h3>KOPPEL DE KOLOMMEN</h3></div>
                            <div className="panel-body">
                                <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 24 }}>We hebben de CSV gelezen. Geef aan welke kolom wat is.</p>

                                <div className="grid-2 gap-24 mb-32">
                                    <div className="field">
                                        <label>PRODUCT NAAM <span style={{ color: 'var(--red)' }}>*</span></label>
                                        <select value={mapping.product_naam} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMapping({ ...mapping, product_naam: e.target.value })}>
                                            <option value="">Kies kolom...</option>
                                            {csvData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                        </select>
                                    </div>
                                    <div className="field">
                                        <label>PRIJS (EXCL BTW) <span style={{ color: 'var(--red)' }}>*</span></label>
                                        <select value={mapping.prijs} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMapping({ ...mapping, prijs: e.target.value })}>
                                            <option value="">Kies kolom...</option>
                                            {csvData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                        </select>
                                    </div>
                                    <div className="field">
                                        <label>EENHEID (OPTIONEEL)</label>
                                        <select value={mapping.eenheid} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMapping({ ...mapping, eenheid: e.target.value })}>
                                            <option value="">Geen (standaard &apos;stuks&apos;)</option>
                                            {csvData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: 12 }}>
                                    <button className="btn-brand flex-1" onClick={() => setImportStep(3)} disabled={!mapping.product_naam || !mapping.prijs}>VOLGENDE: PREVIEW</button>
                                    <button className="tab-btn" onClick={resetImport}>ANNULEREN</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {importStep === 3 && csvData && (
                        <div className="artisan-panel">
                            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3>CONTROLEER DE DATA ({csvData.rows.length} REGELS)</h3>
                                <button className="btn-brand" onClick={startImport}>START IMPORT</button>
                            </div>
                            <div className="panel-body" style={{ overflowX: 'auto', maxHeight: 400 }}>
                                <table className="tbl" style={{ fontSize: 12 }}>
                                    <thead>
                                        <tr>
                                            <th>PRODUCT</th>
                                            <th style={{ textAlign: 'right' }}>PRIJS</th>
                                            <th>EENHEID</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {csvData.rows.slice(0, 25).map((row, i) => (
                                            <tr key={i}>
                                                <td>{row[mapping.product_naam]?.toUpperCase()}</td>
                                                <td style={{ textAlign: 'right', color: 'var(--blue)', fontWeight: 800 }}>{fmt2(String(row[mapping.prijs] || '0').replace(',', '.'))}</td>
                                                <td style={{ color: 'var(--muted)' }}>{mapping.eenheid ? row[mapping.eenheid] : 'stuks'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {csvData.rows.length > 25 && <div style={{ textAlign: 'center', padding: 12, fontSize: 12, color: 'var(--muted)' }}>... EN {csvData.rows.length - 25} ANDERE REGELS</div>}
                            </div>
                            <div className="panel-footer" style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
                                <button className="tab-btn w-full" onClick={() => setImportStep(2)}>TERUG NAAR MAPPING</button>
                            </div>
                        </div>
                    )}

                    {importStep === 4 && (
                        <div className="artisan-panel" style={{ textAlign: 'center', padding: 48 }}>
                            <div style={{ marginBottom: 32 }}>
                                <div style={{ fontSize: 48, fontWeight: 900, color: 'var(--blue)', marginBottom: 8 }}>{importProgress}%</div>
                                <div style={{ background: 'rgba(255,255,255,.05)', height: 8, borderRadius: 4, overflow: 'hidden', maxWidth: 400, margin: '0 auto' }}>
                                    <div style={{ background: 'var(--blue)', height: '100%', width: importProgress + '%', transition: 'width .2s' }}></div>
                                </div>
                            </div>

                            <div className="grid-2 gap-24 mb-32" style={{ maxWidth: 400, margin: '0 auto 32px' }}>
                                <div className="artisan-panel" style={{ padding: 16 }}>
                                    <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--green)' }}>{importResults.success}</div>
                                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>SUCCESVOL</div>
                                </div>
                                <div className="artisan-panel" style={{ padding: 16 }}>
                                    <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--red)' }}>{importResults.error}</div>
                                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>FOUTEN / OVERGESLAGEN</div>
                                </div>
                            </div>

                            {!importing && (
                                <button className="btn-brand" style={{ padding: '16px 40px' }} onClick={resetImport}>KLAAR & TERUG</button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {tab === 'alerts' && (
                <div className="artisan-panel">
                    <div className="panel-head"><h3>KRITIEKE PRIJSSTIJGINGEN</h3></div>
                    <div className="panel-body">
                        {alerts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>GEEN STIJGINGEN GEVONDEN</div>
                        ) : (
                            alerts.map((a, i) => (
                                <div key={i} className="check-row" style={{ padding: '16px 20px', marginBottom: 12 }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 12, color: 'var(--red)', fontWeight: 900 }}>{a.leverancier.toUpperCase()}</div>
                                        <div style={{ fontSize: 15, fontWeight: 900 }}>{a.product.toUpperCase()}</div>
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.datum}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--red)' }}>+{a.pct.toFixed(1)}%</div>
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{fmt2(a.prev_prijs)} → {fmt2(a.curr_prijs)}</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {showInfo && (
                <div
                    style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                    onClick={() => setShowInfo(false)}
                >
                    <div
                        className="artisan-panel"
                        style={{ maxWidth: 600, width: '100%', position: 'relative', border: '1px solid var(--blue)' }}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                        <div className="panel-head">
                            <h3>IMPORT INSTRUCTIES</h3>
                            <button className="close-btn" onClick={() => setShowInfo(false)} aria-label="Sluiten"><X size={14} /></button>
                        </div>
                        <div className="panel-body">
                            <p style={{ marginBottom: 16 }}>Importeer CSV lijsten om marges te beschermen.</p>
                            <div style={{ background: 'rgba(255,255,255,.05)', padding: 16, borderRadius: 12, marginBottom: 16 }}>
                                <strong style={{ display: 'block', color: 'var(--brand)', marginBottom: 8 }}>WAAR VIND IK DE CSV?</strong>
                                <ul className="artisan-list">
                                    <li><strong>SLIGRO:</strong> Mijn Sligro &gt; Bestelgeschiedenis &gt; Export (CSV).</li>
                                    <li><strong>HANOS:</strong> Dashboard &gt; Prijslijsten &gt; Download CSV.</li>
                                    <li><strong>BIDFOOD:</strong> Besteloverzicht &gt; Download als Excel/CSV.</li>
                                </ul>
                            </div>
                            <button className="btn-brand w-full" onClick={() => setShowInfo(false)}>BEGREPEN</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
