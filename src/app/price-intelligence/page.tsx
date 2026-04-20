/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { prepareDocument, type PreparedDocument } from '@/lib/documentToImage';
import Papa from 'papaparse';
import {
    FileScan, Receipt, PieChart, Sparkles, Upload, Camera, X, Check,
    AlertTriangle, Loader2, Edit3, Trash2, Package, ArrowUpRight, Clock,
    Info, HelpCircle, Plus, FileText, TrendingUp, TrendingDown,
    Store, Euro, CloudUpload, ArrowLeft, Save, FolderOpen, Zap, Lightbulb,
} from 'lucide-react';

const GOLD = '#c4a35a';
const FOLDER_KEY = 'pi_folder_v2';

type Folder = 'invoices' | 'receipts' | 'books';

/* ═══════════════════════════════════════════════════════════════════
   ATOMS
   ═══════════════════════════════════════════════════════════════════ */

function MetalCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{
            position: 'relative', background: 'var(--card)', backdropFilter: 'blur(18px)',
            border: '1px solid rgba(130,130,130,.12)', borderRadius: 14, overflow: 'hidden', ...style,
        }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${GOLD}80, transparent)`, pointerEvents: 'none' }} />
            {children}
        </div>
    );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
    return <div style={{ fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>{children}</div>;
}

function Hint({ tip, children }: { tip: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    return (
        <span
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 3, borderBottom: '1px dotted var(--muted-light)', cursor: 'help' }}
            onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
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

function BtnPrimary({ children, icon: I, right: R, onClick, style, disabled, type }: { children: React.ReactNode; icon?: any; right?: any; onClick?: () => void; style?: React.CSSProperties; disabled?: boolean; type?: 'button' | 'submit' }) {
    return (
        <button type={type || 'button'} onClick={onClick} disabled={disabled} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10,
            background: 'var(--brand)', color: '#000', fontWeight: 700, fontSize: 13,
            border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
            boxShadow: '0 4px 20px rgba(255,191,0,.25), inset 0 1px 0 rgba(255,255,255,.2)',
            ...style,
        }}>
            {I && <I size={14} />} {children} {R && <R size={14} />}
        </button>
    );
}

function BtnGhost({ children, icon: I, right: R, onClick, style }: { children: React.ReactNode; icon?: any; right?: any; onClick?: () => void; style?: React.CSSProperties }) {
    return (
        <button onClick={onClick} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10,
            background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 13,
            border: '1px solid var(--border)', cursor: 'pointer', ...style,
        }}>
            {I && <I size={14} />} {children} {R && <R size={14} />}
        </button>
    );
}

function Pill({ variant = 'draft', children, onClick }: { variant?: 'brand' | 'draft' | 'ok' | 'warn' | 'danger'; children: React.ReactNode; onClick?: () => void }) {
    const map: Record<string, React.CSSProperties> = {
        brand: { background: 'rgba(255,191,0,.12)', color: 'var(--brand)', borderColor: 'rgba(255,191,0,.3)' },
        draft: { background: 'rgba(130,130,130,.14)', color: 'var(--muted)', borderColor: 'var(--border)' },
        ok: { background: 'rgba(34,197,94,.12)', color: 'var(--green)', borderColor: 'rgba(34,197,94,.25)' },
        warn: { background: 'rgba(245,158,11,.12)', color: 'var(--amber)', borderColor: 'rgba(245,158,11,.3)' },
        danger: { background: 'rgba(239,68,68,.12)', color: 'var(--red)', borderColor: 'rgba(239,68,68,.25)' },
    };
    return (
        <span onClick={onClick} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999,
            fontSize: 11, fontWeight: 600, border: '1px solid transparent', cursor: onClick ? 'pointer' : 'default',
            ...map[variant],
        }}>{children}</span>
    );
}

function SectionExplain({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-start',
            padding: '10px 14px', marginBottom: 14,
            background: 'rgba(59,130,246,.06)', border: '1px solid rgba(59,130,246,.15)',
            borderLeft: '2px solid rgba(59,130,246,.5)', borderRadius: 10,
            fontSize: 12, color: 'var(--muted)', lineHeight: 1.5,
        }}>
            <Info size={14} style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 1 }} />
            <div>{children}</div>
        </div>
    );
}

function fmt2(n: number | string | null | undefined) {
    if (n === null || n === undefined || n === '') return '€\u00a00,00';
    const v = parseFloat(String(n));
    return isNaN(v) ? '€\u00a00,00' : '€\u00a0' + v.toFixed(2).replace('.', ',');
}

/* ═══════════════════════════════════════════════════════════════════
   DUPLICATE DETECTION — fuzzy matching met name normalization
   ═══════════════════════════════════════════════════════════════════ */

function normalizeLeverancier(s?: string | null): string {
    if (!s) return '';
    let n = String(s).toLowerCase().trim();
    // Verwijder dingen tussen haakjes: "Makro (Metro Cash & Carry)" → "makro"
    n = n.replace(/\s*\([^)]*\)\s*/g, '').trim();
    // Verwijder bedrijfs-suffixes
    n = n.replace(/\s+(b\.?\s*v\.?|n\.?\s*v\.?|vof|v\.?o\.?f\.?|holding|groep|group)\.?$/i, '').trim();
    // Collapse meerdere spaties
    n = n.replace(/\s+/g, ' ');
    return n;
}

function normalizeFactuurnummer(s?: string | null): string {
    if (!s) return '';
    return String(s).toLowerCase().replace(/[\s\-_/\\.]/g, '').trim();
}

type DupeMatch = {
    type: 'exact' | 'likely' | 'possible';
    existing: any;
    reasons: string[];
};

function detectDuplicates(candidate: { leverancier?: string | null; factuurnummer?: string | null; datum?: string | null; totaal_incl?: number | string | null }, existing: any[] = [], excludeId?: number): DupeMatch[] {
    const matches: DupeMatch[] = [];
    const candLev = normalizeLeverancier(candidate.leverancier);
    const candNum = normalizeFactuurnummer(candidate.factuurnummer);
    const candIncl = parseFloat(String(candidate.totaal_incl ?? 0));
    const candDatum = candidate.datum;

    for (const ex of existing) {
        if (excludeId && ex.id === excludeId) continue;
        const exLev = normalizeLeverancier(ex.leverancier);
        const exNum = normalizeFactuurnummer(ex.factuurnummer);
        const exIncl = parseFloat(String(ex.totaal_incl ?? 0));
        const exDatum = ex.datum;

        const reasons: string[] = [];
        let score = 0;
        let sameFactNr = false;
        let sameLev = false;

        if (candNum && exNum && candNum === exNum) { reasons.push('Zelfde factuurnummer'); score += 3; sameFactNr = true; }
        if (candLev && exLev && candLev === exLev) { reasons.push('Zelfde leverancier'); score += 1; sameLev = true; }
        if (candIncl > 0 && exIncl > 0 && Math.abs(candIncl - exIncl) < 0.02) { reasons.push('Zelfde bedrag'); score += 2; }
        if (candDatum && exDatum && candDatum === exDatum) { reasons.push('Zelfde datum'); score += 1; }

        // Classificatie:
        // EXACT: factuurnr + leverancier matchen → 100% dubbel
        // LIKELY: alles behalve factuurnr (bedrag + datum + leverancier) → zeer waarschijnlijk
        // POSSIBLE: bedrag + datum zonder leverancier match → check handmatig
        if (sameFactNr && sameLev) {
            matches.push({ type: 'exact', existing: ex, reasons });
        } else if (score >= 4) {
            matches.push({ type: 'likely', existing: ex, reasons });
        } else if (score >= 3 && reasons.includes('Zelfde bedrag') && reasons.includes('Zelfde datum')) {
            matches.push({ type: 'possible', existing: ex, reasons });
        }
    }

    // Sorteer: exact > likely > possible
    const prio: Record<string, number> = { exact: 3, likely: 2, possible: 1 };
    matches.sort((a, b) => prio[b.type] - prio[a.type]);
    return matches;
}

/* ═══════════════════════════════════════════════════════════════════
   SMART MATCHING — voorraad-link + prijshistorie per product
   ═══════════════════════════════════════════════════════════════════ */

/** Simpele fuzzy match score tussen 0 en 1 */
function fuzzyScore(a: string, b: string): number {
    const na = a.toLowerCase().trim();
    const nb = b.toLowerCase().trim();
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.85;
    // Word-overlap
    const wordsA = na.split(/\s+/).filter(w => w.length > 2);
    const wordsB = nb.split(/\s+/).filter(w => w.length > 2);
    if (wordsA.length === 0 || wordsB.length === 0) return 0;
    const common = wordsA.filter(w => wordsB.some(x => x.includes(w) || w.includes(x)));
    return common.length / Math.max(wordsA.length, wordsB.length);
}

type InventoryMatch = { item: any; confidence: number };

/** Match een factuur-regel tegen bestaande voorraad */
function matchInventoryItem(productNaam: string, inventory: any[]): InventoryMatch | null {
    if (!productNaam || !inventory || inventory.length === 0) return null;
    let best: InventoryMatch | null = null;
    for (const item of inventory) {
        if (!item.naam) continue;
        const score = fuzzyScore(productNaam, item.naam);
        if (score > 0.5 && (!best || score > best.confidence)) {
            best = { item, confidence: score };
        }
    }
    return best;
}

/** Haal prijshistorie op voor een product uit supplier_prices + eerdere factuurregels */
function getProductPriceHistory(productNaam: string, supplierPrices: any[], invoices: any[]): { prijs: number; datum?: string; bron: 'csv' | 'factuur' }[] {
    const history: { prijs: number; datum?: string; bron: 'csv' | 'factuur' }[] = [];
    const low = (productNaam || '').toLowerCase().trim();
    if (!low) return [];

    // Uit supplier_prices tabel
    for (const sp of supplierPrices || []) {
        if (!sp.product_naam) continue;
        if (fuzzyScore(low, sp.product_naam) > 0.5) {
            history.push({ prijs: parseFloat(sp.prijs) || 0, datum: sp.datum, bron: 'csv' });
        }
    }
    // Uit eerder gescande factuur-regels (via raw_ai_response)
    for (const inv of invoices || []) {
        const regels = inv.raw_ai_response?.regels || [];
        for (const r of regels) {
            if (!r.product_naam) continue;
            if (fuzzyScore(low, r.product_naam) > 0.6) {
                history.push({ prijs: parseFloat(r.prijs_per_eenheid) || 0, datum: inv.datum, bron: 'factuur' });
            }
        }
    }
    // Sort nieuwste eerst
    history.sort((a, b) => {
        if (!a.datum) return 1;
        if (!b.datum) return -1;
        return b.datum.localeCompare(a.datum);
    });
    return history.slice(0, 8);
}

/** Vind paren van duplicates in een bestaande lijst (voor opruim-functie) */
function findDuplicateGroups(list: any[]): any[][] {
    const groups: any[][] = [];
    const seen = new Set<number>();
    for (let i = 0; i < list.length; i++) {
        if (seen.has(list[i].id)) continue;
        const dupes = detectDuplicates(list[i], list, list[i].id)
            .filter(m => m.type === 'exact' || m.type === 'likely')
            .map(m => m.existing);
        if (dupes.length > 0) {
            const group = [list[i], ...dupes];
            group.forEach(x => seen.add(x.id));
            groups.push(group);
        }
    }
    return groups;
}

function ScanProgress({ step, onCancel }: { step: 'prep' | 'upload' | 'ai' | 'done' | 'error'; onCancel?: () => void }) {
    const steps: { id: 'prep' | 'upload' | 'ai' | 'done'; label: string }[] = [
        { id: 'prep', label: 'Bestand voorbereiden' },
        { id: 'upload', label: 'Naar AI sturen' },
        { id: 'ai', label: 'AI analyseert' },
        { id: 'done', label: 'Klaar' },
    ];
    const stepIdx = steps.findIndex(s => s.id === step);
    return (
        <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                <Loader2 size={28} style={{ color: GOLD, animation: 'spin 1s linear infinite' }} />
            </div>
            <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: GOLD, marginBottom: 18 }}>
                {step === 'ai' ? 'AI leest je document…' : 'Bezig met verwerken…'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 400, margin: '0 auto 20px' }}>
                {steps.map((s, i) => {
                    const done = stepIdx > i;
                    const active = stepIdx === i;
                    return (
                        <div key={s.id} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 12px', borderRadius: 8,
                            background: active ? `${GOLD}10` : done ? 'rgba(34,197,94,.06)' : 'transparent',
                            border: `1px solid ${active ? `${GOLD}40` : done ? 'rgba(34,197,94,.2)' : 'var(--border)'}`,
                            transition: 'all .2s',
                        }}>
                            <div style={{
                                width: 22, height: 22, borderRadius: 11,
                                background: done ? 'var(--green)' : active ? GOLD : 'var(--color-bg-deep)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: done || active ? '#000' : 'var(--muted)', fontSize: 11, fontWeight: 700,
                            }}>
                                {done ? <Check size={12} /> : active ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : i + 1}
                            </div>
                            <span style={{ fontSize: 13, color: done || active ? 'var(--text)' : 'var(--muted)', fontWeight: active ? 600 : 500 }}>
                                {s.label}
                            </span>
                        </div>
                    );
                })}
            </div>
            {onCancel && (
                <div style={{ textAlign: 'center' }}>
                    <button onClick={onCancel} style={{
                        padding: '8px 14px', borderRadius: 8, background: 'transparent',
                        border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', fontSize: 12,
                    }}>
                        Annuleren
                    </button>
                </div>
            )}
        </div>
    );
}

function ErrorBanner({ error, onRetry, onDismiss }: { error: string; onRetry?: () => void; onDismiss?: () => void }) {
    return (
        <div style={{
            padding: 14, borderRadius: 10, background: 'rgba(239,68,68,.08)',
            border: '1px solid rgba(239,68,68,.3)',
            display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
            <AlertTriangle size={16} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, fontSize: 12, color: 'var(--text)' }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>AI kon het document niet lezen</div>
                <div style={{ color: 'var(--muted)', lineHeight: 1.5 }}>{error}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    {onRetry && <button onClick={onRetry} style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(255,191,0,.15)', border: '1px solid rgba(255,191,0,.4)', color: 'var(--brand)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Opnieuw proberen</button>}
                    {onDismiss && <button onClick={onDismiss} style={{ padding: '6px 12px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', fontSize: 11 }}>Sluiten</button>}
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   FOLDER TABS
   ═══════════════════════════════════════════════════════════════════ */

const TABS: { id: Folder; label: string; hint: string; Icon: any }[] = [
    { id: 'invoices', label: 'AI Factuur Lezen', hint: 'Scan & extract', Icon: FileScan },
    { id: 'receipts', label: 'Bonnen', hint: 'Kassabonnen · foto', Icon: Receipt },
    { id: 'books', label: 'Boekhouding', hint: 'Inzichten & AI', Icon: PieChart },
];

function FolderTabs({ active, onChange }: { active: Folder; onChange: (f: Folder) => void }) {
    return (
        <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0,
            background: 'var(--color-bg-deep)', border: '1px solid var(--border)',
            borderRadius: '14px 14px 0 0', padding: 4, position: 'relative',
        }}>
            {TABS.map(t => {
                const isActive = active === t.id;
                return (
                    <button key={t.id} onClick={() => onChange(t.id)} style={{
                        position: 'relative', display: 'flex', alignItems: 'center', gap: 12,
                        padding: '14px 16px', background: isActive ? 'linear-gradient(180deg, rgba(255,191,0,.08), rgba(196,163,90,.03))' : 'transparent',
                        border: 'none', color: isActive ? 'var(--text)' : 'var(--muted)',
                        cursor: 'pointer', borderRadius: 10, transition: 'all .18s ease', textAlign: 'left',
                        boxShadow: isActive ? `inset 0 0 0 1px ${GOLD}40` : 'none',
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: isActive ? `${GOLD}26` : 'rgba(130,130,130,.08)',
                            border: `1px solid ${isActive ? `${GOLD}66` : 'var(--border)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: isActive ? GOLD : 'var(--muted)',
                            flexShrink: 0, transition: 'all .18s',
                        }}>
                            <t.Icon size={18} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.1 }}>{t.label}</div>
                            <div style={{ fontSize: 9, color: 'var(--muted-light)', letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 3, fontWeight: 600 }}>{t.hint}</div>
                        </div>
                        {isActive && <div style={{ position: 'absolute', left: '10%', right: '10%', bottom: -5, height: 2, background: `linear-gradient(90deg, transparent, var(--brand), transparent)` }} />}
                    </button>
                );
            })}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE SHELL
   ═══════════════════════════════════════════════════════════════════ */

