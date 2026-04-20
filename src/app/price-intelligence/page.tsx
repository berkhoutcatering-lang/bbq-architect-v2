/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useRef, useMemo } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import Papa from 'papaparse';
import EmptyState from '@/components/EmptyState';
import {
    AlertTriangle, CloudUpload, Flame, X, Sparkles, TrendingUp, TrendingDown,
    Zap, Search, ShoppingCart, ArrowUpRight, Package, Store,
    BarChart3, Clock, CheckCircle, History, LineChart as LineChartIcon,
    ArrowLeft, PieChart, HelpCircle, Plus, Info, Download, ChevronRight,
} from 'lucide-react';

const DEFAULT_LEVERANCIERS = ['Sligro', 'Hanos', 'Bidfood'];
const GOLD = '#c4a35a';

/* ───────── helpers ───────── */
function fmt2(n: number | string) {
    const v = parseFloat(String(n));
    if (isNaN(v)) return '€\u00a00,00';
    return '€\u00a0' + v.toFixed(2).replace('.', ',');
}
function daysAgo(dateStr: string) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

/* ───────── tiny atoms ───────── */
function Hint({ tip, children }: { tip: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    return (
        <span
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 3, borderBottom: '1px dotted var(--muted-light)', cursor: 'help' }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
        >
            {children}
            <HelpCircle size={10} style={{ color: 'var(--muted-light)' }} />
            {open && (
                <div style={{
                    position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
                    background: '#0a0a0c', border: `1px solid ${GOLD}55`, borderRadius: 8,
                    padding: '8px 12px', fontSize: 11, color: 'var(--text)', width: 260, zIndex: 50,
                    lineHeight: 1.5, boxShadow: '0 8px 24px rgba(0,0,0,.5)', textAlign: 'left',
                    whiteSpace: 'normal', fontWeight: 400, letterSpacing: 'normal', textTransform: 'none',
                }}>
                    <div style={{ fontSize: 9, letterSpacing: '.18em', color: GOLD, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Uitleg</div>
                    {tip}
                </div>
            )}
        </span>
    );
}

function MetalCard({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
    return (
        <div className={className} style={{
            position: 'relative',
            background: 'var(--card)',
            backdropFilter: 'blur(18px)',
            border: '1px solid rgba(130,130,130,.12)',
            borderRadius: 14,
            overflow: 'hidden',
            ...style,
        }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${GOLD}80, transparent)`, pointerEvents: 'none' }} />
            {children}
        </div>
    );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
    return <div style={{ fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>{children}</div>;
}

function StatTile({ label, value, sub, tone, icon: I }: { label: React.ReactNode; value: React.ReactNode; sub?: string; tone?: 'ok' | 'warn' | 'bad'; icon?: any }) {
    const color = tone === 'ok' ? 'var(--green)' : tone === 'warn' ? 'var(--amber)' : tone === 'bad' ? 'var(--red)' : 'var(--text)';
    return (
        <MetalCard>
            <div style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <Eyebrow>{label}</Eyebrow>
                    {I && <I size={14} style={{ color: 'var(--muted-light)' }} />}
                </div>
                <div style={{ fontFamily: 'Outfit, DM Sans, sans-serif', fontWeight: 500, fontSize: 28, fontVariantNumeric: 'tabular-nums', color }}>{value}</div>
                {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
            </div>
        </MetalCard>
    );
}

function TrendChip({ pct }: { pct: number }) {
    if (Math.abs(pct) < 0.1) return <span style={{ fontSize: 10, color: 'var(--muted)' }}>—</span>;
    const up = pct > 0;
    return (
        <span style={{
            fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 3, fontVariantNumeric: 'tabular-nums',
            color: up ? 'var(--red)' : 'var(--green)',
            background: up ? 'rgba(239,68,68,.1)' : 'rgba(34,197,94,.1)',
        }}>{up ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}%</span>
    );
}

function Pill({ variant = 'draft', children, onClick, style }: { variant?: 'brand' | 'draft' | 'danger' | 'warn' | 'ok'; children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties }) {
    const styles: Record<string, React.CSSProperties> = {
        brand: { background: 'rgba(255,191,0,.12)', color: 'var(--brand)', borderColor: 'rgba(255,191,0,.3)' },
        draft: { background: 'rgba(130,130,130,.14)', color: 'var(--muted)', borderColor: 'var(--border)' },
        danger: { background: 'rgba(239,68,68,.12)', color: 'var(--red)', borderColor: 'rgba(239,68,68,.25)' },
        warn: { background: 'rgba(245,158,11,.12)', color: 'var(--amber)', borderColor: 'rgba(245,158,11,.3)' },
        ok: { background: 'rgba(34,197,94,.12)', color: 'var(--green)', borderColor: 'rgba(34,197,94,.25)' },
    };
    return (
        <span onClick={onClick} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999,
            fontSize: 11, fontWeight: 600, border: '1px solid transparent',
            cursor: onClick ? 'pointer' : 'default',
            ...styles[variant], ...style,
        }}>{children}</span>
    );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
    if (!values || values.length < 2) return <span style={{ fontSize: 10, color: 'var(--muted)' }}>—</span>;
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;
    const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - ((v - min) / range) * 26}`).join(' ');
    return (
        <svg width="60" height="20" viewBox="0 0 100 30" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

/* ═══════════════════════════════════════════════════════════════════ */

export default function PriceIntelligence() {
    const { data: prijzen, loading: prijzenLoading, insert: insertPrijs } = useSupabase('supplier_prices', []);
    const { data: inventory } = useSupabase('inventory', []);
    const showToast: (msg: string, type?: string) => void = useToast();
    const [view, setView] = useState<'overzicht' | 'import'>('overzicht');
    const [newLeverancier, setNewLeverancier] = useState('');
    const [customLevs, setCustomLevs] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [filterLev, setFilterLev] = useState<string>('all');
    const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

    const importedLevs = [...new Set((prijzen || []).map((p: any) => p.leverancier).filter(Boolean))];
    const LEVERANCIERS = [...new Set([...DEFAULT_LEVERANCIERS, ...importedLevs, ...customLevs])];

    /* ───── import state ───── */
    const [importStep, setImportStep] = useState(1);
    const [importLev, setImportLev] = useState('Sligro');
    const [csvData, setCsvData] = useState<{ headers: string[]; rows: Record<string, any>[] } | null>(null);
    const [mapping, setMapping] = useState({ product_naam: '', prijs: '', eenheid: '' });
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);
    const [importResults, setImportResults] = useState({ success: 0, error: 0 });
    const [dragOver, setDragOver] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const MAPPING_STORAGE_KEY = 'bbq_price_mappings';
    function getSavedMapping(lev: string) {
        try { const saved = JSON.parse(localStorage.getItem(MAPPING_STORAGE_KEY) || '{}'); return saved[lev] || null; } catch { return null; }
    }
    function saveMappingForLev(lev: string, m: { product_naam: string; prijs: string; eenheid: string }) {
        try { const saved = JSON.parse(localStorage.getItem(MAPPING_STORAGE_KEY) || '{}'); saved[lev] = m; localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(saved)); } catch { /* ignore */ }
    }
    function autoMap(headers: string[]) {
        const saved = getSavedMapping(importLev);
        if (saved && headers.includes(saved.product_naam) && headers.includes(saved.prijs)) { setMapping(saved); return true; }
        const map = { product_naam: '', prijs: '', eenheid: '' };
        headers.forEach(h => {
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
            header: true, skipEmptyLines: true,
            complete: (results: any) => {
                if (results.errors.length > 0) { showToast('Fout bij het lezen van CSV: ' + results.errors[0].message, 'error'); return; }
                if (results.data.length === 0) { showToast('CSV is leeg', 'info'); return; }
                setCsvData({ headers: results.meta.fields, rows: results.data });
                const hasSaved = autoMap(results.meta.fields);
                setImportStep(hasSaved ? 3 : 2);
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
                    await insertPrijs({ leverancier: importLev, product_naam: name, prijs: price, eenheid: unit || 'stuks', datum });
                    setImportResults(prev => ({ ...prev, success: prev.success + 1 }));
                } catch { setImportResults(prev => ({ ...prev, error: prev.error + 1 })); }
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
        setImportStep(1); setCsvData(null); setImportProgress(0); setImportResults({ success: 0, error: 0 });
        if (fileRef.current) fileRef.current.value = '';
    }

    /* ───── derived data ───── */
    const comparison = useMemo(() => {
        const map: Record<string, Record<string, any>> = {};
        const sorted = (prijzen || []).slice().sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        sorted.forEach((r: any) => {
            if (!map[r.product_naam]) map[r.product_naam] = {};
            if (!map[r.product_naam][r.leverancier]) {
                map[r.product_naam][r.leverancier] = { prijs: r.prijs, eenheid: r.eenheid, datum: r.datum };
            }
        });
        return map;
    }, [prijzen]);

    const history = useMemo(() => {
        const map: Record<string, Record<string, any[]>> = {};
        (prijzen || []).forEach((r: any) => {
            if (!map[r.product_naam]) map[r.product_naam] = {};
            if (!map[r.product_naam][r.leverancier]) map[r.product_naam][r.leverancier] = [];
            map[r.product_naam][r.leverancier].push(r);
        });
        Object.keys(map).forEach(prod => {
            Object.keys(map[prod]).forEach(lev => {
                map[prod][lev].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            });
        });
        return map;
    }, [prijzen]);

    const alerts = useMemo(() => {
        const out: any[] = [];
        const byKey: Record<string, any[]> = {};
        (prijzen || []).forEach((r: any) => {
            const key = r.leverancier + '|' + r.product_naam;
            if (!byKey[key]) byKey[key] = [];
            byKey[key].push(r);
        });
        Object.keys(byKey).forEach(key => {
            const records = byKey[key].slice().sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            if (records.length >= 2) {
                const prev = records[records.length - 2], curr = records[records.length - 1];
                if (prev.prijs > 0) {
                    const pct = ((curr.prijs - prev.prijs) / prev.prijs) * 100;
                    if (Math.abs(pct) > 5) {
                        const parts = key.split('|');
                        out.push({ leverancier: parts[0], product: parts.slice(1).join('|'), prev_prijs: prev.prijs, curr_prijs: curr.prijs, eenheid: curr.eenheid, pct, datum: curr.datum });
                    }
                }
            }
        });
        return out.sort((a, b) => b.pct - a.pct);
    }, [prijzen]);

    const stijgingen = alerts.filter(a => a.pct > 0);
    const dalingen = alerts.filter(a => a.pct < 0);

    /* beste deals (grootste prijsverschil tussen leveranciers) */
    const deals = useMemo(() => {
        return Object.keys(comparison).map(prod => {
            const levs = Object.keys(comparison[prod]);
            if (levs.length < 2) return null;
            const prices = levs.map(l => ({ lev: l, price: comparison[prod][l].prijs, eenheid: comparison[prod][l].eenheid }));
            prices.sort((a, b) => a.price - b.price);
            const cheap = prices[0], expensive = prices[prices.length - 1];
            if (expensive.price === 0) return null;
            const savingsPct = ((expensive.price - cheap.price) / expensive.price) * 100;
            return { product: prod, cheapLev: cheap.lev, cheapPrice: cheap.price, expLev: expensive.lev, expPrice: expensive.price, savingsPct, eenheid: cheap.eenheid };
        }).filter(Boolean).sort((a: any, b: any) => b.savingsPct - a.savingsPct) as any[];
    }, [comparison]);

    /* uitgaven per leverancier (alleen laatste prijs * hoeveel producten) */
    const bySupplier = useMemo(() => {
        const m: Record<string, { count: number; total: number }> = {};
        Object.keys(comparison).forEach(prod => {
            Object.keys(comparison[prod]).forEach(lev => {
                if (!m[lev]) m[lev] = { count: 0, total: 0 };
                m[lev].count += 1;
                m[lev].total += comparison[prod][lev].prijs;
            });
        });
        return Object.keys(m).map(lev => ({ lev, ...m[lev] })).sort((a, b) => b.total - a.total);
    }, [comparison]);

    const totalProducts = Object.keys(comparison).length;
    const avgTrend = useMemo(() => {
        if (alerts.length === 0) return 0;
        return alerts.reduce((s, a) => s + a.pct, 0) / alerts.length;
    }, [alerts]);
    const potentialSavings = useMemo(() => {
        return deals.reduce((s, d) => s + (d.expPrice - d.cheapPrice), 0);
    }, [deals]);

    const suppliersColors: Record<string, string> = {
        Sligro: '#FFBF00', Hanos: GOLD, Bidfood: '#4ECDC4', Makro: '#22c55e', Jumbo: '#a78bfa',
    };
    function colorFor(lev: string) { return suppliersColors[lev] || '#' + Math.floor(Math.abs(lev.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)) % 0xffffff).toString(16).padStart(6, '0'); }

    /* ───────── AI bar ───────── */
    const [q, setQ] = useState('');
    const [aiAnswering, setAiAnswering] = useState(false);
    const [aiResponse, setAiResponse] = useState<string | null>(null);

    const quickAIActions = [
        { label: 'Waar bespaar ik het meeste?', q: 'Welke leverancier is structureel het goedkoopst?' },
        { label: 'Wat stijgt hard?', q: 'Welke producten zijn deze maand >5% gestegen?' },
        { label: 'Welke prijzen zijn oud?', q: 'Welke producten heb ik langer dan 30 dagen niet ge-update?' },
        { label: 'Beste overstap-tip', q: 'Welke overstap levert me de meeste marge op?' },
    ];

    async function askAI(question: string) {
        if (!question.trim()) return;
        setQ(question);
        setAiAnswering(true);
        setAiResponse(null);
        await new Promise(r => setTimeout(r, 800 + Math.random() * 400));
        const lower = question.toLowerCase();
        let resp = '';
        if (lower.includes('goedkoopst') || lower.includes('bespaar')) {
            const top = bySupplier[0];
            resp = top
                ? `Op basis van je laatste imports heb je ${totalProducts} producten getracked. ${top.lev} heeft de meeste producten (${top.count}), maar check per product de goedkoopste optie — zie de "Beste deals" kaart.`
                : 'Nog geen vergelijkbare prijzen — importeer eerst CSVs van minstens 2 leveranciers.';
        } else if (lower.includes('stijg') || lower.includes('hard')) {
            resp = stijgingen.length > 0
                ? `${stijgingen.length} stijgingen >5% gevonden. Grootste: ${stijgingen[0].product} bij ${stijgingen[0].leverancier} (+${stijgingen[0].pct.toFixed(1)}%). Overweeg alternatief via "Beste deals".`
                : 'Geen significante stijgingen. Marges zijn stabiel.';
        } else if (lower.includes('oud') || lower.includes('update')) {
            resp = 'Importeer minimaal maandelijks om trends te herkennen. Open de Import-wizard rechtsboven om nieuwe CSVs te uploaden.';
        } else if (lower.includes('overstap')) {
            resp = deals.length > 0
                ? `Top overstap: ${deals[0].product} — ${deals[0].cheapLev} is ${deals[0].savingsPct.toFixed(1)}% goedkoper dan ${deals[0].expLev}. Bespaart ${fmt2(deals[0].expPrice - deals[0].cheapPrice)} per ${deals[0].eenheid || 'eenheid'}.`
                : 'Nog geen deals te vergelijken — minstens 2 leveranciers nodig per product.';
        } else {
            resp = `Ik zie ${totalProducts} getrackte producten van ${bySupplier.length} leveranciers. ${stijgingen.length} stijgingen en ${dalingen.length} dalingen >5%. Klik een quick-action of een product voor detail.`;
        }
        setAiResponse(resp);
        setAiAnswering(false);
    }

    /* ───────── render ───────── */
    if (prijzenLoading) {
        return (
            <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Flame size={32} style={{ color: GOLD, animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
        );
    }

    if (totalProducts === 0 && view === 'overzicht') {
        return (
            <div style={{ padding: '24px 32px 100px', maxWidth: 1440, margin: '0 auto' }}>
                <HeroHeader onImport={() => setView('import')} totalProducts={0} leveranciers={0} alertsCount={0} trend={0} savings={0} />
                <div style={{ height: 20 }} />
                <EmptyState page="/price-intelligence" onAction={() => setView('import')} />
            </div>
        );
    }

    return (
        <div style={{ padding: '24px 32px 100px', maxWidth: 1440, margin: '0 auto' }}>

            {view === 'overzicht' && (
                <>
                    <HeroHeader
                        onImport={() => setView('import')}
                        totalProducts={totalProducts}
                        leveranciers={bySupplier.length}
                        alertsCount={stijgingen.length}
                        trend={avgTrend}
                        savings={potentialSavings}
                    />

                    <div style={{ height: 16 }} />
                    <AIBar
                        q={q} setQ={setQ}
                        answering={aiAnswering} response={aiResponse}
                        quickActions={quickAIActions}
                        onAsk={askAI}
                        onClear={() => { setAiResponse(null); setQ(''); }}
                    />

                    <div style={{ height: 20 }} />
                    <ActionPanel
                        stijgingen={stijgingen}
                        dalingen={dalingen}
                        deals={deals}
                        onOpenProduct={setSelectedProduct}
                    />

                    {bySupplier.length > 0 && <>
                        <div style={{ height: 20 }} />
                        <SupplierChart bySupplier={bySupplier} colorFor={colorFor} />
                    </>}

                    <div style={{ height: 20 }} />
                    <FilterBar
                        search={search} setSearch={setSearch}
                        filterLev={filterLev} setFilterLev={setFilterLev}
                        leveranciers={LEVERANCIERS}
                        colorFor={colorFor}
                        counts={{ all: totalProducts, stijging: stijgingen.length, daling: dalingen.length }}
                    />

                    <div style={{ height: 14 }} />
                    <ProductTable
                        comparison={comparison}
                        history={history}
                        leveranciers={LEVERANCIERS}
                        inventory={inventory}
                        colorFor={colorFor}
                        search={search}
                        filterLev={filterLev}
                        onOpenProduct={setSelectedProduct}
                    />

                    <div style={{ height: 20 }} />
                    <ZoWerktDit />
                </>
            )}

            {view === 'import' && (
                <ImportWizard
                    onBack={() => { setView('overzicht'); resetImport(); }}
                    step={importStep} setStep={setImportStep}
                    importLev={importLev} setImportLev={setImportLev}
                    LEVERANCIERS={LEVERANCIERS}
                    newLeverancier={newLeverancier} setNewLeverancier={setNewLeverancier}
                    onAddLev={() => { setCustomLevs(p => [...p, newLeverancier.trim()]); setImportLev(newLeverancier.trim()); setNewLeverancier(''); showToast('Leverancier toegevoegd'); }}
                    csvData={csvData}
                    mapping={mapping} setMapping={setMapping}
                    dragOver={dragOver} setDragOver={setDragOver}
                    handleFile={handleFile}
                    fileRef={fileRef}
                    importing={importing}
                    importProgress={importProgress}
                    importResults={importResults}
                    startImport={startImport}
                    resetImport={resetImport}
                />
            )}

            {selectedProduct && (
                <ProductDrawer
                    product={selectedProduct}
                    comparison={comparison[selectedProduct] || {}}
                    history={history[selectedProduct] || {}}
                    leveranciers={LEVERANCIERS}
                    colorFor={colorFor}
                    onClose={() => setSelectedProduct(null)}
                />
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   HERO HEADER
   ═══════════════════════════════════════════════════════════════════ */
function HeroHeader({ onImport, totalProducts, leveranciers, alertsCount, trend, savings }:
    { onImport: () => void; totalProducts: number; leveranciers: number; alertsCount: number; trend: number; savings: number }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <h1 style={{ fontFamily: 'Outfit, DM Sans, sans-serif', fontWeight: 200, fontSize: 34, letterSpacing: '-.015em', margin: 0 }}>
                            Price Intelligence
                        </h1>
                        <span style={{ padding: '2px 8px', borderRadius: 6, background: `${GOLD}20`, border: `1px solid ${GOLD}4D`, fontSize: 10, letterSpacing: '.2em', color: GOLD, fontWeight: 700 }}>
                            SMART PRICING
                        </span>
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                        {totalProducts} producten · {leveranciers} leveranciers getracked · bescherm je marge
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <a href="/voorraad" style={{ textDecoration: 'none' }}>
                        <BtnGhost icon={Package} right={ArrowUpRight}>Voorraad</BtnGhost>
                    </a>
                    <a href="/inkoop" style={{ textDecoration: 'none' }}>
                        <BtnGhost icon={ShoppingCart} right={ArrowUpRight}>Inkoop</BtnGhost>
                    </a>
                    <BtnPrimary icon={CloudUpload} onClick={onImport}>CSV Importeren</BtnPrimary>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
                <StatTile label="Producten getracked" value={totalProducts} sub={`${leveranciers} leveranciers`} icon={Package} />
                <StatTile
                    label={<Hint tip="Prijsstijgingen groter dan 5% t.o.v. vorige import. Indicatief: check of je verkoopprijs meegroeit.">Stijgingen &gt; 5%</Hint>}
                    value={alertsCount}
                    sub={alertsCount > 0 ? 'marge onder druk' : 'alles stabiel'}
                    tone={alertsCount > 3 ? 'bad' : alertsCount > 0 ? 'warn' : 'ok'}
                    icon={TrendingUp}
                />
                <StatTile
                    label={<Hint tip="Gemiddeld percentage verandering over producten met meerdere metingen. Positief = stijgend, negatief = dalend.">Gem. prijstrend</Hint>}
                    value={`${trend > 0 ? '+' : ''}${trend.toFixed(1)}%`}
                    sub="tov vorige import"
                    tone={trend > 2 ? 'bad' : trend < -1 ? 'ok' : undefined}
                    icon={LineChartIcon}
                />
                <StatTile
                    label={<Hint tip="Optelsom van prijsverschillen tussen duurste en goedkoopste leverancier per product — theoretische besparing als je overal naar de goedkoopste overstapt.">Potentiële besparing</Hint>}
                    value={fmt2(savings)}
                    sub="als je overstapt"
                    tone="ok"
                    icon={Sparkles}
                />
                <StatTile label="Laatste import" value={<span style={{ fontSize: 18 }}>actueel</span>} sub="update maandelijks" icon={Clock} />
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   AI BAR
   ═══════════════════════════════════════════════════════════════════ */
function AIBar({ q, setQ, answering, response, quickActions, onAsk, onClear }:
    { q: string; setQ: (s: string) => void; answering: boolean; response: string | null; quickActions: { label: string; q: string }[]; onAsk: (q: string) => void; onClear: () => void }) {
    return (
        <MetalCard>
            <div style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: response || answering ? 14 : 0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `${GOLD}22`, border: `1px solid ${GOLD}4D`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Sparkles size={17} style={{ color: GOLD }} />
                    </div>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <input
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') onAsk(q); }}
                            placeholder="Vraag de AI: waar bespaar ik, wat stijgt, welke leverancier is duurder..."
                            style={{ width: '100%', padding: '9px 100px 9px 14px', borderRadius: 8, background: 'var(--color-bg-deep)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, height: 40, outline: 'none' }}
                        />
                        <button onClick={() => onAsk(q)} disabled={!q.trim() || answering}
                            style={{ position: 'absolute', right: 6, top: 6, height: 28, padding: '0 12px', borderRadius: 8, background: 'var(--brand)', color: '#000', fontWeight: 700, fontSize: 12, border: 'none', cursor: q.trim() && !answering ? 'pointer' : 'not-allowed', opacity: q.trim() && !answering ? 1 : 0.5 }}>
                            {answering ? 'AI denkt…' : 'Vraag AI'}
                        </button>
                    </div>
                </div>
                {!response && !answering && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {quickActions.map(a => (
                            <Pill key={a.label} variant="draft" onClick={() => onAsk(a.q)}>
                                <Zap size={10} /> {a.label}
                            </Pill>
                        ))}
                    </div>
                )}
                {(answering || response) && (
                    <div style={{ marginTop: 4, padding: 14, borderRadius: 10, background: `${GOLD}10`, border: `1px solid ${GOLD}30`, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {answering ? <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>De AI analyseert je prijsdata…</div> : response}
                        {response && (
                            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: 10, letterSpacing: '.15em', color: 'var(--muted-light)', textTransform: 'uppercase', fontWeight: 700 }}>AI antwoord · op basis van live prijsdata</div>
                                <button onClick={onClear} style={{ padding: '5px 10px', fontSize: 11, color: 'var(--muted)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}>Wissen</button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </MetalCard>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   ACTION PANEL
   ═══════════════════════════════════════════════════════════════════ */
function ActionPanel({ stijgingen, dalingen, deals, onOpenProduct }:
    { stijgingen: any[]; dalingen: any[]; deals: any[]; onOpenProduct: (p: string) => void }) {
    const topDeal = deals[0];
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {/* Card 1 — stijgingen */}
            <MetalCard style={{ borderColor: stijgingen.length > 0 ? 'rgba(239,68,68,.3)' : undefined }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: stijgingen.length > 0 ? 'rgba(239,68,68,.04)' : 'transparent' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: stijgingen.length > 0 ? 'rgba(239,68,68,.15)' : 'rgba(34,197,94,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${stijgingen.length > 0 ? 'rgba(239,68,68,.3)' : 'rgba(34,197,94,.25)'}` }}>
                        {stijgingen.length > 0 ? <AlertTriangle size={15} style={{ color: 'var(--red)' }} /> : <CheckCircle size={15} style={{ color: 'var(--green)' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                            <Hint tip="Producten waarvan de prijs tov de vorige import méér dan 5% is gestegen. Check of je verkoopprijs moet mee-bewegen.">Prijsstijgingen</Hint>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{stijgingen.length} items meer dan 5% duurder</div>
                    </div>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300, color: stijgingen.length > 0 ? 'var(--red)' : 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>{stijgingen.length}</div>
                </div>
                <div style={{ padding: 10, maxHeight: 240, overflow: 'auto' }}>
                    {stijgingen.length === 0 ? (
                        <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                            <CheckCircle size={24} style={{ color: 'var(--green)', marginBottom: 8 }} />
                            <div>Geen stijgingen. Marges veilig.</div>
                        </div>
                    ) : stijgingen.slice(0, 5).map((a, i) => (
                        <div key={i} onClick={() => onOpenProduct(a.product)} style={{
                            display: 'grid', gridTemplateColumns: '3px 1fr auto', gap: 10, alignItems: 'center',
                            padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                        }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <div style={{ width: 3, height: 24, background: 'var(--red)', borderRadius: 2 }} />
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.product}</div>
                                <div style={{ fontSize: 10, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                                    {a.leverancier} · {fmt2(a.prev_prijs)} → {fmt2(a.curr_prijs)}
                                </div>
                            </div>
                            <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', background: 'rgba(239,68,68,.15)', color: 'var(--red)', border: '1px solid rgba(239,68,68,.3)' }}>
                                +{a.pct.toFixed(1)}%
                            </span>
                        </div>
                    ))}
                </div>
            </MetalCard>

            {/* Card 2 — dalingen */}
            <MetalCard style={{ borderColor: dalingen.length > 0 ? 'rgba(34,197,94,.3)' : undefined }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: dalingen.length > 0 ? 'rgba(34,197,94,.04)' : 'transparent' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: dalingen.length > 0 ? 'rgba(34,197,94,.15)' : 'rgba(130,130,130,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${dalingen.length > 0 ? 'rgba(34,197,94,.3)' : 'var(--border)'}` }}>
                        <TrendingDown size={15} style={{ color: dalingen.length > 0 ? 'var(--green)' : 'var(--muted)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                            <Hint tip="Producten die goedkoper werden sinds je vorige import — mooi moment om extra voorraad in te slaan of je receptkosten bij te werken.">Prijsdalingen</Hint>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{dalingen.length} items goedkoper dan vorige import</div>
                    </div>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300, color: dalingen.length > 0 ? 'var(--green)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{dalingen.length}</div>
                </div>
                <div style={{ padding: 10, maxHeight: 240, overflow: 'auto' }}>
                    {dalingen.length === 0 ? (
                        <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                            <div>Geen significante dalingen.</div>
                        </div>
                    ) : dalingen.slice(0, 5).map((a, i) => (
                        <div key={i} onClick={() => onOpenProduct(a.product)} style={{
                            display: 'grid', gridTemplateColumns: '3px 1fr auto', gap: 10, alignItems: 'center',
                            padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                        }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <div style={{ width: 3, height: 24, background: 'var(--green)', borderRadius: 2 }} />
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.product}</div>
                                <div style={{ fontSize: 10, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                                    {a.leverancier} · {fmt2(a.prev_prijs)} → {fmt2(a.curr_prijs)}
                                </div>
                            </div>
                            <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', background: 'rgba(34,197,94,.15)', color: 'var(--green)', border: '1px solid rgba(34,197,94,.3)' }}>
                                {a.pct.toFixed(1)}%
                            </span>
                        </div>
                    ))}
                </div>
            </MetalCard>

            {/* Card 3 — AI deal */}
            <MetalCard style={{ borderColor: `${GOLD}4D`, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: `${GOLD}10` }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `${GOLD}26`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${GOLD}4D` }}>
                        <Sparkles size={15} style={{ color: GOLD }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Beste overstap-deals</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>Grootste prijsverschil tussen leveranciers</div>
                    </div>
                    <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', background: `${GOLD}26`, color: GOLD, border: `1px solid ${GOLD}4D` }}>AI</span>
                </div>
                <div style={{ padding: 14 }}>
                    {topDeal ? (
                        <>
                            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 12 }}>
                                <strong style={{ color: 'var(--text)' }}>{topDeal.product}</strong> — <span style={{ color: 'var(--green)' }}>{topDeal.cheapLev}</span> is {topDeal.savingsPct.toFixed(1)}% goedkoper dan <span style={{ color: 'var(--red)' }}>{topDeal.expLev}</span>.
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                                {deals.slice(0, 4).map((d, i) => (
                                    <div key={i} onClick={() => onOpenProduct(d.product)} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 10, alignItems: 'center', padding: '6px 0', cursor: 'pointer' }}>
                                        <div style={{ width: 6, height: 6, borderRadius: 1, background: GOLD }} />
                                        <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.product}</div>
                                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{d.cheapLev}</div>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>−{d.savingsPct.toFixed(0)}%</div>
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => onOpenProduct(topDeal.product)} style={{ width: '100%', padding: '9px 14px', borderRadius: 10, background: 'var(--brand)', color: '#000', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                <Sparkles size={14} /> Bekijk top deal
                            </button>
                        </>
                    ) : (
                        <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                            <Info size={24} style={{ color: 'var(--muted-light)', marginBottom: 8 }} />
                            <div>Importeer minstens 2 leveranciers<br />om te kunnen vergelijken.</div>
                        </div>
                    )}
                </div>
            </MetalCard>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   SUPPLIER CHART (donut + list)
   ═══════════════════════════════════════════════════════════════════ */
function SupplierChart({ bySupplier, colorFor }: { bySupplier: { lev: string; count: number; total: number }[]; colorFor: (s: string) => string }) {
    const [hovered, setHovered] = useState<string | null>(null);
    const total = bySupplier.reduce((s, x) => s + x.count, 0);
    const R = 78, IR = 54, CX = 100, CY = 100;
    const C = 2 * Math.PI * R;
    let offset = 0;
    const segs = bySupplier.map(s => {
        const pct = s.count / total;
        const len = pct * C;
        const seg = { ...s, pct, len, offset, dash: len, gap: C - len, color: colorFor(s.lev) };
        offset += len;
        return seg;
    });
    const hov = hovered ? segs.find(s => s.lev === hovered) : null;

    return (
        <MetalCard>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <PieChart size={14} style={{ color: GOLD }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Producten per leverancier</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Totaal: <span style={{ color: 'var(--text)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{total} producten</span>
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 28, padding: 22 }}>
                <div style={{ position: 'relative', width: 220, height: 220, justifySelf: 'center' }}>
                    <svg width="220" height="220" viewBox="0 0 200 200" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(130,130,130,.08)" strokeWidth={R - IR} />
                        {segs.map(s => (
                            <circle key={s.lev}
                                cx={CX} cy={CY} r={R}
                                fill="none" stroke={s.color}
                                strokeWidth={R - IR}
                                strokeDasharray={`${s.dash} ${s.gap}`}
                                strokeDashoffset={-s.offset}
                                style={{
                                    transition: 'opacity .18s, stroke-width .18s',
                                    opacity: hovered && hovered !== s.lev ? 0.3 : 1,
                                    strokeWidth: hovered === s.lev ? (R - IR) + 6 : (R - IR),
                                    cursor: 'pointer',
                                }}
                                onMouseEnter={() => setHovered(s.lev)}
                                onMouseLeave={() => setHovered(null)}
                            />
                        ))}
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', pointerEvents: 'none' }}>
                        {hov ? <>
                            <div style={{ fontSize: 10, letterSpacing: '.18em', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>{hov.lev}</div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 300, color: hov.color, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{hov.count}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{(hov.pct * 100).toFixed(1)}% · gem. {fmt2(hov.total / hov.count)}</div>
                        </> : <>
                            <div style={{ fontSize: 10, letterSpacing: '.18em', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>Leveranciers</div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 300, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{bySupplier.length}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{total} producten</div>
                        </>}
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                    {segs.slice().sort((a, b) => b.count - a.count).map(s => (
                        <div key={s.lev}
                            onMouseEnter={() => setHovered(s.lev)}
                            onMouseLeave={() => setHovered(null)}
                            style={{
                                display: 'grid', gridTemplateColumns: '10px 1fr auto auto', gap: 10, alignItems: 'center',
                                padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                                background: hovered === s.lev ? 'rgba(255,255,255,.03)' : 'transparent',
                                opacity: hovered && hovered !== s.lev ? 0.45 : 1, transition: 'all .15s',
                            }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 500 }}>{s.lev}</div>
                                <div style={{ position: 'relative', height: 4, background: 'rgba(130,130,130,.1)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${s.pct * 100}%`, background: s.color, borderRadius: 2 }} />
                                </div>
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 600, minWidth: 60, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.count}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', minWidth: 42, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(s.pct * 100).toFixed(1)}%</div>
                        </div>
                    ))}
                </div>
            </div>
        </MetalCard>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   FILTER BAR
   ═══════════════════════════════════════════════════════════════════ */
function FilterBar({ search, setSearch, filterLev, setFilterLev, leveranciers, colorFor, counts }:
    { search: string; setSearch: (s: string) => void; filterLev: string; setFilterLev: (s: string) => void; leveranciers: string[]; colorFor: (s: string) => string; counts: { all: number; stijging: number; daling: number } }) {
    return (
        <MetalCard>
            <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Zoek product…"
                        style={{ width: '100%', paddingLeft: 34, paddingRight: 34, height: 34, borderRadius: 8, background: 'var(--color-bg-deep)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, outline: 'none' }}
                    />
                    {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 4, top: 3, width: 28, height: 28, background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={12} /></button>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Pill variant={filterLev === 'all' ? 'brand' : 'draft'} onClick={() => setFilterLev('all')}>Alles · {counts.all}</Pill>
                    <Pill variant={filterLev === 'stijging' ? 'brand' : 'draft'} onClick={() => setFilterLev('stijging')}>
                        <TrendingUp size={10} /> Stijgingen · {counts.stijging}
                    </Pill>
                    <Pill variant={filterLev === 'daling' ? 'brand' : 'draft'} onClick={() => setFilterLev('daling')}>
                        <TrendingDown size={10} /> Dalingen · {counts.daling}
                    </Pill>
                    {leveranciers.map(l => (
                        <Pill key={l} variant={filterLev === l ? 'brand' : 'draft'} onClick={() => setFilterLev(l)}>
                            <span style={{ width: 6, height: 6, borderRadius: 1, background: colorFor(l), display: 'inline-block' }} />
                            {l}
                        </Pill>
                    ))}
                </div>
            </div>
        </MetalCard>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   PRODUCT TABLE
   ═══════════════════════════════════════════════════════════════════ */
function ProductTable({ comparison, history, leveranciers, inventory, colorFor, search, filterLev, onOpenProduct }:
    { comparison: Record<string, Record<string, any>>; history: Record<string, Record<string, any[]>>; leveranciers: string[]; inventory: any[]; colorFor: (s: string) => string; search: string; filterLev: string; onOpenProduct: (p: string) => void }) {
    const products = Object.keys(comparison).sort();

    const filtered = products.filter(p => {
        if (search && !p.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterLev === 'all') return true;
        if (filterLev === 'stijging' || filterLev === 'daling') {
            const hasChange = Object.keys(history[p] || {}).some(lev => {
                const recs = history[p][lev];
                if (recs.length < 2) return false;
                const pct = ((recs[recs.length - 1].prijs - recs[recs.length - 2].prijs) / recs[recs.length - 2].prijs) * 100;
                return filterLev === 'stijging' ? pct > 5 : pct < -5;
            });
            return hasChange;
        }
        return !!comparison[p][filterLev];
    });

    return (
        <MetalCard style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <BarChart3 size={14} style={{ color: GOLD }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Prijs-vergelijking</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {filtered.length} producten</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted-light)', letterSpacing: '.15em', textTransform: 'uppercase', fontWeight: 700 }}>
                    <Hint tip="Groen = goedkoopste leverancier voor dit product. ✓ markeert de beste deal. Sparkline toont prijsverloop over alle imports.">Best-supplier highlight</Hint>
                </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: 'rgba(130,130,130,.04)', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>Product</th>
                            <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>Trend</th>
                            {leveranciers.map(l => (
                                <th key={l} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ width: 6, height: 6, borderRadius: 1, background: colorFor(l) }} />
                                        {l}
                                    </span>
                                </th>
                            ))}
                            <th style={{ padding: '10px 12px' }} />
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(p => {
                            const row = comparison[p];
                            let cheapest = Infinity;
                            let cheapestLev = '';
                            leveranciers.forEach(l => { if (row[l] && row[l].prijs < cheapest) { cheapest = row[l].prijs; cheapestLev = l; } });
                            const inVoorraad = (inventory || []).some((inv: any) => inv.naam && p.toLowerCase().includes(inv.naam.toLowerCase()));
                            const allHist = Object.keys(history[p] || {}).flatMap(l => history[p][l].map((r: any) => r.prijs));
                            const primary = cheapestLev && history[p]?.[cheapestLev] ? history[p][cheapestLev] : null;
                            const trendPct = primary && primary.length >= 2 ? ((primary[primary.length - 1].prijs - primary[primary.length - 2].prijs) / primary[primary.length - 2].prijs) * 100 : 0;

                            return (
                                <tr key={p}
                                    onClick={() => onOpenProduct(p)}
                                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .12s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.02)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ padding: '10px 12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{ width: 3, height: 28, background: inVoorraad ? GOLD : 'var(--muted-light)', borderRadius: 2 }} />
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 500, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p}</div>
                                                {inVoorraad && <div style={{ fontSize: 9, color: GOLD, letterSpacing: '.1em', fontWeight: 700, textTransform: 'uppercase' }}>✓ IN VOORRAAD</div>}
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Sparkline values={allHist} color={trendPct > 0 ? 'var(--red)' : trendPct < 0 ? 'var(--green)' : 'var(--muted)'} />
                                            <TrendChip pct={trendPct} />
                                        </div>
                                    </td>
                                    {leveranciers.map(l => {
                                        const cell = row[l];
                                        const isBest = cell && l === cheapestLev && Object.keys(row).length > 1;
                                        return (
                                            <td key={l} style={{ padding: '10px 12px', textAlign: 'right', background: isBest ? 'rgba(34,197,94,.06)' : 'transparent' }}>
                                                {cell ? (
                                                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', fontVariantNumeric: 'tabular-nums' }}>
                                                        <div style={{ color: isBest ? 'var(--green)' : 'var(--text)', fontWeight: isBest ? 700 : 500, fontSize: 12 }}>
                                                            {isBest && <span style={{ fontSize: 9, marginRight: 4 }}>✓</span>}
                                                            {fmt2(cell.prijs)}
                                                        </div>
                                                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>/ {cell.eenheid || 'stuks'}</div>
                                                    </div>
                                                ) : <span style={{ color: 'var(--muted-light)', fontSize: 11 }}>—</span>}
                                            </td>
                                        );
                                    })}
                                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                        <ChevronRight size={14} style={{ color: 'var(--muted)' }} />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {filtered.length === 0 && (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                    <Search size={28} style={{ color: 'var(--muted-light)', marginBottom: 10 }} />
                    <div>Geen producten gevonden met deze filter.</div>
                </div>
            )}
        </MetalCard>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   PRODUCT DRAWER
   ═══════════════════════════════════════════════════════════════════ */
function ProductDrawer({ product, comparison, history, leveranciers, colorFor, onClose }:
    { product: string; comparison: Record<string, any>; history: Record<string, any[]>; leveranciers: string[]; colorFor: (s: string) => string; onClose: () => void }) {
    const [tab, setTab] = useState<'historie' | 'leveranciers' | 'audit'>('historie');
    const supsWithPrice = leveranciers.filter(l => comparison[l]);
    const cheapest = supsWithPrice.reduce<{ lev: string; price: number } | null>((acc, l) => {
        const p = comparison[l].prijs;
        if (!acc || p < acc.price) return { lev: l, price: p };
        return acc;
    }, null);

    const allHist: { lev: string; price: number; datum: string; created_at: string }[] = [];
    Object.keys(history).forEach(l => history[l].forEach(r => allHist.push({ lev: l, price: r.prijs, datum: r.datum, created_at: r.created_at })));
    allHist.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const allPrices = allHist.map(h => h.price);
    const minP = allPrices.length ? Math.min(...allPrices) : 0;
    const maxP = allPrices.length ? Math.max(...allPrices) : 0;

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', zIndex: 9998 }} />
            <aside style={{ position: 'fixed', right: 0, top: 0, height: '100vh', width: 620, maxWidth: '100vw', background: 'var(--color-bg-elevated)', borderLeft: '1px solid var(--border)', zIndex: 9999, boxShadow: '-20px 0 40px rgba(0,0,0,.4)', display: 'flex', flexDirection: 'column', animation: 'slideInRight .35s cubic-bezier(.16,1,.3,1)' }}>

                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: `linear-gradient(180deg, ${GOLD}12, transparent)`, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', background: `${GOLD}26`, color: GOLD, border: `1px solid ${GOLD}4D` }}>PRODUCT</span>
                                {cheapest && supsWithPrice.length > 1 && (
                                    <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', background: 'rgba(34,197,94,.15)', color: 'var(--green)', border: '1px solid rgba(34,197,94,.3)' }}>
                                        BEST: {cheapest.lev.toUpperCase()}
                                    </span>
                                )}
                            </div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 300, letterSpacing: '-.01em' }}>{product}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{supsWithPrice.length} leverancier(s) · {allHist.length} prijspunten in historie</div>
                        </div>
                        <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={16} />
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 20 }}>
                        <div>
                            <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--muted-light)', fontWeight: 700, textTransform: 'uppercase' }}>Goedkoopste</div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 300, color: 'var(--green)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                                {cheapest ? fmt2(cheapest.price) : '—'}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>{cheapest ? cheapest.lev : ''}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--muted-light)', fontWeight: 700, textTransform: 'uppercase' }}>Laagst ooit</div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 300, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                                {allPrices.length ? fmt2(minP) : '—'}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--muted-light)', fontWeight: 700, textTransform: 'uppercase' }}>Hoogst ooit</div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 300, color: 'var(--red)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                                {allPrices.length ? fmt2(maxP) : '—'}
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 4, padding: '10px 18px 0', borderBottom: '1px solid var(--border)' }}>
                    {([
                        { id: 'historie' as const, label: 'Prijshistorie', Icon: LineChartIcon },
                        { id: 'leveranciers' as const, label: 'Leveranciers', Icon: Store },
                        { id: 'audit' as const, label: 'Audit log', Icon: History },
                    ]).map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            style={{
                                padding: '8px 14px', background: 'transparent', border: 'none',
                                borderBottom: `2px solid ${tab === t.id ? GOLD : 'transparent'}`,
                                color: tab === t.id ? 'var(--text)' : 'var(--muted)',
                                cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: 6, transition: '.15s',
                            }}>
                            <t.Icon size={12} />
                            {t.label}
                        </button>
                    ))}
                </div>

                <div style={{ flex: 1, overflow: 'auto', padding: 22 }}>
                    {tab === 'historie' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <Eyebrow>Prijsverloop per leverancier</Eyebrow>
                                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {supsWithPrice.map(lev => {
                                        const recs = history[lev] || [];
                                        if (recs.length === 0) return null;
                                        const prices = recs.map(r => r.prijs);
                                        const lmin = Math.min(...prices), lmax = Math.max(...prices);
                                        const range = lmax - lmin || 1;
                                        const pts = prices.map((v, i) => `${(i / (Math.max(prices.length - 1, 1))) * 100},${40 - ((v - lmin) / range) * 36}`).join(' ');
                                        const trendPct = recs.length >= 2 ? ((recs[recs.length - 1].prijs - recs[recs.length - 2].prijs) / recs[recs.length - 2].prijs) * 100 : 0;
                                        return (
                                            <div key={lev} style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                                    <div>
                                                        <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <span style={{ width: 8, height: 8, borderRadius: 1, background: colorFor(lev) }} />
                                                            {lev}
                                                        </div>
                                                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{recs.length} metingen · nu {fmt2(recs[recs.length - 1].prijs)}</div>
                                                    </div>
                                                    <TrendChip pct={trendPct} />
                                                </div>
                                                <div style={{ position: 'relative', height: 60, padding: 4 }}>
                                                    <svg width="100%" height="50" viewBox="0 0 100 40" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                                                        <polyline points={pts} fill="none" stroke={colorFor(lev)} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                                                        <polyline points={`0,40 ${pts} 100,40`} fill={`${colorFor(lev)}22`} stroke="none" />
                                                    </svg>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div style={{ padding: 12, borderRadius: 10, background: `${GOLD}10`, border: `1px solid ${GOLD}33`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                <Sparkles size={14} style={{ color: GOLD, flexShrink: 0, marginTop: 1 }} />
                                <div style={{ fontSize: 12, lineHeight: 1.55 }}>
                                    <strong>AI-tip:</strong>{' '}
                                    {cheapest && supsWithPrice.length > 1
                                        ? `${cheapest.lev} is nu het goedkoopst voor dit product. Wissel leverancier alleen als lead-time en kwaliteit matchen.`
                                        : `Importeer een 2e leverancier om écht te kunnen vergelijken.`}
                                </div>
                            </div>
                        </div>
                    )}

                    {tab === 'leveranciers' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <Eyebrow>
                                <Hint tip="Directe vergelijking van laatste bekende prijs per leverancier. Groen = goedkoopste. Percentage is verschil t.o.v. goedkoopste.">Prijsvergelijking</Hint>
                            </Eyebrow>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {supsWithPrice.map(lev => {
                                    const price = comparison[lev].prijs;
                                    const isBest = cheapest && lev === cheapest.lev;
                                    const diff = cheapest ? ((price - cheapest.price) / cheapest.price) * 100 : 0;
                                    return (
                                        <div key={lev} style={{
                                            display: 'grid', gridTemplateColumns: '6px 1fr auto auto', gap: 10, alignItems: 'center',
                                            padding: '10px 12px', borderRadius: 8,
                                            background: isBest ? `${colorFor(lev)}10` : 'transparent',
                                            border: `1px solid ${isBest ? `${colorFor(lev)}4D` : 'var(--border)'}`,
                                        }}>
                                            <div style={{ width: 6, height: 6, borderRadius: 1, background: colorFor(lev) }} />
                                            <div style={{ fontSize: 12 }}>
                                                <div style={{ fontWeight: 600 }}>
                                                    {lev}
                                                    {isBest && <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--green)', letterSpacing: '.1em' }}>✓ GOEDKOOPST</span>}
                                                </div>
                                                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>/ {comparison[lev].eenheid || 'stuks'} · {daysAgo(comparison[lev].datum)}d geleden</div>
                                            </div>
                                            <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt2(price)}</div>
                                            <div style={{ fontSize: 10, minWidth: 50, textAlign: 'right', color: diff === 0 ? 'var(--muted)' : 'var(--red)', fontWeight: 600 }}>
                                                {diff === 0 ? '—' : `+${diff.toFixed(1)}%`}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div style={{ padding: 12, borderRadius: 10, background: `${GOLD}10`, border: `1px solid ${GOLD}33`, display: 'flex', gap: 10 }}>
                                <Info size={14} style={{ color: GOLD, flexShrink: 0, marginTop: 1 }} />
                                <div style={{ fontSize: 12, lineHeight: 1.55 }}>
                                    <strong>Tip:</strong> Overstappen is niet altijd de moeite. Neem lead-time, minimum orderhoeveelheid en kwaliteit mee.
                                </div>
                            </div>
                        </div>
                    )}

                    {tab === 'audit' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                            <Eyebrow>Alle prijsmetingen · nieuwste eerst</Eyebrow>
                            <div style={{ marginTop: 10 }}>
                                {allHist.map((h, i) => (
                                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 12, padding: '10px 0', borderBottom: i < allHist.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
                                        <div style={{ width: 28, height: 28, borderRadius: 6, background: `${colorFor(h.lev)}22`, border: `1px solid ${colorFor(h.lev)}4D`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Store size={12} style={{ color: colorFor(h.lev) }} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 12, fontWeight: 500 }}>{h.lev}</div>
                                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{h.datum}</div>
                                        </div>
                                        <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt2(h.price)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   IMPORT WIZARD
   ═══════════════════════════════════════════════════════════════════ */
function ImportWizard(props: any) {
    const { onBack, step, setStep, importLev, setImportLev, LEVERANCIERS, newLeverancier, setNewLeverancier, onAddLev, csvData, mapping, setMapping, dragOver, setDragOver, handleFile, fileRef, importing, importProgress, importResults, startImport, resetImport } = props;

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <button onClick={onBack} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <ArrowLeft size={14} /> Terug naar overzicht
                </button>
                <div>
                    <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 200, fontSize: 28, margin: 0 }}>CSV Import Wizard</h1>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Stap {step} van 4</div>
                </div>
            </div>

            {/* Progress bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
                {[1, 2, 3, 4].map(n => (
                    <div key={n} style={{ height: 4, borderRadius: 2, background: n <= step ? GOLD : 'rgba(130,130,130,.15)', transition: 'background .3s' }} />
                ))}
            </div>

            <div style={{ maxWidth: 800, margin: '0 auto' }}>
                {step === 1 && (
                    <MetalCard>
                        <div style={{ padding: 40, textAlign: 'center' }}>
                            <div style={{ width: 64, height: 64, borderRadius: 16, background: `${GOLD}18`, border: `1px solid ${GOLD}4D`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                                <CloudUpload size={28} style={{ color: GOLD }} />
                            </div>
                            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 300, marginBottom: 8 }}>Upload prijslijst</h2>
                            <p style={{ color: 'var(--muted)', marginBottom: 28, fontSize: 13 }}>
                                Sleep je <Hint tip="Sligro: Mijn Sligro > Bestelgeschiedenis > Export. Hanos: Dashboard > Prijslijsten > Download CSV. Bidfood: Besteloverzicht > Download als Excel/CSV.">Sligro, Hanos of Bidfood CSV</Hint> hierheen om te beginnen.
                            </p>

                            <div style={{ maxWidth: 400, margin: '0 auto 24px', textAlign: 'left' }}>
                                <Eyebrow>Leverancier</Eyebrow>
                                <select value={importLev} onChange={(e) => setImportLev(e.target.value)} style={{ width: '100%', marginTop: 6, padding: '10px 12px', background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}>
                                    {LEVERANCIERS.map((l: string) => <option key={l} value={l}>{l}</option>)}
                                </select>
                                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                    <input value={newLeverancier} onChange={(e) => setNewLeverancier(e.target.value)} placeholder="Eigen leverancier toevoegen..."
                                        style={{ flex: 1, padding: '8px 10px', fontSize: 12, background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
                                    {newLeverancier.trim() && (
                                        <button onClick={onAddLev} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, background: `${GOLD}26`, border: `1px solid ${GOLD}4D`, borderRadius: 6, color: GOLD, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Plus size={12} /> Toevoegen
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div
                                onDrop={(e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                                onDragOver={(e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onClick={() => fileRef.current?.click()}
                                style={{
                                    border: `2px dashed ${dragOver ? GOLD : 'var(--border-strong)'}`,
                                    borderRadius: 16, padding: 40, cursor: 'pointer',
                                    background: dragOver ? `${GOLD}10` : 'rgba(255,255,255,.02)',
                                    transition: 'all .2s',
                                }}>
                                <CloudUpload size={32} style={{ color: dragOver ? GOLD : 'var(--muted)', margin: '0 auto 12px' }} />
                                <div style={{ fontSize: 14, fontWeight: 600, color: dragOver ? GOLD : 'var(--text)' }}>Klik of sleep bestand</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>CSV-bestanden worden ondersteund</div>
                            </div>
                            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFile(e.target.files?.[0])} />
                        </div>
                    </MetalCard>
                )}

                {step === 2 && csvData && (
                    <MetalCard>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Koppel de kolommen</h3>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                                We lazen <strong style={{ color: 'var(--text)' }}>{csvData.rows.length}</strong> regels. Geef aan welke kolom wat is.
                            </div>
                        </div>
                        <div style={{ padding: 24 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                                <div>
                                    <Eyebrow>Product naam *</Eyebrow>
                                    <select value={mapping.product_naam} onChange={(e) => setMapping({ ...mapping, product_naam: e.target.value })}
                                        style={{ width: '100%', marginTop: 6, padding: '9px 12px', background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}>
                                        <option value="">Kies kolom...</option>
                                        {csvData.headers.map((h: string) => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <Eyebrow><Hint tip="Altijd exclusief BTW — zo blijft vergelijking eerlijk en kunnen we marges correct berekenen.">Prijs (excl BTW) *</Hint></Eyebrow>
                                    <select value={mapping.prijs} onChange={(e) => setMapping({ ...mapping, prijs: e.target.value })}
                                        style={{ width: '100%', marginTop: 6, padding: '9px 12px', background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}>
                                        <option value="">Kies kolom...</option>
                                        {csvData.headers.map((h: string) => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <Eyebrow>Eenheid (optioneel)</Eyebrow>
                                    <select value={mapping.eenheid} onChange={(e) => setMapping({ ...mapping, eenheid: e.target.value })}
                                        style={{ width: '100%', marginTop: 6, padding: '9px 12px', background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}>
                                        <option value="">Geen (standaard 'stuks')</option>
                                        {csvData.headers.map((h: string) => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <BtnPrimary onClick={() => setStep(3)}>Volgende: preview</BtnPrimary>
                                <BtnGhost onClick={resetImport}>Annuleren</BtnGhost>
                            </div>
                        </div>
                    </MetalCard>
                )}

                {step === 3 && csvData && (
                    <MetalCard>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Controleer de data</h3>
                                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{csvData.rows.length} regels klaar voor import naar <strong style={{ color: GOLD }}>{importLev}</strong></div>
                            </div>
                            <BtnPrimary icon={Download} onClick={startImport}>Start import</BtnPrimary>
                        </div>
                        <div style={{ overflowX: 'auto', maxHeight: 400 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                    <tr style={{ background: 'rgba(130,130,130,.04)', borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>Product</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>Prijs</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>Eenheid</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {csvData.rows.slice(0, 25).map((row: any, i: number) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '10px 16px', fontSize: 12 }}>{row[mapping.product_naam]}</td>
                                            <td style={{ padding: '10px 16px', textAlign: 'right', color: GOLD, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt2(String(row[mapping.prijs] || '0').replace(',', '.'))}</td>
                                            <td style={{ padding: '10px 16px', color: 'var(--muted)', fontSize: 11 }}>{mapping.eenheid ? row[mapping.eenheid] : 'stuks'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {csvData.rows.length > 25 && (
                                <div style={{ textAlign: 'center', padding: 12, fontSize: 11, color: 'var(--muted)' }}>… en {csvData.rows.length - 25} andere regels</div>
                            )}
                        </div>
                        <div style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
                            <BtnGhost onClick={() => setStep(2)}>Terug naar mapping</BtnGhost>
                        </div>
                    </MetalCard>
                )}

                {step === 4 && (
                    <MetalCard>
                        <div style={{ padding: 40, textAlign: 'center' }}>
                            <div style={{ marginBottom: 32 }}>
                                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 48, fontWeight: 300, color: GOLD, marginBottom: 8, fontVariantNumeric: 'tabular-nums' }}>{importProgress}%</div>
                                <div style={{ background: 'rgba(255,255,255,.05)', height: 6, borderRadius: 3, overflow: 'hidden', maxWidth: 400, margin: '0 auto' }}>
                                    <div style={{ background: GOLD, height: '100%', width: importProgress + '%', transition: 'width .2s' }} />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 420, margin: '0 auto 32px' }}>
                                <div style={{ padding: 14, borderRadius: 10, border: '1px solid rgba(34,197,94,.3)', background: 'rgba(34,197,94,.06)' }}>
                                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 300, color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>{importResults.success}</div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700 }}>Succesvol</div>
                                </div>
                                <div style={{ padding: 14, borderRadius: 10, border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.06)' }}>
                                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 300, color: 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>{importResults.error}</div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700 }}>Overgeslagen</div>
                                </div>
                            </div>

                            {!importing && (
                                <BtnPrimary onClick={() => { resetImport(); onBack(); }}>Klaar &amp; terug naar overzicht</BtnPrimary>
                            )}
                        </div>
                    </MetalCard>
                )}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   FOOTER — zo werkt dit
   ═══════════════════════════════════════════════════════════════════ */
function ZoWerktDit() {
    return (
        <div style={{ padding: 16, borderRadius: 10, background: `${GOLD}0A`, border: `1px solid ${GOLD}26`, display: 'flex', gap: 12, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            <Info size={16} style={{ color: GOLD, flexShrink: 0, marginTop: 1 }} />
            <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: 4 }}>Zo werkt Price Intelligence</div>
                Importeer per leverancier een <strong style={{ color: 'var(--text)' }}>CSV-prijslijst</strong> (Sligro, Hanos, Bidfood of zelf toegevoegd).
                We tracken elke import en berekenen automatisch de <Hint tip="We vergelijken altijd de twee laatste imports per product per leverancier. Een trend >5% kleurt rood (stijging) of groen (daling).">trend</Hint>,
                de <Hint tip="Voor elk product tonen we welke leverancier nu het goedkoopst is. Het kleurt groen in de tabel en verschijnt als ✓ GOEDKOOPST in het detail-venster.">goedkoopste leverancier</Hint> en
                de <Hint tip="Som van alle prijsverschillen tussen duurste en goedkoopste leverancier per product. Dit is een theoretisch plafond — neem altijd lead-time en kwaliteit mee in de beslissing.">potentiële besparing</Hint>.
                Klik een product-rij voor historie, leveranciers-vergelijking en audit-log. Import maandelijks voor scherpe marges.
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   SHARED BUTTONS
   ═══════════════════════════════════════════════════════════════════ */
function BtnPrimary({ children, icon: I, right: R, onClick, style }: { children: React.ReactNode; icon?: any; right?: any; onClick?: () => void; style?: React.CSSProperties }) {
    return (
        <button onClick={onClick} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10,
            background: 'var(--brand)', color: '#000', fontWeight: 700, fontSize: 13,
            border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(255,191,0,.25), inset 0 1px 0 rgba(255,255,255,.2)',
            ...style,
        }}>
            {I && <I size={14} />}
            {children}
            {R && <R size={14} />}
        </button>
    );
}
function BtnGhost({ children, icon: I, right: R, onClick, style }: { children: React.ReactNode; icon?: any; right?: any; onClick?: () => void; style?: React.CSSProperties }) {
    return (
        <button onClick={onClick} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10,
            background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 13,
            border: '1px solid var(--border)', cursor: 'pointer',
            ...style,
        }}>
            {I && <I size={14} />}
            {children}
            {R && <R size={14} />}
        </button>
    );
}