export default function PriceIntelligence() {
    const [folder, setFolder] = useState<Folder>(() => {
        if (typeof window === 'undefined') return 'books';
        const stored = localStorage.getItem(FOLDER_KEY);
        return stored === 'invoices' || stored === 'receipts' || stored === 'books' ? stored : 'books';
    });

    function changeFolder(f: Folder) {
        setFolder(f);
        if (typeof window !== 'undefined') localStorage.setItem(FOLDER_KEY, f);
    }

    return (
        <div style={{ padding: '24px 32px 100px', maxWidth: 1440, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <h1 style={{ fontFamily: 'Outfit, DM Sans, sans-serif', fontWeight: 200, fontSize: 34, letterSpacing: '-.015em', margin: 0 }}>Price Intelligence</h1>
                        <span style={{ padding: '2px 8px', borderRadius: 6, background: `${GOLD}20`, border: `1px solid ${GOLD}4D`, fontSize: 10, letterSpacing: '.2em', color: GOLD, fontWeight: 700 }}>AI POWERED</span>
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                        Facturen, bonnen en boekhouding — één systeem, AI leest mee.
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <a href="/voorraad" style={{ textDecoration: 'none' }}>
                        <BtnGhost icon={Package} right={ArrowUpRight}>Voorraad</BtnGhost>
                    </a>
                </div>
            </div>

            <FolderTabs active={folder} onChange={changeFolder} />

            <div key={folder} style={{
                background: 'var(--bg)', border: '1px solid var(--border)', borderTop: 'none',
                borderRadius: '0 0 14px 14px', padding: 22, animation: 'fadeInUp .3s ease both',
            }}>
                {folder === 'invoices' && <FolderInvoices />}
                {folder === 'receipts' && <FolderReceipts />}
                {folder === 'books' && <FolderBooks />}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   FOLDER 1 — AI FACTUUR LEZEN
   ═══════════════════════════════════════════════════════════════════ */

type ParsedInvoice = {
    leverancier: string;
    factuurnummer?: string | null;
    datum?: string | null;
    totaal_excl?: number;
    totaal_btw?: number;
    totaal_incl?: number;
    valuta?: string;
    regels?: ParsedInvoiceLine[];
};

type ParsedInvoiceLine = {
    product_naam: string;
    hoeveelheid: number;
    eenheid: string;
    prijs_per_eenheid: number;
    btw_pct: number;
    subtotaal: number;
    categorie?: string;
};

function FolderInvoices() {
    const { data: invoices, insert, update, remove, refetch } = useSupabase<any>('supplier_invoices', []);
    const { data: inventoryData } = useSupabase<any>('inventory', []);
    const { data: supplierPricesData } = useSupabase<any>('supplier_prices', []);
    const showToast = useToast();
    const showConfirm = useConfirm();
    const [scanStep, setScanStep] = useState<'idle' | 'prep' | 'upload' | 'ai' | 'done' | 'error'>('idle');
    const [parsedInvoice, setParsedInvoice] = useState<ParsedInvoice | null>(null);
    const [scanPreview, setScanPreview] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [lastFile, setLastFile] = useState<File | null>(null);
    const [uploadQueue, setUploadQueue] = useState<File[]>([]);
    const [queueTotal, setQueueTotal] = useState(0);
    const abortRef = useRef<AbortController | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const scanning = scanStep !== 'idle' && scanStep !== 'done' && scanStep !== 'error';

    async function handleFile(file: File) {
        if (!file) return;
        setError(null);
        setLastFile(file);
        setScanStep('prep');
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const doc: PreparedDocument = await prepareDocument(file);
            if (controller.signal.aborted) return;
            setScanPreview(doc.base64);
            setScanStep('upload');
            const payload: any = { type: 'invoice' };
            if (doc.kind === 'pdf') payload.pdfBase64 = doc.base64;
            else payload.imageBase64 = doc.base64;
            const res = await fetch('/api/parse-document', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            setScanStep('ai');
            const body = await res.json();
            if (controller.signal.aborted) return;
            if (!res.ok) {
                setError(body.detail || body.error || 'Scan mislukt — probeer een duidelijkere foto of PDF');
                setScanStep('error');
                return;
            }
            setParsedInvoice(body.data as ParsedInvoice);
            setScanStep('done');
            showToast('Factuur gelezen — controleer en boek in', 'success');
        } catch (e: any) {
            if (e?.name === 'AbortError') { setScanStep('idle'); return; }
            setError(e.message || 'Scan mislukt');
            setScanStep('error');
        }
    }

    function cancelScan() {
        abortRef.current?.abort();
        setScanStep('idle');
        setScanPreview(null);
        setError(null);
        setParsedInvoice(null);
        // Als er nog in queue staat: start volgende
        if (uploadQueue.length > 0) {
            const [next, ...rest] = uploadQueue;
            setUploadQueue(rest);
            setTimeout(() => handleFile(next), 300);
        } else {
            setQueueTotal(0);
        }
    }

    function retryScan() {
        if (lastFile) handleFile(lastFile);
    }

    function handleFiles(files: FileList | File[]) {
        const arr = Array.from(files);
        if (arr.length === 0) return;
        if (arr.length === 1) {
            setQueueTotal(1);
            handleFile(arr[0]);
            return;
        }
        setQueueTotal(arr.length);
        setUploadQueue(arr.slice(1));
        handleFile(arr[0]);
        showToast(`${arr.length} facturen in queue — wordt sequentieel verwerkt`, 'info');
    }

    async function saveInvoice() {
        if (!parsedInvoice) return;

        // Pre-save dupe check met echte, up-to-date lijst
        const dupes = detectDuplicates(parsedInvoice, invoices || []);
        const exactDupe = dupes.find(d => d.type === 'exact');
        if (exactDupe) {
            showToast('Factuur niet opgeslagen: exact dezelfde staat al in je systeem', 'error');
            return;
        }
        const likelyDupe = dupes.find(d => d.type === 'likely');
        if (likelyDupe) {
            const reasonsText = likelyDupe.reasons.join(', ');
            const existingLabel = `${likelyDupe.existing.leverancier || 'Onbekend'} · ${likelyDupe.existing.factuurnummer || 'geen nr'} · ${likelyDupe.existing.datum || ''} · ${fmt2(likelyDupe.existing.totaal_incl)}`;
            const confirmed = await new Promise<boolean>((resolve) => {
                showConfirm(
                    `Mogelijk dubbele factuur!\n\nBestaande: ${existingLabel}\nOvereenkomst: ${reasonsText}\n\nToch opslaan?`,
                    () => resolve(true),
                );
                // Als showConfirm annuleren niet ondersteunt, resolve false na kort delay
                setTimeout(() => resolve(false), 60000);
            });
            if (!confirmed) return;
        }

        const { regels = [], ...header } = parsedInvoice;
        try {
            await insert({
                leverancier: header.leverancier || 'Onbekend',
                factuurnummer: header.factuurnummer || null,
                datum: header.datum || null,
                totaal_excl: header.totaal_excl || 0,
                totaal_btw: header.totaal_btw || 0,
                totaal_incl: header.totaal_incl || 0,
                valuta: header.valuta || 'EUR',
                status: 'review',
                raw_ai_response: parsedInvoice,
            } as any);
            showToast(`Factuur opgeslagen · ${regels.length} regels`, 'success');
            setParsedInvoice(null);
            setScanPreview(null);
            refetch();
            // Volgende in queue automatisch starten
            if (uploadQueue.length > 0) {
                const [next, ...rest] = uploadQueue;
                setUploadQueue(rest);
                setTimeout(() => handleFile(next), 400);
            } else {
                setQueueTotal(0);
            }
        } catch (e: any) {
            showToast('Opslaan mislukt: ' + (e?.message || 'onbekend'), 'error');
        }
    }

    function deleteInvoice(id: number) {
        showConfirm('Deze factuur verwijderen?', () => {
            remove(id).then(() => showToast('Factuur verwijderd', 'success'));
        });
    }

    const stats = useMemo(() => {
        const total = (invoices || []).reduce((s: number, i: any) => s + (parseFloat(i.totaal_incl) || 0), 0);
        const byStatus = (invoices || []).reduce((m: Record<string, number>, i: any) => {
            m[i.status || 'review'] = (m[i.status || 'review'] || 0) + 1;
            return m;
        }, {});
        return { count: invoices.length, total, review: byStatus.review || 0, booked: byStatus.booked || 0 };
    }, [invoices]);

    if (parsedInvoice) {
        return <InvoiceReview
            invoice={parsedInvoice}
            setInvoice={setParsedInvoice}
            preview={scanPreview}
            existingInvoices={invoices}
            inventory={inventoryData}
            supplierPrices={supplierPricesData}
            onSave={saveInvoice}
            onCancel={cancelScan}
        />;
    }

    if (editingId) {
        const existing = invoices.find((i: any) => i.id === editingId);
        if (existing) {
            const asInvoice: ParsedInvoice = existing.raw_ai_response || {
                leverancier: existing.leverancier,
                factuurnummer: existing.factuurnummer,
                datum: existing.datum,
                totaal_excl: existing.totaal_excl,
                totaal_btw: existing.totaal_btw,
                totaal_incl: existing.totaal_incl,
                regels: [],
            };
            return <InvoiceReview
                invoice={asInvoice}
                setInvoice={(inv) => { /* edit mode — direct update on save */ void inv; }}
                preview={null}
                onSave={async () => {
                    await update(editingId, { status: 'booked' } as any);
                    showToast('Status bijgewerkt', 'success');
                    setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
            />;
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <SectionExplain>
                <strong style={{ color: 'var(--text)' }}>Zo werkt AI factuur lezen:</strong> upload een PDF of foto van een leverancier-factuur → Claude/Groq AI leest alle regels, totalen en BTW → je controleert → je boekt in. Werkt met Sligro, Hanos, Bidfood, of welke leverancier dan ook.
            </SectionExplain>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <MiniStat label="Facturen totaal" value={stats.count} icon={FileText} />
                <MiniStat label="Te reviewen" value={stats.review} tone={stats.review > 0 ? 'warn' : undefined} icon={Edit3} />
                <MiniStat label="Geboekt" value={stats.booked} tone="ok" icon={Check} />
                <MiniStat label="Totaal incl. BTW" value={fmt2(stats.total)} icon={Euro} />
            </div>

            {/* Upload zone */}
            <MetalCard>
                {scanning ? (
                    <div>
                        {queueTotal > 1 && (
                            <div style={{ padding: '10px 16px', background: `${GOLD}10`, borderBottom: `1px solid ${GOLD}30`, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 3, background: `${GOLD}26`, color: GOLD, border: `1px solid ${GOLD}4D` }}>QUEUE</span>
                                <span>Factuur {queueTotal - uploadQueue.length} van {queueTotal}</span>
                                <span style={{ flex: 1, height: 4, background: 'rgba(130,130,130,.1)', borderRadius: 2, overflow: 'hidden' }}>
                                    <span style={{ display: 'block', height: '100%', width: `${((queueTotal - uploadQueue.length - 1) / queueTotal) * 100}%`, background: GOLD, transition: 'width .3s' }} />
                                </span>
                                {uploadQueue.length > 0 && <span style={{ color: 'var(--muted)', fontSize: 11 }}>· nog {uploadQueue.length} in wachtrij</span>}
                            </div>
                        )}
                        <ScanProgress step={scanStep as any} onCancel={cancelScan} />
                    </div>
                ) : (
                    <div
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files); }}
                        style={{
                            padding: '40px 30px', textAlign: 'center',
                            border: `2px dashed var(--border-strong)`,
                            margin: 14, borderRadius: 12,
                        }}>
                        <div style={{ width: 64, height: 64, margin: '0 auto 16px', borderRadius: 16, background: `${GOLD}18`, border: `1px solid ${GOLD}4D`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CloudUpload size={28} style={{ color: GOLD }} />
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300, marginBottom: 8 }}>Upload één of meerdere facturen</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
                            Sleep meerdere tegelijk erin — worden sequentieel verwerkt.<br />
                            PDF, JPG of PNG · AI leest binnen 15 seconden per factuur.
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <BtnPrimary icon={FolderOpen} onClick={() => fileRef.current?.click()}>Kies bestand(en)</BtnPrimary>
                            <BtnGhost icon={Camera} onClick={() => { fileRef.current?.setAttribute('capture', 'environment'); fileRef.current?.click(); setTimeout(() => fileRef.current?.removeAttribute('capture'), 500); }}>Foto maken</BtnGhost>
                        </div>
                        <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple style={{ display: 'none' }}
                            onChange={e => e.target.files && e.target.files.length > 0 && handleFiles(e.target.files)} />
                    </div>
                )}

                {error && scanStep === 'error' && (
                    <div style={{ margin: '0 14px 14px' }}>
                        <ErrorBanner error={error} onRetry={lastFile ? retryScan : undefined} onDismiss={() => { setError(null); setScanStep('idle'); }} />
                    </div>
                )}
            </MetalCard>

            {/* Duplicate cleanup section (alleen tonen als er dubbelen zijn) */}
            <DuplicateCleanup invoices={invoices} onRemove={async (id) => { await remove(id); refetch(); }} />

            {/* Invoice list */}
            <MetalCard>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FileText size={14} style={{ color: GOLD }} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>Gescande facturen</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {invoices.length}</span>
                    </div>
                </div>
                {invoices.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                        Nog geen gescande facturen. Upload je eerste factuur hierboven.
                    </div>
                ) : (
                    <InvoiceListTable
                        invoices={invoices}
                        onDelete={(id) => showConfirm('Deze factuur verwijderen? Dit kan niet ongedaan gemaakt worden.', () => remove(id).then(() => { showToast('Factuur verwijderd', 'success'); refetch(); }))}
                    />
                )}
            </MetalCard>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   DUPLICATE CLEANUP — waarschuwing + 1-klik opruimen
   ═══════════════════════════════════════════════════════════════════ */

function DuplicateCleanup({ invoices, onRemove }: { invoices: any[]; onRemove: (id: number) => Promise<void> }) {
    const showConfirm = useConfirm();
    const showToast = useToast();
    const groups = useMemo(() => findDuplicateGroups(invoices || []), [invoices]);
    const [working, setWorking] = useState(false);

    if (groups.length === 0) return null;

    const totalDupes = groups.reduce((s, g) => s + (g.length - 1), 0);

    async function removeAllDupes() {
        setWorking(true);
        try {
            for (const group of groups) {
                // Behoud de oudste (eerste aangemaakt), verwijder de rest
                const sorted = [...group].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                const keep = sorted[0];
                const toDelete = sorted.slice(1);
                for (const dupe of toDelete) {
                    if (dupe.id !== keep.id) await onRemove(dupe.id);
                }
            }
            showToast(`${totalDupes} dubbele factuur${totalDupes === 1 ? '' : 'en'} opgeruimd`, 'success');
        } catch (e: any) {
            showToast('Opruimen mislukt: ' + (e?.message || 'onbekend'), 'error');
        }
        setWorking(false);
    }

    return (
        <MetalCard style={{ borderColor: 'rgba(239,68,68,.4)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(239,68,68,.05)' }}>
                <AlertTriangle size={16} style={{ color: 'var(--red)' }} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)' }}>
                        {groups.length} groep{groups.length === 1 ? '' : 'en'} dubbele facturen gevonden · {totalDupes} extra exemplaren
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        Ruim op om één schone kopie per factuur te behouden (de oudst aangemaakte blijft staan)
                    </div>
                </div>
                <button
                    onClick={() => showConfirm(`${totalDupes} dubbele factuur${totalDupes === 1 ? '' : 'en'} verwijderen?\n\nPer groep wordt de oudste behouden.`, removeAllDupes)}
                    disabled={working}
                    style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--red)', color: '#fff', fontWeight: 700, fontSize: 12, border: 'none', cursor: working ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                    <Trash2 size={13} /> {working ? 'Bezig…' : 'Ruim op'}
                </button>
            </div>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {groups.map((group, i) => (
                    <div key={i} style={{ padding: 10, borderRadius: 8, background: 'rgba(239,68,68,.04)', border: '1px solid rgba(239,68,68,.15)' }}>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
                            Groep {i + 1} · {group.length} exemplaren van dezelfde factuur
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {group.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map((inv, idx) => (
                                <div key={inv.id} style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto auto auto', gap: 10, alignItems: 'center', fontSize: 12, padding: '4px 6px' }}>
                                    <span style={{ fontSize: 10, color: idx === 0 ? 'var(--green)' : 'var(--muted-light)', fontWeight: 700 }}>
                                        {idx === 0 ? 'KEEP' : 'DUP'}
                                    </span>
                                    <span>{inv.leverancier || 'Onbekend'} · {inv.factuurnummer || 'geen nr'}</span>
                                    <span style={{ color: 'var(--muted)', fontSize: 11 }}>{inv.datum || '—'}</span>
                                    <span style={{ color: GOLD, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt2(inv.totaal_incl)}</span>
                                    {idx > 0 && (
                                        <button onClick={() => showConfirm('Deze kopie verwijderen?', () => onRemove(inv.id))} style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 2 }}>
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </MetalCard>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   INVOICE LIST TABLE — met dupe-badges per rij
   ═══════════════════════════════════════════════════════════════════ */

function InvoiceListTable({ invoices, onDelete }: { invoices: any[]; onDelete: (id: number) => void }) {
    // Vind welke invoices een dupe-partner hebben
    const dupeMap = useMemo(() => {
        const map: Record<number, 'exact' | 'likely' | 'possible'> = {};
        for (const inv of invoices) {
            const matches = detectDuplicates(inv, invoices, inv.id);
            if (matches.length > 0) map[inv.id] = matches[0].type;
        }
        return map;
    }, [invoices]);

    const sorted = invoices.slice().sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
                <tr style={{ background: 'rgba(130,130,130,.04)', borderBottom: '1px solid var(--border)' }}>
                    {['Leverancier', 'Factuurnr.', 'Datum', 'Excl. BTW', 'BTW', 'Totaal', 'Status', ''].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: ['Excl. BTW', 'BTW', 'Totaal'].includes(h) ? 'right' : 'left', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>{h}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {sorted.map((inv: any) => {
                    const dupe = dupeMap[inv.id];
                    const bgColor = dupe === 'exact' ? 'rgba(239,68,68,.04)' : dupe === 'likely' ? 'rgba(245,158,11,.04)' : 'transparent';
                    return (
                        <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)', background: bgColor }}>
                            <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {inv.leverancier || 'Onbekend'}
                                    {dupe === 'exact' && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,.15)', color: 'var(--red)', border: '1px solid rgba(239,68,68,.3)' }}>DUBBEL</span>}
                                    {dupe === 'likely' && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,.15)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,.3)' }}>MOGELIJK DUBBEL</span>}
                                </div>
                            </td>
                            <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{inv.factuurnummer || '—'}</td>
                            <td style={{ padding: '10px 12px', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{inv.datum || '—'}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt2(inv.totaal_excl)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt2(inv.totaal_btw)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt2(inv.totaal_incl)}</td>
                            <td style={{ padding: '10px 12px' }}>
                                <Pill variant={inv.status === 'booked' ? 'ok' : inv.status === 'archived' ? 'draft' : 'warn'}>
                                    {inv.status === 'booked' ? 'Geboekt' : inv.status === 'archived' ? 'Archief' : 'Review'}
                                </Pill>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                <button onClick={() => onDelete(inv.id)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }} title="Verwijderen">
                                    <Trash2 size={14} />
                                </button>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

function InvoiceReview({ invoice, setInvoice, preview, existingInvoices, inventory, supplierPrices, onSave, onCancel }: {
    invoice: ParsedInvoice; setInvoice: (i: ParsedInvoice) => void; preview: string | null;
    existingInvoices?: any[];
    inventory?: any[];
    supplierPrices?: any[];
    onSave: () => void | Promise<void>; onCancel: () => void;
}) {
    const [saving, setSaving] = useState(false);

    // Keyboard shortcuts: Cmd+S = save, Esc = annuleer, Cmd+D = duplicate regel
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const meta = e.metaKey || e.ctrlKey;
            if (meta && e.key === 's') {
                e.preventDefault();
                if (!saving) void doSave();
            } else if (e.key === 'Escape') {
                onCancel();
            } else if (meta && e.key === 'd') {
                e.preventDefault();
                const lines = [...(invoice.regels || [])];
                if (lines.length > 0) {
                    const last = lines[lines.length - 1];
                    lines.push({ ...last });
                    setInvoice({ ...invoice, regels: lines });
                }
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [invoice, saving]);

    // Validatie: bereken live welke checks wel/niet kloppen
    const validation = useMemo(() => {
        const checks: { id: string; status: 'ok' | 'warn' | 'error'; label: string; detail?: string }[] = [];

        const excl = parseFloat(String(invoice.totaal_excl ?? 0));
        const btw = parseFloat(String(invoice.totaal_btw ?? 0));
        const incl = parseFloat(String(invoice.totaal_incl ?? 0));

        // Check 1: totaal excl + BTW = incl (binnen 2 cent marge)
        const berekend = excl + btw;
        const diff = Math.abs(berekend - incl);
        if (incl === 0 && excl === 0) {
            checks.push({ id: 'totals', status: 'warn', label: 'Totalen ontbreken', detail: 'Geen bedragen gevonden' });
        } else if (diff < 0.02) {
            checks.push({ id: 'totals', status: 'ok', label: 'Totalen kloppen', detail: `€${excl.toFixed(2)} + €${btw.toFixed(2)} = €${incl.toFixed(2)}` });
        } else {
            checks.push({ id: 'totals', status: 'error', label: 'Totalen kloppen niet', detail: `€${excl.toFixed(2)} + €${btw.toFixed(2)} = €${berekend.toFixed(2)}, maar totaal incl zegt €${incl.toFixed(2)} (verschil €${diff.toFixed(2)})` });
        }

        // Check 2: som van subtotalen = totaal excl
        const regels = invoice.regels || [];
        if (regels.length > 0) {
            const sumSubs = regels.reduce((s, r) => s + (parseFloat(String(r.subtotaal ?? 0)) || 0), 0);
            const subsDiff = Math.abs(sumSubs - excl);
            if (excl === 0) {
                checks.push({ id: 'lines', status: 'warn', label: 'Regels niet gekoppeld aan totaal', detail: `Som subtotalen: €${sumSubs.toFixed(2)}` });
            } else if (subsDiff < 0.10) {
                checks.push({ id: 'lines', status: 'ok', label: 'Regels matchen totaal excl.', detail: `${regels.length} regel${regels.length === 1 ? '' : 's'} = €${sumSubs.toFixed(2)}` });
            } else {
                checks.push({ id: 'lines', status: 'warn', label: 'Regels wijken af van totaal', detail: `Som: €${sumSubs.toFixed(2)} · totaal excl: €${excl.toFixed(2)} (verschil €${subsDiff.toFixed(2)})` });
            }
        }

        // Check 3: BTW percentage realistisch (9 of 21 in NL)
        if (excl > 0 && btw > 0) {
            const pct = (btw / excl) * 100;
            if (pct > 8 && pct < 10) {
                checks.push({ id: 'btw', status: 'ok', label: 'BTW ≈ 9% (laag tarief)', detail: 'Voedsel, groente, fruit' });
            } else if (pct > 20 && pct < 22) {
                checks.push({ id: 'btw', status: 'ok', label: 'BTW ≈ 21% (standaard)', detail: 'Niet-food / dranken / verpakking' });
            } else {
                checks.push({ id: 'btw', status: 'warn', label: `BTW ${pct.toFixed(1)}% is ongebruikelijk`, detail: 'NL kent alleen 9% en 21% normaal' });
            }
        }

        // Check 4: dubbele factuur (fuzzy matching)
        if (existingInvoices && existingInvoices.length > 0) {
            const dupes = detectDuplicates(invoice, existingInvoices);
            const exact = dupes.find(d => d.type === 'exact');
            const likely = dupes.find(d => d.type === 'likely');
            const possible = dupes.find(d => d.type === 'possible');
            if (exact) {
                checks.push({ id: 'dupe', status: 'error', label: 'Dubbele factuur!', detail: `${exact.reasons.join(' + ')} als ${exact.existing.leverancier}` });
            } else if (likely) {
                checks.push({ id: 'dupe', status: 'warn', label: 'Mogelijk dubbel', detail: `${likely.reasons.join(' + ')} · Check voor opslaan` });
            } else if (possible) {
                checks.push({ id: 'dupe', status: 'warn', label: 'Lijkt op bestaande factuur', detail: `${possible.reasons.join(' + ')}` });
            } else {
                checks.push({ id: 'dupe', status: 'ok', label: 'Niet eerder ingeboekt', detail: 'Uniek in je systeem' });
            }
        }

        // Check 5: lege factuurnummer waarschuwing
        if (!invoice.factuurnummer || String(invoice.factuurnummer).trim() === '') {
            checks.push({ id: 'nummer', status: 'warn', label: 'Factuurnummer ontbreekt', detail: 'Handmatig invullen voor audit-trail' });
        }

        // Check 6: lege leverancier
        if (!invoice.leverancier || String(invoice.leverancier).trim() === '' || invoice.leverancier === 'Onbekend') {
            checks.push({ id: 'lev', status: 'warn', label: 'Leverancier onbekend', detail: 'Vul handmatig in' });
        }

        const hasErrors = checks.some(c => c.status === 'error');
        const hasWarnings = checks.some(c => c.status === 'warn');
        const overall: 'ok' | 'warn' | 'error' = hasErrors ? 'error' : hasWarnings ? 'warn' : 'ok';

        return { checks, overall };
    }, [invoice, existingInvoices]);

    function updateHeader<K extends keyof ParsedInvoice>(key: K, val: ParsedInvoice[K]) {
        setInvoice({ ...invoice, [key]: val });
    }
    function updateLine(idx: number, key: keyof ParsedInvoiceLine, val: any) {
        const lines = [...(invoice.regels || [])];
        lines[idx] = { ...lines[idx], [key]: val };
        setInvoice({ ...invoice, regels: lines });
    }
    function removeLine(idx: number) {
        const lines = [...(invoice.regels || [])];
        lines.splice(idx, 1);
        setInvoice({ ...invoice, regels: lines });
    }
    function addLine() {
        const lines = [...(invoice.regels || [])];
        lines.push({ product_naam: '', hoeveelheid: 1, eenheid: 'stuks', prijs_per_eenheid: 0, btw_pct: 21, subtotaal: 0 });
        setInvoice({ ...invoice, regels: lines });
    }
    async function doSave() {
        setSaving(true);
        await onSave();
        setSaving(false);
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <BtnGhost icon={ArrowLeft} onClick={onCancel}>Annuleren</BtnGhost>
                <div style={{ flex: 1 }}>
                    <h2 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 300, fontSize: 24, margin: 0 }}>Controleer factuur</h2>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>AI heeft de gegevens gelezen — corrigeer waar nodig en klik opslaan.</div>
                </div>
                <BtnPrimary
                    icon={Save}
                    onClick={doSave}
                    disabled={saving || validation.overall === 'error'}
                    style={validation.overall === 'error' ? { background: 'var(--red)', opacity: 0.5 } : undefined}
                >
                    {saving ? 'Opslaan…' : validation.overall === 'error' ? 'Los blokkers op' : 'Opslaan'}
                </BtnPrimary>
            </div>

            <SectionExplain>
                <strong style={{ color: 'var(--text)' }}>Tip:</strong> klik op elk veld om te bewerken. De AI maakt soms kleine fouten bij slechte scans — check de validatie-badges hieronder om te zien wat klopt.
            </SectionExplain>

            {/* Validatie-badges */}
            <MetalCard style={{
                borderColor: validation.overall === 'error' ? 'rgba(239,68,68,.4)' : validation.overall === 'warn' ? 'rgba(245,158,11,.3)' : 'rgba(34,197,94,.3)',
            }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: validation.overall === 'error' ? 'rgba(239,68,68,.05)' : validation.overall === 'warn' ? 'rgba(245,158,11,.04)' : 'rgba(34,197,94,.04)' }}>
                    {validation.overall === 'ok' ? <Check size={16} style={{ color: 'var(--green)' }} /> : validation.overall === 'warn' ? <AlertTriangle size={16} style={{ color: 'var(--amber)' }} /> : <AlertTriangle size={16} style={{ color: 'var(--red)' }} />}
                    <div style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
                        {validation.overall === 'ok' ? 'Alles ziet er goed uit — klaar om op te slaan' : validation.overall === 'warn' ? `${validation.checks.filter(c => c.status === 'warn').length} aandachtspunt${validation.checks.filter(c => c.status === 'warn').length === 1 ? '' : 'en'} — check voor opslaan` : 'Blokkers gevonden — los op voor opslaan'}
                    </div>
                    <span style={{ fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted-light)', fontWeight: 700 }}>
                        {validation.checks.filter(c => c.status === 'ok').length} OK · {validation.checks.filter(c => c.status === 'warn').length} WARN · {validation.checks.filter(c => c.status === 'error').length} ERROR
                    </span>
                </div>
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {validation.checks.map(c => (
                        <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: 10, alignItems: 'center', padding: '6px 10px', borderRadius: 6, background: c.status === 'error' ? 'rgba(239,68,68,.04)' : c.status === 'warn' ? 'rgba(245,158,11,.04)' : 'transparent' }}>
                            {c.status === 'ok' ? <Check size={12} style={{ color: 'var(--green)' }} /> : c.status === 'warn' ? <AlertTriangle size={12} style={{ color: 'var(--amber)' }} /> : <X size={12} style={{ color: 'var(--red)' }} />}
                            <span style={{ fontSize: 12, fontWeight: 500, color: c.status === 'error' ? 'var(--red)' : c.status === 'warn' ? 'var(--amber)' : 'var(--text)' }}>{c.label}</span>
                            {c.detail && <span style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'right' }}>{c.detail}</span>}
                        </div>
                    ))}
                </div>
            </MetalCard>

            <div style={{ display: 'grid', gridTemplateColumns: preview ? '1fr 1.4fr' : '1fr', gap: 16 }}>
                {preview && (
                    <MetalCard>
                        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <FileScan size={14} style={{ color: GOLD }} />
                            <span style={{ fontSize: 13, fontWeight: 600 }}>Gescand document</span>
                        </div>
                        <div style={{ padding: 14, maxHeight: 700, overflow: 'auto' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={preview} alt="Factuur preview" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />
                        </div>
                    </MetalCard>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <MetalCard>
                        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>Header</span>
                        </div>
                        <div style={{ padding: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <Field label="Leverancier" value={invoice.leverancier || ''} onChange={v => updateHeader('leverancier', v)} />
                            <Field label="Factuurnummer" value={invoice.factuurnummer || ''} onChange={v => updateHeader('factuurnummer', v)} />
                            <Field label="Datum" value={invoice.datum || ''} onChange={v => updateHeader('datum', v)} type="date" />
                            <CurrencyField label={<Hint tip="Bedrag exclusief BTW zoals op de factuur staat. AI berekent dit automatisch.">Totaal excl. BTW</Hint>} value={String(invoice.totaal_excl ?? 0)} onChange={v => updateHeader('totaal_excl', parseFloat(v) || 0)} />
                            <CurrencyField label="BTW bedrag" value={String(invoice.totaal_btw ?? 0)} onChange={v => updateHeader('totaal_btw', parseFloat(v) || 0)} />
                            <CurrencyField label="Totaal incl. BTW" value={String(invoice.totaal_incl ?? 0)} onChange={v => updateHeader('totaal_incl', parseFloat(v) || 0)} />
                        </div>
                    </MetalCard>

                    <MetalCard>
                        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>Factuur-regels · {(invoice.regels || []).length}</span>
                            <BtnGhost icon={Plus} onClick={addLine}>Regel toevoegen</BtnGhost>
                        </div>
                        <div style={{ maxHeight: 420, overflow: 'auto' }}>
                            {(invoice.regels || []).length === 0 ? (
                                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                                    Geen regels — voeg handmatig toe met knop boven.
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                            {['Product', 'Aantal', 'Eenheid', 'Prijs (€)', 'BTW (%)', 'Subtotaal (€)', ''].map(h => (
                                                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(invoice.regels || []).map((r, i) => (
                                            <React.Fragment key={i}>
                                                <tr style={{ borderBottom: (inventory || supplierPrices) ? 'none' : '1px solid var(--border)' }}>
                                                    <td style={{ padding: 4 }}><InlineInput value={r.product_naam} onChange={v => updateLine(i, 'product_naam', v)} /></td>
                                                    <td style={{ padding: 4, width: 70 }}><InlineInput value={String(r.hoeveelheid)} onChange={v => updateLine(i, 'hoeveelheid', parseFloat(v) || 0)} type="number" /></td>
                                                    <td style={{ padding: 4, width: 80 }}><InlineInput value={r.eenheid} onChange={v => updateLine(i, 'eenheid', v)} /></td>
                                                    <td style={{ padding: 4, width: 92 }}><InlineInput prefix="€" value={String(r.prijs_per_eenheid)} onChange={v => updateLine(i, 'prijs_per_eenheid', parseFloat(v) || 0)} type="number" /></td>
                                                    <td style={{ padding: 4, width: 72 }}><InlineInput suffix="%" value={String(r.btw_pct)} onChange={v => updateLine(i, 'btw_pct', parseFloat(v) || 0)} type="number" /></td>
                                                    <td style={{ padding: 4, width: 102 }}><InlineInput prefix="€" value={String(r.subtotaal)} onChange={v => updateLine(i, 'subtotaal', parseFloat(v) || 0)} type="number" /></td>
                                                    <td style={{ padding: 4, width: 28 }}>
                                                        <button onClick={() => removeLine(i)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}>
                                                            <X size={12} />
                                                        </button>
                                                    </td>
                                                </tr>
                                                {(inventory || supplierPrices) && (
                                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td colSpan={7} style={{ padding: '0 4px 6px 10px' }}>
                                                            <LineInsights line={r} inventory={inventory || []} supplierPrices={supplierPrices || []} invoices={existingInvoices || []} />
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </MetalCard>
                </div>
            </div>
        </div>
    );
}

function Field({ label, value, onChange, type, prefix, suffix }: { label: React.ReactNode; value: string; onChange: (v: string) => void; type?: string; prefix?: string; suffix?: string }) {
    return (
        <div>
            <Eyebrow>{label}</Eyebrow>
            <div style={{ position: 'relative', marginTop: 6 }}>
                {prefix && <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 13, pointerEvents: 'none', fontWeight: 600 }}>{prefix}</span>}
                <input value={value} onChange={e => onChange(e.target.value)} type={type || 'text'}
                    style={{ width: '100%', padding: '9px 12px', paddingLeft: prefix ? 28 : 12, paddingRight: suffix ? 32 : 12, background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, fontVariantNumeric: 'tabular-nums', outline: 'none' }} />
                {suffix && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 13, pointerEvents: 'none', fontWeight: 600 }}>{suffix}</span>}
            </div>
        </div>
    );
}

function CurrencyField(props: Omit<Parameters<typeof Field>[0], 'prefix' | 'type'>) {
    return <Field {...props} type="number" prefix="€" />;
}

function PercentField(props: Omit<Parameters<typeof Field>[0], 'suffix' | 'type'>) {
    return <Field {...props} type="number" suffix="%" />;
}

/** Mini-sparkline: 6 recente prijzen voor een product */
function PriceSparkline({ prices, currentPrice }: { prices: number[]; currentPrice?: number }) {
    if (!prices || prices.length < 2) return null;
    const all = currentPrice ? [...prices, currentPrice] : prices;
    const min = Math.min(...all);
    const max = Math.max(...all);
    const range = max - min || 1;
    const w = 60, h = 18;
    const pts = prices.map((p, i) => {
        const x = (i / (prices.length - 1)) * w;
        const y = h - ((p - min) / range) * h;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    // Trendkleur op basis van laatste vs vorige
    const last = prices[prices.length - 1];
    const prev = prices[prices.length - 2];
    const up = last > prev;
    const color = up ? 'var(--red)' : 'var(--green)';
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth="1.3" vectorEffect="non-scaling-stroke" opacity="0.8" />
            {currentPrice && (
                <circle
                    cx={w}
                    cy={h - ((currentPrice - min) / range) * h}
                    r={2.5}
                    fill={currentPrice > prices[prices.length - 1] ? 'var(--red)' : 'var(--green)'}
                />
            )}
        </svg>
    );
}

/** Insights per regel: voorraad-match + prijsverloop + % change */
function LineInsights({ line, inventory, supplierPrices, invoices }: {
    line: ParsedInvoiceLine;
    inventory: any[];
    supplierPrices: any[];
    invoices: any[];
}) {
    const match = useMemo(() => matchInventoryItem(line.product_naam, inventory), [line.product_naam, inventory]);
    const history = useMemo(() => getProductPriceHistory(line.product_naam, supplierPrices, invoices), [line.product_naam, supplierPrices, invoices]);

    const currentPrice = parseFloat(String(line.prijs_per_eenheid || 0));
    const historyPrices = history.map(h => h.prijs);
    const avgHistory = historyPrices.length > 0 ? historyPrices.reduce((s, p) => s + p, 0) / historyPrices.length : 0;
    const pctChange = avgHistory > 0 && currentPrice > 0 ? ((currentPrice - avgHistory) / avgHistory) * 100 : null;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--muted)' }}>
            {/* Voorraad-match badge */}
            {match && match.confidence > 0.8 ? (
                <span title={`Match met voorraad: ${match.item.naam} (${Math.round(match.confidence * 100)}%)`}
                    style={{ padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700, letterSpacing: '.05em', background: 'rgba(34,197,94,.15)', color: 'var(--green)', border: '1px solid rgba(34,197,94,.3)', whiteSpace: 'nowrap' }}>
                    ✓ VOORRAAD
                </span>
            ) : match && match.confidence > 0.5 ? (
                <span title={`Mogelijk match: ${match.item.naam} (${Math.round(match.confidence * 100)}%)`}
                    style={{ padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700, letterSpacing: '.05em', background: 'rgba(245,158,11,.15)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,.3)', whiteSpace: 'nowrap' }}>
                    ? MATCH
                </span>
            ) : null}

            {/* Sparkline */}
            {historyPrices.length >= 2 && (
                <div title={`${historyPrices.length} eerdere prijzen · gemiddeld ${fmt2(avgHistory)}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <PriceSparkline prices={historyPrices} currentPrice={currentPrice > 0 ? currentPrice : undefined} />
                </div>
            )}

            {/* % change vs gemiddelde */}
            {pctChange !== null && Math.abs(pctChange) > 3 && (
                <span title={`Gemiddeld was ${fmt2(avgHistory)} over ${historyPrices.length} eerdere facturen`}
                    style={{ fontSize: 10, fontWeight: 700, color: pctChange > 0 ? 'var(--red)' : 'var(--green)', whiteSpace: 'nowrap' }}>
                    {pctChange > 0 ? '↑' : '↓'} {Math.abs(pctChange).toFixed(0)}%
                </span>
            )}
        </div>
    );
}

function InlineInput({ value, onChange, type, prefix, suffix }: { value: string; onChange: (v: string) => void; type?: string; prefix?: string; suffix?: string }) {
    return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            {prefix && <span style={{ position: 'absolute', left: 7, color: 'var(--muted)', fontSize: 11, pointerEvents: 'none', fontWeight: 600 }}>{prefix}</span>}
            <input value={value} onChange={e => onChange(e.target.value)} type={type || 'text'}
                style={{ width: '100%', padding: '6px 8px', paddingLeft: prefix ? 20 : 8, paddingRight: suffix ? 22 : 8, background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, fontVariantNumeric: 'tabular-nums', outline: 'none' }} />
            {suffix && <span style={{ position: 'absolute', right: 7, color: 'var(--muted)', fontSize: 11, pointerEvents: 'none', fontWeight: 600 }}>{suffix}</span>}
        </div>
    );
}

function MiniStat({ label, value, sub, tone, icon: I }: { label: React.ReactNode; value: React.ReactNode; sub?: string; tone?: 'ok' | 'warn' | 'bad'; icon?: any }) {
    const color = tone === 'ok' ? 'var(--green)' : tone === 'warn' ? 'var(--amber)' : tone === 'bad' ? 'var(--red)' : 'var(--text)';
    return (
        <MetalCard>
            <div style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <Eyebrow>{label}</Eyebrow>
                    {I && <I size={12} style={{ color: 'var(--muted-light)' }} />}
                </div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 500, fontSize: 22, fontVariantNumeric: 'tabular-nums', color }}>{value}</div>
                {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
            </div>
        </MetalCard>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   FOLDER 2 — BONNEN
   ═══════════════════════════════════════════════════════════════════ */

function FolderReceipts() {
    const { data: bonnen, insert, remove, refetch } = useSupabase<any>('bonnen', []);
    const showToast = useToast();
    const showConfirm = useConfirm();
    const [scanStep, setScanStep] = useState<'idle' | 'prep' | 'upload' | 'ai' | 'done' | 'error'>('idle');
    const [parsed, setParsed] = useState<any | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [lastFile, setLastFile] = useState<File | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const cameraRef = useRef<HTMLInputElement>(null);
    const scanning = scanStep !== 'idle' && scanStep !== 'done' && scanStep !== 'error';

    async function handleFile(file: File) {
        if (!file) return;
        setError(null);
        setLastFile(file);
        setScanStep('prep');
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const doc: PreparedDocument = await prepareDocument(file);
            if (controller.signal.aborted) return;
            setPreview(doc.base64);
            setScanStep('upload');
            const payload: any = { type: 'receipt' };
            if (doc.kind === 'pdf') payload.pdfBase64 = doc.base64;
            else payload.imageBase64 = doc.base64;
            const res = await fetch('/api/parse-document', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            setScanStep('ai');
            const body = await res.json();
            if (controller.signal.aborted) return;
            if (!res.ok) { setError(body.detail || body.error || 'Scan mislukt — probeer een duidelijkere foto'); setScanStep('error'); return; }
            setParsed(body.data);
            setScanStep('done');
            showToast('Bon gelezen — controleer en bewaar', 'success');
        } catch (e: any) {
            if (e?.name === 'AbortError') { setScanStep('idle'); return; }
            setError(e.message || 'Scan mislukt');
            setScanStep('error');
        }
    }

    function cancelScan() { abortRef.current?.abort(); setScanStep('idle'); setPreview(null); setError(null); }
    function retryScan() { if (lastFile) handleFile(lastFile); }

    async function saveReceipt() {
        if (!parsed) return;
        await insert({
            winkel: parsed.winkel || 'Onbekend',
            datum: parsed.datum || null,
            totaal_bedrag: parsed.totaal_bedrag || 0,
            btw_pct: parsed.btw_pct || 21,
            categorie: parsed.categorie || null,
            raw_analysis: parsed.regels || [],
            notities: parsed.notities || null,
            status: 'review',
        } as any);
        showToast('Bon opgeslagen', 'success');
        setParsed(null); setPreview(null);
        refetch();
    }

    const total = (bonnen || []).reduce((s: number, b: any) => s + (parseFloat(b.totaal_bedrag) || 0), 0);

    if (parsed) {
        return <ReceiptReview parsed={parsed} setParsed={setParsed} preview={preview} onSave={saveReceipt} onCancel={() => { setParsed(null); setPreview(null); }} />;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <SectionExplain>
                <strong style={{ color: 'var(--text)' }}>Zo werkt bonnen scannen:</strong> fotografeer een kassabon met je telefoon, of upload een foto. AI leest winkel, totaal, BTW en regels. Ideaal voor Makro, Jumbo, Albert Heijn tussenaankopen.
            </SectionExplain>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <MiniStat label="Bonnen totaal" value={bonnen.length} icon={Receipt} />
                <MiniStat label="Totaalbedrag" value={fmt2(total)} icon={Euro} />
                <MiniStat label="Deze maand" value={bonnen.filter((b: any) => b.datum && b.datum.startsWith(new Date().toISOString().slice(0, 7))).length} icon={Clock} />
            </div>

            <MetalCard>
                {scanning ? (
                    <ScanProgress step={scanStep as any} onCancel={cancelScan} />
                ) : (
                    <div
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
                        style={{ padding: '30px 20px', textAlign: 'center', border: `2px dashed var(--border-strong)`, margin: 14, borderRadius: 12 }}>
                        <div style={{ width: 56, height: 56, margin: '0 auto 14px', borderRadius: 14, background: `${GOLD}18`, border: `1px solid ${GOLD}4D`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Receipt size={24} style={{ color: GOLD }} />
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 20, fontWeight: 300, marginBottom: 6 }}>Upload kassabon</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 18 }}>Fotografeer met je telefoon of upload een bestaande foto.</div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <BtnPrimary icon={Camera} onClick={() => cameraRef.current?.click()}>Foto maken</BtnPrimary>
                            <BtnGhost icon={FolderOpen} onClick={() => fileRef.current?.click()}>Kies bestand</BtnGhost>
                        </div>
                        <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                    </div>
                )}
                {error && scanStep === 'error' && (
                    <div style={{ margin: '0 14px 14px' }}>
                        <ErrorBanner error={error} onRetry={lastFile ? retryScan : undefined} onDismiss={() => { setError(null); setScanStep('idle'); }} />
                    </div>
                )}
            </MetalCard>

            <MetalCard>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Receipt size={14} style={{ color: GOLD }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Gescande bonnen</span>
                </div>
                {bonnen.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Nog geen bonnen. Upload je eerste.</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: 'rgba(130,130,130,.04)', borderBottom: '1px solid var(--border)' }}>
                                {['Winkel', 'Datum', 'Categorie', 'Bedrag', 'BTW%', 'Regels', ''].map(h => (
                                    <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Bedrag' ? 'right' : 'left', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {bonnen.slice().sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((b: any) => (
                                <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{b.winkel}</td>
                                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{b.datum || '—'}</td>
                                    <td style={{ padding: '10px 12px' }}>{b.categorie ? <Pill variant="brand">{b.categorie}</Pill> : <span style={{ color: 'var(--muted-light)' }}>—</span>}</td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt2(b.totaal_bedrag)}</td>
                                    <td style={{ padding: '10px 12px', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{b.btw_pct || 21}%</td>
                                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{Array.isArray(b.raw_analysis) ? b.raw_analysis.length : '—'}</td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                        <button onClick={() => showConfirm('Bon verwijderen?', () => remove(b.id).then(() => showToast('Verwijderd', 'success')))} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </MetalCard>
        </div>
    );
}

function ReceiptReview({ parsed, setParsed, preview, onSave, onCancel }: { parsed: any; setParsed: (p: any) => void; preview: string | null; onSave: () => void | Promise<void>; onCancel: () => void }) {
    const [saving, setSaving] = useState(false);
    function upd(k: string, v: any) { setParsed({ ...parsed, [k]: v }); }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <BtnGhost icon={ArrowLeft} onClick={onCancel}>Annuleren</BtnGhost>
                <div style={{ flex: 1 }}>
                    <h2 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 300, fontSize: 22, margin: 0 }}>Controleer bon</h2>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Corrigeer en bewaar.</div>
                </div>
                <BtnPrimary icon={Save} onClick={async () => { setSaving(true); await onSave(); setSaving(false); }} disabled={saving}>{saving ? 'Opslaan…' : 'Bewaren'}</BtnPrimary>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: preview ? '1fr 1.4fr' : '1fr', gap: 14 }}>
                {preview && (
                    <MetalCard>
                        <div style={{ padding: 14, maxHeight: 600, overflow: 'auto' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={preview} alt="Bon" style={{ width: '100%', borderRadius: 8 }} />
                        </div>
                    </MetalCard>
                )}
                <MetalCard>
                    <div style={{ padding: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Field label="Winkel" value={parsed.winkel || ''} onChange={v => upd('winkel', v)} />
                        <Field label="Datum" value={parsed.datum || ''} onChange={v => upd('datum', v)} type="date" />
                        <CurrencyField label="Totaal bedrag (incl BTW)" value={String(parsed.totaal_bedrag ?? 0)} onChange={v => upd('totaal_bedrag', parseFloat(v) || 0)} />
                        <PercentField label="BTW tarief" value={String(parsed.btw_pct ?? 21)} onChange={v => upd('btw_pct', parseFloat(v) || 21)} />
                        <div style={{ gridColumn: '1 / -1' }}>
                            <Field label="Categorie" value={parsed.categorie || ''} onChange={v => upd('categorie', v)} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <Field label="Notities" value={parsed.notities || ''} onChange={v => upd('notities', v)} />
                        </div>
                    </div>
                    {Array.isArray(parsed.regels) && parsed.regels.length > 0 && (
                        <div style={{ borderTop: '1px solid var(--border)', padding: 14 }}>
                            <Eyebrow>Gescande regels</Eyebrow>
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {parsed.regels.map((r: any, i: number) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 8px', background: 'rgba(130,130,130,.04)', borderRadius: 6 }}>
                                        <span>{r.product_naam} {r.aantal ? `· ${r.aantal}x` : ''}</span>
                                        <span style={{ fontVariantNumeric: 'tabular-nums', color: GOLD, fontWeight: 600 }}>{fmt2(r.prijs)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </MetalCard>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   FOLDER 3 — BOEKHOUDING (inzichten per leverancier + CSV-import)
   ═══════════════════════════════════════════════════════════════════ */

const SUPPLIER_COLORS = ['#FFBF00', '#c4a35a', '#4ECDC4', '#22c55e', '#a78bfa', '#3b82f6', '#f97316', '#ef4444', '#10b981', '#8b8bf0'];

function FolderBooks() {
    const { data: invoices } = useSupabase<any>('supplier_invoices', []);
    const { data: bonnen } = useSupabase<any>('bonnen', []);
    const { data: prijzen } = useSupabase<any>('supplier_prices', []);
    const [csvOpen, setCsvOpen] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);

    const bySupplier = useMemo(() => {
        const m: Record<string, { spend: number; count: number; lastDate: string | null; products: number; lines: { product: string; prijs: number; eenheid: string }[] }> = {};
        (invoices || []).forEach((i: any) => {
            const key = i.leverancier || 'Onbekend';
            if (!m[key]) m[key] = { spend: 0, count: 0, lastDate: null, products: 0, lines: [] };
            m[key].spend += parseFloat(i.totaal_incl) || 0;
            m[key].count += 1;
            if (!m[key].lastDate || (i.datum && i.datum > m[key].lastDate)) m[key].lastDate = i.datum;
            if (Array.isArray(i.raw_ai_response?.regels)) {
                i.raw_ai_response.regels.forEach((r: any) => {
                    if (r.product_naam && r.prijs_per_eenheid) {
                        m[key].lines.push({ product: r.product_naam, prijs: parseFloat(r.prijs_per_eenheid), eenheid: r.eenheid || 'stuks' });
                    }
                });
            }
        });
        (prijzen || []).forEach((p: any) => {
            const key = p.leverancier || 'Onbekend';
            if (!m[key]) m[key] = { spend: 0, count: 0, lastDate: null, products: 0, lines: [] };
            m[key].products += 1;
            m[key].lines.push({ product: p.product_naam, prijs: parseFloat(p.prijs), eenheid: p.eenheid || 'stuks' });
        });
        return Object.entries(m).map(([name, d], i) => ({ name, color: SUPPLIER_COLORS[i % SUPPLIER_COLORS.length], ...d })).sort((a, b) => b.spend - a.spend);
    }, [invoices, prijzen]);

    const totalSpend = bySupplier.reduce((s, x) => s + x.spend, 0);
    const totalReceipts = (bonnen || []).reduce((s: number, b: any) => s + (parseFloat(b.totaal_bedrag) || 0), 0);

    if (csvOpen) return <CSVImport onClose={() => setCsvOpen(false)} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <SectionExplain>
                <strong style={{ color: 'var(--text)' }}>Zo werkt boekhouding-overzicht:</strong> hier zie je al je ingaande uitgaven per leverancier — verzameld uit ingescande facturen, kassabonnen en handmatig geïmporteerde CSV-prijslijsten. Kies een leverancier voor detail of gebruik de CSV-knop voor snelle prijsimport.
            </SectionExplain>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <MiniStat label="Totale inkoop" value={fmt2(totalSpend)} sub={`${bySupplier.length} leveranciers`} icon={Euro} />
                <MiniStat label={<Hint tip="Som van alle geboekte en ingescande leverancier-facturen.">Facturen</Hint>} value={fmt2(totalSpend)} sub={`${invoices.length} documenten`} icon={FileText} />
                <MiniStat label="Kassabonnen" value={fmt2(totalReceipts)} sub={`${bonnen.length} bonnen`} icon={Receipt} />
                <MiniStat label="Getrackte prijzen" value={prijzen.length} sub="CSV + scans" icon={TrendingUp} />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <BtnGhost icon={Upload} onClick={() => setCsvOpen(true)}>CSV prijslijst importeren</BtnGhost>
            </div>

            <SupplierDonut bySupplier={bySupplier} total={totalSpend} onSelect={setSelectedSupplier} />

            {selectedSupplier && (
                <SupplierAnalysisDrawer
                    supplierName={selectedSupplier}
                    bySupplier={bySupplier}
                    totalSpend={totalSpend}
                    onClose={() => setSelectedSupplier(null)}
                />
            )}

            <div style={{ padding: 16, borderRadius: 10, background: `${GOLD}0A`, border: `1px solid ${GOLD}26`, display: 'flex', gap: 12, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                <Info size={16} style={{ color: GOLD, flexShrink: 0, marginTop: 1 }} />
                <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: 6 }}>Tip</div>
                    Hoe meer facturen en bonnen je scant, hoe preciezer dit overzicht wordt. De AI categoriseert automatisch — klopt iets niet? Open de factuur/bon en corrigeer. Alle wijzigingen reflecteren hier direct.
                </div>
            </div>
        </div>
    );
}

function CSVImport({ onClose }: { onClose: () => void }) {
    const { insert } = useSupabase<any>('supplier_prices', []);
    const showToast = useToast();
    const [step, setStep] = useState(1);
    const [csv, setCsv] = useState<{ headers: string[]; rows: Record<string, any>[] } | null>(null);
    const [leverancier, setLeverancier] = useState('');
    const [mapping, setMap] = useState({ product_naam: '', prijs: '', eenheid: '' });
    const [imp, setImp] = useState({ progress: 0, success: 0, error: 0, running: false });
    const fileRef = useRef<HTMLInputElement>(null);

    function onFile(f: File) {
        Papa.parse(f, {
            header: true, skipEmptyLines: true,
            complete: (r: any) => {
                setCsv({ headers: r.meta.fields, rows: r.data });
                const map = { product_naam: '', prijs: '', eenheid: '' };
                r.meta.fields.forEach((h: string) => {
                    const l = h.toLowerCase();
                    if (['naam', 'product', 'artikel', 'omschrijving'].some(k => l.includes(k))) map.product_naam = h;
                    if (['prijs', 'price', 'excl'].some(k => l.includes(k))) map.prijs = h;
                    if (['eenheid', 'unit', 'verpakking'].some(k => l.includes(k))) map.eenheid = h;
                });
                setMap(map);
                setStep(2);
            },
        });
    }

    async function run() {
        if (!csv || !leverancier || !mapping.product_naam || !mapping.prijs) return;
        setImp({ progress: 0, success: 0, error: 0, running: true });
        const datum = new Date().toISOString().split('T')[0];
        for (let i = 0; i < csv.rows.length; i++) {
            const r = csv.rows[i];
            const naam = r[mapping.product_naam];
            const p = parseFloat(String(r[mapping.prijs] || '0').replace(',', '.').replace(/[^0-9.]/g, ''));
            const eenheid = mapping.eenheid ? r[mapping.eenheid] : 'stuks';
            if (naam && !isNaN(p) && p > 0) {
                try { await insert({ leverancier, product_naam: naam, prijs: p, eenheid: eenheid || 'stuks', datum } as any); setImp(s => ({ ...s, success: s.success + 1 })); }
                catch { setImp(s => ({ ...s, error: s.error + 1 })); }
            } else setImp(s => ({ ...s, error: s.error + 1 }));
            setImp(s => ({ ...s, progress: Math.round(((i + 1) / csv.rows.length) * 100) }));
        }
        setImp(s => ({ ...s, running: false }));
        showToast('CSV geïmporteerd', 'success');
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <BtnGhost icon={ArrowLeft} onClick={onClose}>Terug</BtnGhost>
                <h2 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 300, fontSize: 24, margin: 0 }}>CSV prijslijst importeren</h2>
            </div>
            <SectionExplain>
                Upload een CSV-export van Sligro, Hanos of Bidfood. Wij onthouden je mapping voor volgende keer.
            </SectionExplain>

            {step === 1 && (
                <MetalCard>
                    <div style={{ padding: 40, textAlign: 'center' }}>
                        <div style={{ marginBottom: 20, display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                            <Eyebrow>Leverancier</Eyebrow>
                            <input value={leverancier} onChange={e => setLeverancier(e.target.value)} placeholder="bijv. Sligro"
                                style={{ width: 300, padding: '9px 12px', background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }} />
                        </div>
                        <div onClick={() => fileRef.current?.click()} style={{ cursor: 'pointer', border: '2px dashed var(--border-strong)', borderRadius: 16, padding: 32, maxWidth: 500, margin: '20px auto 0' }}>
                            <Upload size={24} style={{ color: GOLD, margin: '0 auto 10px' }} />
                            <div style={{ fontSize: 14, fontWeight: 600 }}>Klik of sleep CSV</div>
                            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
                        </div>
                    </div>
                </MetalCard>
            )}

            {step === 2 && csv && (
                <MetalCard>
                    <div style={{ padding: 18 }}>
                        <Eyebrow>Koppel de kolommen · {csv.rows.length} regels</Eyebrow>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
                            <div>
                                <Eyebrow>Product *</Eyebrow>
                                <select value={mapping.product_naam} onChange={e => setMap({ ...mapping, product_naam: e.target.value })} style={{ width: '100%', marginTop: 6, padding: '9px 12px', background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}>
                                    <option value="">Kies…</option>
                                    {csv.headers.map(h => <option key={h}>{h}</option>)}
                                </select>
                            </div>
                            <div>
                                <Eyebrow>Prijs excl. BTW *</Eyebrow>
                                <select value={mapping.prijs} onChange={e => setMap({ ...mapping, prijs: e.target.value })} style={{ width: '100%', marginTop: 6, padding: '9px 12px', background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}>
                                    <option value="">Kies…</option>
                                    {csv.headers.map(h => <option key={h}>{h}</option>)}
                                </select>
                            </div>
                            <div>
                                <Eyebrow>Eenheid</Eyebrow>
                                <select value={mapping.eenheid} onChange={e => setMap({ ...mapping, eenheid: e.target.value })} style={{ width: '100%', marginTop: 6, padding: '9px 12px', background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}>
                                    <option value="">Standaard stuks</option>
                                    {csv.headers.map(h => <option key={h}>{h}</option>)}
                                </select>
                            </div>
                        </div>
                        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                            <BtnPrimary onClick={() => { setStep(3); run(); }} disabled={!mapping.product_naam || !mapping.prijs || !leverancier}>Import starten</BtnPrimary>
                            <BtnGhost onClick={onClose}>Annuleren</BtnGhost>
                        </div>
                    </div>
                </MetalCard>
            )}

            {step === 3 && (
                <MetalCard>
                    <div style={{ padding: 40, textAlign: 'center' }}>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 48, fontWeight: 300, color: GOLD }}>{imp.progress}%</div>
                        <div style={{ maxWidth: 400, margin: '0 auto', height: 6, background: 'rgba(255,255,255,.05)', borderRadius: 3, overflow: 'hidden', marginTop: 12 }}>
                            <div style={{ background: GOLD, height: '100%', width: imp.progress + '%', transition: 'width .2s' }} />
                        </div>
                        <div style={{ marginTop: 20, display: 'flex', gap: 14, justifyContent: 'center', fontSize: 13 }}>
                            <span style={{ color: 'var(--green)' }}><strong>{imp.success}</strong> succesvol</span>
                            <span style={{ color: 'var(--red)' }}><strong>{imp.error}</strong> fouten</span>
                        </div>
                        {!imp.running && <div style={{ marginTop: 20 }}><BtnPrimary onClick={onClose}>Klaar</BtnPrimary></div>}
                    </div>
                </MetalCard>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   SUPPLIER DONUT CHART (klikbaar)
   ═══════════════════════════════════════════════════════════════════ */

type SupplierRow = { name: string; color: string; spend: number; count: number; products: number; lastDate: string | null; lines: { product: string; prijs: number; eenheid: string }[] };

function SupplierDonut({ bySupplier, total, onSelect }: { bySupplier: SupplierRow[]; total: number; onSelect: (s: string) => void }) {
    const [hovered, setHovered] = useState<string | null>(null);
    const R = 90, IR = 60, CX = 110, CY = 110;
    const C = 2 * Math.PI * R;

    const spendSuppliers = bySupplier.filter(s => s.spend > 0);
    const emptySuppliers = bySupplier.filter(s => s.spend === 0);

    let offset = 0;
    const segs = spendSuppliers.map(s => {
        const pct = total > 0 ? s.spend / total : 0;
        const len = pct * C;
        const seg = { ...s, pct, len, offset, dash: len, gap: C - len };
        offset += len;
        return seg;
    });
    const hov = hovered ? segs.find(s => s.name === hovered) : null;

    return (
        <MetalCard>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <PieChart size={14} style={{ color: GOLD }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Uitgaven per leverancier</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>· klik op een taartpunt voor AI-advies</span>
            </div>

            {bySupplier.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    Nog geen leverancier-data. Scan een factuur of importeer een CSV.
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: spendSuppliers.length > 0 ? '280px 1fr' : '1fr', gap: 28, padding: 22 }}>
                    {spendSuppliers.length > 0 && (
                        <div style={{ position: 'relative', width: 240, height: 240, justifySelf: 'center' }}>
                            <svg width="240" height="240" viewBox="0 0 220 220" style={{ transform: 'rotate(-90deg)' }}>
                                <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(130,130,130,.08)" strokeWidth={R - IR} />
                                {segs.map(s => (
                                    <circle key={s.name}
                                        cx={CX} cy={CY} r={R}
                                        fill="none" stroke={s.color}
                                        strokeWidth={R - IR}
                                        strokeDasharray={`${s.dash} ${s.gap}`}
                                        strokeDashoffset={-s.offset}
                                        style={{
                                            transition: 'all .18s',
                                            opacity: hovered && hovered !== s.name ? 0.3 : 1,
                                            strokeWidth: hovered === s.name ? (R - IR) + 6 : (R - IR),
                                            cursor: 'pointer',
                                        }}
                                        onMouseEnter={() => setHovered(s.name)}
                                        onMouseLeave={() => setHovered(null)}
                                        onClick={() => onSelect(s.name)}
                                    />
                                ))}
                            </svg>
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', pointerEvents: 'none' }}>
                                {hov ? (
                                    <>
                                        <div style={{ fontSize: 10, letterSpacing: '.18em', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>{hov.name}</div>
                                        <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 300, color: hov.color, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{fmt2(hov.spend)}</div>
                                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{(hov.pct * 100).toFixed(1)}% · klik voor AI</div>
                                    </>
                                ) : (
                                    <>
                                        <div style={{ fontSize: 10, letterSpacing: '.18em', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>Totale inkoop</div>
                                        <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{fmt2(total)}</div>
                                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{spendSuppliers.length} leveranciers</div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {spendSuppliers.map(s => {
                            const pct = total > 0 ? (s.spend / total) * 100 : 0;
                            const isHov = hovered === s.name;
                            return (
                                <div key={s.name}
                                    onMouseEnter={() => setHovered(s.name)}
                                    onMouseLeave={() => setHovered(null)}
                                    onClick={() => onSelect(s.name)}
                                    style={{
                                        display: 'grid', gridTemplateColumns: '10px 1fr auto auto', gap: 12, alignItems: 'center',
                                        padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                                        background: isHov ? 'rgba(255,255,255,.05)' : 'rgba(130,130,130,.04)',
                                        opacity: hovered && !isHov ? 0.5 : 1,
                                        transition: 'all .15s',
                                    }}>
                                    <div style={{ width: 10, height: 30, background: s.color, borderRadius: 2 }} />
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            {s.name}
                                            <span style={{ fontSize: 10, color: 'var(--muted-light)' }}>· {s.count} fact · {s.products} prod.</span>
                                        </div>
                                        <div style={{ position: 'relative', height: 4, background: 'rgba(130,130,130,.1)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                                            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: s.color, borderRadius: 2 }} />
                                        </div>
                                    </div>
                                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 16, fontWeight: 500, color: GOLD, fontVariantNumeric: 'tabular-nums', minWidth: 100, textAlign: 'right' }}>{fmt2(s.spend)}</div>
                                    <Sparkles size={14} style={{ color: GOLD }} />
                                </div>
                            );
                        })}
                        {emptySuppliers.length > 0 && (
                            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 10, letterSpacing: '.15em', color: 'var(--muted-light)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Alleen prijslijst (nog geen facturen)</div>
                                {emptySuppliers.map(s => (
                                    <div key={s.name} onClick={() => onSelect(s.name)} style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{s.name}</span>
                                        <span>{s.products} producten</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </MetalCard>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   SUPPLIER ANALYSIS DRAWER (AI conclusies)
   ═══════════════════════════════════════════════════════════════════ */

type SupplierAnalysis = {
    headline: string;
    verdict: 'green' | 'gold' | 'red';
    body: string;
    savings_tips: { product: string; action: string; impact: string }[];
    categories_strong: string[];
    categories_weak: string[];
    next_action: string;
};

function SupplierAnalysisDrawer({ supplierName, bySupplier, totalSpend, onClose }: {
    supplierName: string;
    bySupplier: SupplierRow[];
    totalSpend: number;
    onClose: () => void;
}) {
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [analysis, setAnalysis] = useState<SupplierAnalysis | null>(null);
    const [cheaperElsewhere, setCheaperElsewhere] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    const self = bySupplier.find(s => s.name === supplierName);
    const others = bySupplier.filter(s => s.name !== supplierName);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/supplier-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leverancier: supplierName,
                    context: {
                        self: self ? { count: self.count, spend: self.spend, products: self.lines.map(l => l.product).slice(0, 20), lines: self.lines.slice(0, 30) } : { count: 0, spend: 0, products: [], lines: [] },
                        others: others.map(o => ({ leverancier: o.name, spend: o.spend, count: o.count, lines: o.lines.slice(0, 30) })),
                        totalSpend,
                    },
                }),
            });
            const body = await res.json();
            if (!res.ok) { setError(body.error || 'Kon analyse niet laden'); setLoading(false); return; }
            setAnalysis(body.analysis);
            setCheaperElsewhere(body.rawData?.cheaperElsewhere || []);
        } catch (e: any) {
            setError(e?.message || 'Netwerkfout');
        } finally {
            setLoading(false);
            setLoaded(true);
        }
    }, [supplierName, self, others, totalSpend]);

    useEffect(() => {
        if (!loaded) load();
    }, [loaded, load]);

    const toneColor = analysis?.verdict === 'red' ? 'var(--red)' : analysis?.verdict === 'green' ? 'var(--green)' : GOLD;

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', zIndex: 9998 }} />
            <aside style={{
                position: 'fixed', right: 0, top: 0, height: '100vh', width: 680, maxWidth: '100vw',
                background: 'var(--color-bg-elevated)', borderLeft: '1px solid var(--border)',
                zIndex: 9999, boxShadow: '-20px 0 40px rgba(0,0,0,.4)', display: 'flex', flexDirection: 'column',
            }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: `linear-gradient(180deg, ${GOLD}15, transparent)`, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <Sparkles size={14} style={{ color: GOLD }} />
                                <span style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '.15em', textTransform: 'uppercase' }}>AI Leverancier-analyse</span>
                            </div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 300 }}>{supplierName}</div>
                            {self && (
                                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                                    {fmt2(self.spend)} uitgegeven · {self.count} facturen · {self.products} producten getracked
                                </div>
                            )}
                        </div>
                        <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
                    {loading && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                            <Sparkles size={36} style={{ color: GOLD, animation: 'pulse 1.5s ease-in-out infinite' }} />
                            <div style={{ fontSize: 14, color: 'var(--muted)' }}>AI vergelijkt {supplierName} met andere leveranciers…</div>
                        </div>
                    )}

                    {error && !loading && (
                        <ErrorBanner error={error} onRetry={load} onDismiss={() => setError(null)} />
                    )}

                    {analysis && !loading && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            <div style={{ padding: 18, borderRadius: 12, background: `${toneColor}10`, border: `1px solid ${toneColor}40` }}>
                                <div style={{ fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: toneColor, fontWeight: 700, marginBottom: 6 }}>
                                    {analysis.verdict === 'green' ? 'Blijf hier kopen' : analysis.verdict === 'red' ? 'Heroverwegen' : 'Voorwaardelijk houden'}
                                </div>
                                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 18, fontWeight: 400, lineHeight: 1.3, color: 'var(--text)' }}>
                                    {analysis.headline}
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginTop: 10 }}>
                                    {analysis.body}
                                </div>
                            </div>

                            {analysis.savings_tips?.length > 0 && (
                                <div>
                                    <Eyebrow>Concrete besparingen</Eyebrow>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                                        {analysis.savings_tips.map((tip, i) => (
                                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 12, alignItems: 'center', padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(34,197,94,.04)' }}>
                                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Lightbulb size={16} style={{ color: 'var(--green)' }} />
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 600 }}>{tip.product}</div>
                                                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{tip.action}</div>
                                                </div>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>{tip.impact}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {cheaperElsewhere.length > 0 && (
                                <div>
                                    <Eyebrow>Goedkoper bij andere leveranciers (harde cijfers)</Eyebrow>
                                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {cheaperElsewhere.slice(0, 5).map((c: any, i: number) => (
                                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 500 }}>{c.product}</div>
                                                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                                                        <span style={{ color: 'var(--red)' }}>{supplierName} {fmt2(c.selfPrice)}</span> → <span style={{ color: 'var(--green)' }}>{c.bestLev} {fmt2(c.bestPrice)}</span>
                                                    </div>
                                                </div>
                                                <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>−{c.savingsPct.toFixed(1)}%</span>
                                                <span style={{ fontSize: 11, color: 'var(--muted)' }}>per {c.eenheid || 'eenheid'}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                {analysis.categories_strong?.length > 0 && (
                                    <div style={{ padding: 14, borderRadius: 10, border: '1px solid rgba(34,197,94,.25)', background: 'rgba(34,197,94,.04)' }}>
                                        <Eyebrow><span style={{ color: 'var(--green)' }}>Sterk in</span></Eyebrow>
                                        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                            {analysis.categories_strong.map((c, i) => <Pill key={i} variant="ok">{c}</Pill>)}
                                        </div>
                                    </div>
                                )}
                                {analysis.categories_weak?.length > 0 && (
                                    <div style={{ padding: 14, borderRadius: 10, border: '1px solid rgba(239,68,68,.25)', background: 'rgba(239,68,68,.04)' }}>
                                        <Eyebrow><span style={{ color: 'var(--red)' }}>Elders kopen</span></Eyebrow>
                                        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                            {analysis.categories_weak.map((c, i) => <Pill key={i} variant="danger">{c}</Pill>)}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div style={{ padding: 14, borderRadius: 10, background: `${GOLD}10`, border: `1px solid ${GOLD}40`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                <Zap size={16} style={{ color: GOLD, flexShrink: 0, marginTop: 2 }} />
                                <div>
                                    <div style={{ fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: GOLD, fontWeight: 700, marginBottom: 4 }}>Volgende stap</div>
                                    <div style={{ fontSize: 13, lineHeight: 1.5 }}>{analysis.next_action}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {analysis && !loading && (
                    <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', background: 'var(--color-bg-deep)' }}>
                        <BtnGhost icon={Sparkles} onClick={load}>Opnieuw analyseren</BtnGhost>
                    </div>
                )}
            </aside>
        </>
    );
}
