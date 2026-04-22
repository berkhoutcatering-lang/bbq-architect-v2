/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { RequireTier } from '@/components/PaywallPrompt';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { prepareDocument, type PreparedDocument } from '@/lib/documentToImage';
import { extractPdfText, isUsableText } from '@/lib/pdfTextExtract';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import Papa from 'papaparse';
import {
    FileScan, Receipt, PieChart, Sparkles, Upload, Camera, X, Check,
    AlertTriangle, Loader2, Edit3, Trash2, Package, ArrowUpRight, Clock,
    Info, HelpCircle, Plus, FileText, TrendingUp, TrendingDown,
    Store, Euro, CloudUpload, ArrowLeft, Save, FolderOpen, Zap, Lightbulb,
    ExternalLink, Download, Archive, BarChart3, Calendar, Filter, Wallet,
    ListOrdered, FileUp,
} from 'lucide-react';

const GOLD = '#c4a35a';
const FOLDER_KEY = 'pi_folder_v2';

type Folder = 'invoices' | 'receipts' | 'books' | 'pricelists';

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
            background: 'var(--brand)', color: 'var(--brand-background)', fontWeight: 700, fontSize: 13,
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

function ModelToggle({ value, onChange }: { value: 'haiku' | 'sonnet' | 'opus'; onChange: (v: 'haiku' | 'sonnet' | 'opus') => void }) {
    const MODELS: { id: 'haiku' | 'sonnet' | 'opus'; label: string; tagline: string }[] = [
        { id: 'haiku', label: 'Haiku', tagline: 'Snel · ±8s' },
        { id: 'sonnet', label: 'Sonnet', tagline: 'Nauwkeurig · ±20s' },
        { id: 'opus', label: 'Opus', tagline: 'Premium · ±30s' },
    ];
    return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 3, borderRadius: 8, background: 'var(--color-bg-deep)', border: '1px solid var(--card-solid)' }}>
            {MODELS.map(m => {
                const active = value === m.id;
                return (
                    <button key={m.id} onClick={() => onChange(m.id)}
                        title={m.tagline}
                        style={{
                            padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                            border: 'none',
                            background: active ? 'var(--brand-primary)' : 'transparent',
                            color: active ? '#000' : 'var(--muted)',
                            transition: 'all .15s', letterSpacing: '.05em',
                        }}>
                        {m.label}
                    </button>
                );
            })}
        </div>
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
    // Gebruik prijs_normaal (reguliere stuksprijs) indien bekend — anders zie je bulkkorting als prijsdaling
    for (const inv of invoices || []) {
        const regels = inv.raw_ai_response?.regels || [];
        for (const r of regels) {
            if (!r.product_naam) continue;
            if (fuzzyScore(low, r.product_naam) > 0.6) {
                const referentiePrijs = r.prijs_normaal != null && r.prijs_normaal > 0
                    ? parseFloat(r.prijs_normaal)
                    : parseFloat(r.prijs_per_eenheid) || 0;
                history.push({ prijs: referentiePrijs, datum: inv.datum, bron: 'factuur' });
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
    { id: 'pricelists', label: 'Prijslijst Bulk', hint: '60+ PDFs → DB', Icon: ListOrdered },
    { id: 'books', label: 'Boekhouding', hint: 'Inzichten & AI', Icon: PieChart },
];

function FolderTabs({ active, onChange }: { active: Folder; onChange: (f: Folder) => void }) {
    return (
        <div className="responsive-grid-2" style={{
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
        return stored === 'invoices' || stored === 'receipts' || stored === 'books' || stored === 'pricelists' ? stored : 'books';
    });

    function changeFolder(f: Folder) {
        setFolder(f);
        if (typeof window !== 'undefined') localStorage.setItem(FOLDER_KEY, f);
    }

    return (
        <RequireTier feature="price_intelligence">
        <div className="page-container-compact" style={{ padding: '24px 32px 100px', maxWidth: 1440, margin: '0 auto' }}>
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

            <div key={folder} className="folder-inner" style={{
                background: 'var(--bg)', border: '1px solid var(--border)', borderTop: 'none',
                borderRadius: '0 0 14px 14px', padding: 22, animation: 'fadeInUp .3s ease both',
            }}>
                {folder === 'invoices' && <FolderInvoices />}
                {folder === 'receipts' && <FolderReceipts />}
                {folder === 'pricelists' && <FolderPricelists />}
                {folder === 'books' && <FolderBooks />}
            </div>
        </div>
        </RequireTier>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   FOLDER 1 — AI FACTUUR LEZEN
   ═══════════════════════════════════════════════════════════════════ */

const ARCHIVE_BUCKET = 'bonnen';

function slugify(s: string): string {
    return (s || 'onbekend')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'onbekend';
}

/** Normaliseer BTW codes (1/2) naar echte percentages (9/21). Makro/Sligro gebruiken codes. */
function normalizeBtwPct(val: any): number {
    const n = parseFloat(String(val));
    if (isNaN(n)) return 21;
    if (n === 1) return 9;
    if (n === 2 || n === 3) return 21;
    if (n > 0 && n < 5) return 21;
    return n;
}

/** Normaliseer een AI-geparste factuur: repareer BTW-codes op header + regels. */
function normalizeParsedInvoice(data: any): any {
    if (!data || typeof data !== 'object') return data;
    const out = { ...data };
    if (Array.isArray(out.regels)) {
        out.regels = out.regels.map((r: any) => ({
            ...r,
            btw_pct: normalizeBtwPct(r.btw_pct),
        }));
    }
    if (typeof out.btw_pct !== 'undefined') {
        out.btw_pct = normalizeBtwPct(out.btw_pct);
    }
    return out;
}

async function uploadDocumentToArchive(file: File, type: 'invoice' | 'receipt', meta: { supplier: string; datum?: string | null; factuurnummer?: string | null }): Promise<string | null> {
    if (!supabase) return null;
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const folder = type === 'invoice' ? 'facturen' : 'kassabonnen';
    const supplierDir = slugify(meta.supplier || 'onbekend');
    const datePart = (meta.datum || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const idPart = slugify(meta.factuurnummer || Date.now().toString(36));
    const path = `${folder}/${supplierDir}/${datePart}_${idPart}.${ext}`;
    const { error: upErr } = await supabase.storage.from(ARCHIVE_BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || undefined,
    });
    if (upErr) {
        console.error('[archive] upload mislukt:', upErr);
        return null;
    }
    const { data } = supabase.storage.from(ARCHIVE_BUCKET).getPublicUrl(path);
    return data.publicUrl || null;
}

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
    // Bulk/staffelkorting: prijs_normaal is de single-unit prijs, prijs_per_eenheid is de toegepaste prijs (bulk/actie)
    prijs_normaal?: number | null;
    korting_type?: 'bulk' | 'actie' | 'staffel' | null;
    korting_bedrag?: number | null;
};

function FolderInvoices() {
    const { data: invoices, insert, update, remove, refetch } = useSupabase<any>('supplier_invoices', []);
    const { data: inventoryData } = useSupabase<any>('inventory', []);
    const { data: supplierPricesData } = useSupabase<any>('supplier_prices', []);
    const showToast = useToast();
    const showConfirm = useConfirm();
    const [scanStep, setScanStep] = useState<'idle' | 'prep' | 'upload' | 'ai' | 'done' | 'error'>('idle');
    const [aiModel, setAiModel] = useState<'haiku' | 'sonnet' | 'opus'>(typeof window !== 'undefined' ? (localStorage.getItem('pi_ai_model') as any) || 'haiku' : 'haiku');
    useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('pi_ai_model', aiModel); }, [aiModel]);
    const [parsedInvoice, setParsedInvoice] = useState<ParsedInvoice | null>(null);
    const [scanPreview, setScanPreview] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [lastFile, setLastFile] = useState<File | null>(null);
    const [uploadQueue, setUploadQueue] = useState<File[]>([]);
    const [queueTotal, setQueueTotal] = useState(0);
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
            setScanPreview(doc.base64);
            setScanStep('upload');
            const payload: any = { type: 'invoice', model: aiModel };
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
            setParsedInvoice(normalizeParsedInvoice(body.data) as ParsedInvoice);
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
            // Archiveer originele bestand in Supabase Storage — gegroepeerd per leverancier
            let fileUrl: string | null = null;
            if (lastFile) {
                fileUrl = await uploadDocumentToArchive(lastFile, 'invoice', {
                    supplier: header.leverancier || 'Onbekend',
                    datum: header.datum,
                    factuurnummer: header.factuurnummer,
                });
            }
            await insert({
                leverancier: header.leverancier || 'Onbekend',
                factuurnummer: header.factuurnummer || null,
                datum: header.datum || null,
                totaal_excl: header.totaal_excl || 0,
                totaal_btw: header.totaal_btw || 0,
                totaal_incl: header.totaal_incl || 0,
                valuta: header.valuta || 'EUR',
                status: 'review',
                file_url: fileUrl,
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
            return <EditInvoiceWrapper
                existing={existing}
                previewUrl={existing.file_url || null}
                onDone={() => { setEditingId(null); refetch(); }}
                onSaveInvoice={async (edited) => {
                    const { regels = [], ...header } = edited;
                    await update(editingId, {
                        leverancier: header.leverancier || 'Onbekend',
                        factuurnummer: header.factuurnummer || null,
                        datum: header.datum || null,
                        totaal_excl: header.totaal_excl || 0,
                        totaal_btw: header.totaal_btw || 0,
                        totaal_incl: header.totaal_incl || 0,
                        raw_ai_response: { ...edited, regels },
                    } as any);
                    showToast('Factuur bijgewerkt', 'success');
                }}
                inventory={inventoryData}
                supplierPrices={supplierPricesData}
                existingInvoices={invoices}
            />;
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <SectionExplain>
                <strong style={{ color: 'var(--text)' }}>Zo werkt AI factuur lezen:</strong> upload een PDF of foto van een leverancier-factuur → Claude/Groq AI leest alle regels, totalen en BTW → je controleert → je boekt in. Werkt met Sligro, Hanos, Bidfood, of welke leverancier dan ook.
            </SectionExplain>

            <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
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
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                            Sleep meerdere tegelijk erin — worden sequentieel verwerkt.<br />
                            PDF, JPG of PNG · AI leest binnen 15 seconden per factuur.
                        </div>
                        <ModelToggle value={aiModel} onChange={setAiModel} />
                        <div style={{ height: 10 }} />
                        <div style={{ fontSize: 11, color: GOLD, marginBottom: 18, fontWeight: 500 }}>
                            💡 Tip: houd <kbd style={{ padding: '1px 6px', border: `1px solid ${GOLD}4D`, borderRadius: 4, background: `${GOLD}18`, fontFamily: 'monospace', fontSize: 10 }}>⌘</kbd> of <kbd style={{ padding: '1px 6px', border: `1px solid ${GOLD}4D`, borderRadius: 4, background: `${GOLD}18`, fontFamily: 'monospace', fontSize: 10 }}>Shift</kbd> ingedrukt in Finder om meerdere facturen tegelijk te selecteren
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <BtnPrimary icon={FolderOpen} onClick={() => fileRef.current?.click()}>Selecteer facturen</BtnPrimary>
                            <BtnGhost icon={Camera} onClick={() => cameraRef.current?.click()}>Foto maken</BtnGhost>
                        </div>
                        <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple style={{ display: 'none' }}
                            onChange={e => {
                                if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
                                e.target.value = '';
                            }} />
                        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                            onChange={e => {
                                if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
                                e.target.value = '';
                            }} />
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
                        onEdit={(id) => setEditingId(id)}
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
                    style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--red)', color: 'var(--text)', fontWeight: 700, fontSize: 12, border: 'none', cursor: working ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
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

/** Edit-wrapper: houdt lokale state zodat gebruiker kan editen en on-save persisteert naar DB */
function EditInvoiceWrapper({ existing, previewUrl, onSaveInvoice, onDone, inventory, supplierPrices, existingInvoices }: {
    existing: any;
    previewUrl: string | null;
    onSaveInvoice: (inv: ParsedInvoice) => Promise<void>;
    onDone: () => void;
    inventory?: any[];
    supplierPrices?: any[];
    existingInvoices?: any[];
}) {
    const rawInvoice: any = existing.raw_ai_response || {
        leverancier: existing.leverancier,
        factuurnummer: existing.factuurnummer,
        datum: existing.datum,
        totaal_excl: existing.totaal_excl,
        totaal_btw: existing.totaal_btw,
        totaal_incl: existing.totaal_incl,
        regels: [],
    };
    const [inv, setInv] = useState<ParsedInvoice>(normalizeParsedInvoice(rawInvoice));
    return (
        <InvoiceReview
            invoice={inv}
            setInvoice={setInv}
            preview={previewUrl}
            existingInvoices={existingInvoices}
            inventory={inventory}
            supplierPrices={supplierPrices}
            editingId={existing.id}
            onSave={async () => { await onSaveInvoice(inv); onDone(); }}
            onCancel={onDone}
        />
    );
}

function InvoiceListTable({ invoices, onEdit, onDelete }: { invoices: any[]; onEdit: (id: number) => void; onDelete: (id: number) => void }) {
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
                                <div style={{ display: 'inline-flex', gap: 2 }}>
                                    <button onClick={() => onEdit(inv.id)} style={{ background: 'transparent', border: 'none', color: GOLD, cursor: 'pointer', padding: 4 }} title="Openen / bewerken">
                                        <Edit3 size={14} />
                                    </button>
                                    {inv.file_url && (
                                        <a href={inv.file_url} target="_blank" rel="noopener noreferrer"
                                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 4, color: GOLD, textDecoration: 'none' }} title="Bekijk origineel bestand">
                                            <ExternalLink size={14} />
                                        </a>
                                    )}
                                    <button onClick={() => onDelete(inv.id)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }} title="Verwijderen">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

function InvoiceReview({ invoice, setInvoice, preview, existingInvoices, inventory, supplierPrices, editingId, onSave, onCancel }: {
    invoice: ParsedInvoice; setInvoice: (i: ParsedInvoice) => void; preview: string | null;
    existingInvoices?: any[];
    inventory?: any[];
    supplierPrices?: any[];
    editingId?: number;
    onSave: () => void | Promise<void>; onCancel: () => void;
}) {
    const [saving, setSaving] = useState(false);

    // BTW auto-repair: als er regels zijn met codes (1/2) ipv percentages (9/21),
    // zet ze om ZODRA de data binnenkomt (via setInvoice in parent). Draait altijd,
    // niet alleen op mount, zodat HMR/late-arriving data óók wordt gerepareerd.
    useEffect(() => {
        const regels = invoice.regels || [];
        let needsFix = false;
        const fixed = regels.map(r => {
            const n = parseFloat(String(r.btw_pct));
            if (!isNaN(n) && n > 0 && n < 5) {
                needsFix = true;
                if (n === 1) return { ...r, btw_pct: 9 };
                return { ...r, btw_pct: 21 };
            }
            return r;
        });
        if (needsFix) {
            setInvoice({ ...invoice, regels: fixed });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [invoice.regels]);

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
        // Bij mixed-rate facturen (voedsel + non-food) is de blended rate tussen 9-21% — dat is normaal
        if (excl > 0 && btw > 0) {
            const pct = (btw / excl) * 100;
            const regels = invoice.regels || [];
            const uniqueRates = Array.from(new Set(regels.map(r => Math.round(parseFloat(String(r.btw_pct)) || 0)).filter(n => n > 0)));
            const allValidRates = uniqueRates.length > 0 && uniqueRates.every(r => r === 9 || r === 21 || r === 0);
            const isMixed = uniqueRates.includes(9) && uniqueRates.includes(21);

            if (pct > 8 && pct < 10) {
                checks.push({ id: 'btw', status: 'ok', label: 'BTW ≈ 9% (laag tarief)', detail: 'Voedsel, groente, fruit' });
            } else if (pct > 20 && pct < 22) {
                checks.push({ id: 'btw', status: 'ok', label: 'BTW ≈ 21% (standaard)', detail: 'Niet-food / dranken / verpakking' });
            } else if (isMixed && pct > 8 && pct < 22) {
                checks.push({ id: 'btw', status: 'ok', label: `BTW ${pct.toFixed(1)}% — mix van 9% en 21%`, detail: 'Gewogen gemiddelde van voedsel en non-food regels' });
            } else if (allValidRates && uniqueRates.length === 1) {
                // Alle regels hebben zelfde tarief maar blended klopt niet met totalen — mogelijk rondafwijking
                const onlyRate = uniqueRates[0];
                checks.push({ id: 'btw', status: 'warn', label: `BTW ${pct.toFixed(1)}% wijkt af van verwachte ${onlyRate}%`, detail: 'Check totaal BTW of regel-subtotalen' });
            } else {
                checks.push({ id: 'btw', status: 'warn', label: `BTW ${pct.toFixed(1)}% is ongebruikelijk`, detail: 'NL kent alleen 9% en 21% normaal' });
            }
        }

        // Check 4: dubbele factuur (fuzzy matching) — skip de huidig-bewerkte factuur zelf
        if (existingInvoices && existingInvoices.length > 0) {
            const others = editingId ? existingInvoices.filter((e: any) => e.id !== editingId) : existingInvoices;
            const dupes = detectDuplicates(invoice, others);
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
        // BTW auto-normalize: Nederlandse facturen gebruiken soms codes (1=9%, 2=21%)
        if (key === 'btw_pct') {
            const n = parseFloat(String(val));
            if (!isNaN(n)) {
                if (n === 1) val = 9;
                else if (n === 2 || n === 3) val = 21;
                else if (n > 0 && n < 5) val = 21;
            }
        }
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

            <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: preview ? '1fr 1.4fr' : '1fr', gap: 16 }}>
                {preview && (
                    <MetalCard>
                        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <FileScan size={14} style={{ color: GOLD }} />
                            <span style={{ fontSize: 13, fontWeight: 600 }}>Gescand document</span>
                            <a href={preview} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto', fontSize: 11, color: GOLD, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <ExternalLink size={11} /> Open in nieuw venster
                            </a>
                        </div>
                        <div style={{ padding: 14, maxHeight: 700, overflow: 'auto' }}>
                            {(preview.includes('.pdf') || preview.startsWith('data:application/pdf')) ? (
                                <iframe src={preview} style={{ width: '100%', height: 640, border: '1px solid var(--border)', borderRadius: 8 }} title="Factuur preview" />
                            ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={preview} alt="Factuur preview" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />
                            )}
                        </div>
                    </MetalCard>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <MetalCard>
                        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>Header</span>
                        </div>
                        <div className="responsive-grid" style={{ padding: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                                            {[
                                                { label: 'Product' },
                                                { label: 'Aantal' },
                                                { label: 'Eenheid' },
                                                { label: 'Normaal €', tip: 'Reguliere stuksprijs zonder bulk-/staffelkorting. Laat leeg als er geen korting is.' },
                                                { label: 'Betaald €', tip: 'Werkelijk betaalde prijs per eenheid (na bulk-/staffelkorting)' },
                                                { label: 'Korting' },
                                                { label: 'BTW %' },
                                                { label: 'Subtotaal €' },
                                                { label: '' },
                                            ].map(h => (
                                                <th key={h.label} title={h.tip} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, cursor: h.tip ? 'help' : 'default' }}>{h.label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(invoice.regels || []).map((r, i) => {
                                            const hasBulk = r.prijs_normaal != null && r.prijs_normaal > 0 && r.prijs_normaal > r.prijs_per_eenheid;
                                            const kortingPct = hasBulk ? Math.round(((r.prijs_normaal! - r.prijs_per_eenheid) / r.prijs_normaal!) * 100) : 0;
                                            return (
                                            <React.Fragment key={i}>
                                                <tr style={{ borderBottom: (inventory || supplierPrices) ? 'none' : '1px solid var(--border)' }}>
                                                    <td style={{ padding: 4 }}><InlineInput value={r.product_naam} onChange={v => updateLine(i, 'product_naam', v)} /></td>
                                                    <td style={{ padding: 4, width: 64 }}><InlineInput value={String(r.hoeveelheid)} onChange={v => updateLine(i, 'hoeveelheid', parseFloat(v) || 0)} type="number" /></td>
                                                    <td style={{ padding: 4, width: 72 }}><InlineInput value={r.eenheid} onChange={v => updateLine(i, 'eenheid', v)} /></td>
                                                    <td style={{ padding: 4, width: 90 }}>
                                                        <InlineInput prefix="€" value={r.prijs_normaal != null ? String(r.prijs_normaal) : ''} onChange={v => {
                                                            const num = v === '' ? null : parseFloat(v);
                                                            updateLine(i, 'prijs_normaal', num);
                                                            // Auto-set korting_type op basis van normaal vs betaald
                                                            if (num != null && num > r.prijs_per_eenheid) {
                                                                updateLine(i, 'korting_type', r.korting_type || 'bulk');
                                                            } else if (num == null || num <= r.prijs_per_eenheid) {
                                                                updateLine(i, 'korting_type', null);
                                                            }
                                                        }} type="number" />
                                                    </td>
                                                    <td style={{ padding: 4, width: 90 }}><InlineInput prefix="€" value={String(r.prijs_per_eenheid)} onChange={v => updateLine(i, 'prijs_per_eenheid', parseFloat(v) || 0)} type="number" /></td>
                                                    <td style={{ padding: 4, width: 86 }}>
                                                        {hasBulk ? (
                                                            <span title={`${r.korting_type || 'bulk'}-korting — ${fmt2(r.prijs_normaal! - r.prijs_per_eenheid)} per eenheid`}
                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderRadius: 4, background: '#10b98120', color: '#10b981', border: '1px solid #10b98140', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                                <TrendingDown size={10} /> −{kortingPct}%
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: 'var(--muted-light)', fontSize: 10 }}>—</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: 4, width: 82 }}><InlineInput suffix="%" value={String(r.btw_pct)} onChange={v => updateLine(i, 'btw_pct', parseFloat(v) || 0)} type="number" /></td>
                                                    <td style={{ padding: 4, width: 92 }}><InlineInput prefix="€" value={String(r.subtotaal)} onChange={v => updateLine(i, 'subtotaal', parseFloat(v) || 0)} type="number" /></td>
                                                    <td style={{ padding: 4, width: 28 }}>
                                                        <button onClick={() => removeLine(i)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}>
                                                            <X size={12} />
                                                        </button>
                                                    </td>
                                                </tr>
                                                {(inventory || supplierPrices) && (
                                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td colSpan={9} style={{ padding: '0 4px 6px 10px' }}>
                                                            <LineInsights line={r} inventory={inventory || []} supplierPrices={supplierPrices || []} invoices={existingInvoices || []} />
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                            );
                                        })}
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

    // Vergelijk altijd normaal-prijs vs normaal-prijs — zo telt een bulkkorting NIET als prijsdaling
    // Als deze regel bulkkorting heeft, gebruik prijs_normaal als referentie; anders prijs_per_eenheid
    const hasBulk = line.prijs_normaal != null && line.prijs_normaal > 0 && line.prijs_normaal > line.prijs_per_eenheid;
    const referencePrice = hasBulk
        ? parseFloat(String(line.prijs_normaal || 0))
        : parseFloat(String(line.prijs_per_eenheid || 0));
    const currentPrice = referencePrice;
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

            {/* % change vs gemiddelde — altijd op basis van normaalprijs */}
            {pctChange !== null && Math.abs(pctChange) > 3 && (
                <span title={`Normaalprijs vergeleken — was gemiddeld ${fmt2(avgHistory)} over ${historyPrices.length} eerdere facturen${hasBulk ? ' (bulk-/staffelkorting is hierbij buiten beschouwing gelaten)' : ''}`}
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
            {prefix && <span style={{ position: 'absolute', left: 7, color: 'var(--muted)', fontSize: 11, pointerEvents: 'none', fontWeight: 600, zIndex: 1 }}>{prefix}</span>}
            <input value={value} onChange={e => onChange(e.target.value)} type={type || 'text'}
                className="bbq-inline-input"
                style={{ width: '100%', padding: '6px 8px', paddingLeft: prefix ? 20 : 8, paddingRight: suffix ? 22 : 8, background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, fontVariantNumeric: 'tabular-nums', outline: 'none', MozAppearance: 'textfield' as any }} />
            {suffix && <span style={{ position: 'absolute', right: 7, color: 'var(--muted)', fontSize: 11, pointerEvents: 'none', fontWeight: 600, zIndex: 1 }}>{suffix}</span>}
            <style>{`.bbq-inline-input::-webkit-outer-spin-button,.bbq-inline-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}`}</style>
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
    const { data: invoices, remove: removeInvoice } = useSupabase<any>('supplier_invoices', []);
    const showToast = useToast();
    const showConfirm = useConfirm();
    const [scanStep, setScanStep] = useState<'idle' | 'prep' | 'upload' | 'ai' | 'done' | 'error'>('idle');
    const [aiModel, setAiModel] = useState<'haiku' | 'sonnet' | 'opus'>(typeof window !== 'undefined' ? (localStorage.getItem('pi_ai_model') as any) || 'haiku' : 'haiku');
    useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('pi_ai_model', aiModel); }, [aiModel]);
    const [parsed, setParsed] = useState<any | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [lastFile, setLastFile] = useState<File | null>(null);
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
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
            const payload: any = { type: 'receipt', model: aiModel };
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
            setParsed(normalizeParsedInvoice(body.data));
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
        // Archiveer originele foto/bon in Supabase Storage — per winkel
        let fileUrl: string | null = null;
        if (lastFile) {
            fileUrl = await uploadDocumentToArchive(lastFile, 'receipt', {
                supplier: parsed.winkel || 'Onbekend',
                datum: parsed.datum,
                factuurnummer: null,
            });
        }
        await insert({
            winkel: parsed.winkel || 'Onbekend',
            datum: parsed.datum || null,
            totaal_bedrag: parsed.totaal_bedrag || 0,
            btw_pct: parsed.btw_pct || 21,
            categorie: parsed.categorie || null,
            raw_analysis: parsed.regels || [],
            notities: parsed.notities || null,
            status: 'review',
            foto_url: fileUrl,
        } as any);
        showToast('Bon opgeslagen · foto gearchiveerd', 'success');
        setParsed(null); setPreview(null);
        refetch();
    }

    const total = (bonnen || []).reduce((s: number, b: any) => s + (parseFloat(b.totaal_bedrag) || 0), 0);

    if (parsed) {
        return <ReceiptReview parsed={parsed} setParsed={setParsed} preview={preview} onSave={saveReceipt} onCancel={() => { setParsed(null); setPreview(null); }} />;
    }

    const archivedCount = (invoices || []).filter((i: any) => i.file_url).length + (bonnen || []).filter((b: any) => b.foto_url).length;
    const totalFiles = (invoices || []).length + (bonnen || []).length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <SectionExplain>
                <strong style={{ color: 'var(--text)' }}>Jouw bonnenarchief:</strong> elke factuur of kassabon die je uploadt krijgt automatisch een <strong style={{ color: GOLD }}>eigen map per leverancier</strong>. Het originele bestand wordt bewaard, zodat je altijd terug kunt klikken. Scan hier een nieuwe bon, of blader hieronder door je mappen.
            </SectionExplain>

            <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <MiniStat label="Bonnen" value={bonnen.length} icon={Receipt} />
                <MiniStat label="Facturen" value={(invoices || []).length} icon={FileText} />
                <MiniStat label="Gearchiveerd" value={`${archivedCount}/${totalFiles}`} sub="met origineel bestand" icon={Archive} tone={archivedCount > 0 ? 'ok' : undefined} />
                <MiniStat label="Kassabonnen totaal" value={fmt2(total)} icon={Euro} />
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
                        <div style={{ marginBottom: 10 }}><ModelToggle value={aiModel} onChange={setAiModel} /></div>
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

            <SupplierFolderTree
                invoices={invoices || []}
                bonnen={bonnen || []}
                expanded={expandedFolders}
                onToggle={(k) => setExpandedFolders(prev => ({ ...prev, [k]: !prev[k] }))}
                onDeleteReceipt={(id) => showConfirm('Bon verwijderen?', () => remove(id).then(() => showToast('Verwijderd', 'success')))}
                onDeleteInvoice={(id) => showConfirm('Factuur verwijderen?', () => removeInvoice(id).then(() => showToast('Verwijderd', 'success')))}
            />
        </div>
    );
}

/** Mappen-view: alle gearchiveerde bestanden (facturen + bonnen) gegroepeerd per leverancier/winkel */
function SupplierFolderTree({ invoices, bonnen, expanded, onToggle, onDeleteReceipt, onDeleteInvoice }: {
    invoices: any[];
    bonnen: any[];
    expanded: Record<string, boolean>;
    onToggle: (key: string) => void;
    onDeleteReceipt: (id: number) => void;
    onDeleteInvoice: (id: number) => void;
}) {
    type FileEntry = {
        type: 'invoice' | 'receipt';
        id: number;
        name: string;
        date: string | null;
        url: string | null;
        total: number;
        rows: number;
        categorie?: string;
    };

    const folders = useMemo(() => {
        const m: Record<string, FileEntry[]> = {};
        invoices.forEach((inv) => {
            const key = inv.leverancier || 'Onbekend';
            if (!m[key]) m[key] = [];
            m[key].push({
                type: 'invoice',
                id: inv.id,
                name: inv.factuurnummer || `Factuur ${inv.id}`,
                date: inv.datum,
                url: inv.file_url || null,
                total: parseFloat(inv.totaal_incl) || 0,
                rows: Array.isArray(inv.raw_ai_response?.regels) ? inv.raw_ai_response.regels.length : 0,
            });
        });
        bonnen.forEach((b) => {
            const key = b.winkel || 'Onbekend';
            if (!m[key]) m[key] = [];
            m[key].push({
                type: 'receipt',
                id: b.id,
                name: `Bon · ${b.datum || b.created_at?.slice(0, 10) || b.id}`,
                date: b.datum,
                url: b.foto_url || null,
                total: parseFloat(b.totaal_bedrag) || 0,
                rows: Array.isArray(b.raw_analysis) ? b.raw_analysis.length : 0,
                categorie: b.categorie,
            });
        });
        return Object.entries(m).map(([name, files]) => ({
            name,
            files: files.sort((a, b) => {
                if (!a.date) return 1;
                if (!b.date) return -1;
                return b.date.localeCompare(a.date);
            }),
            total: files.reduce((s, f) => s + f.total, 0),
            count: files.length,
        })).sort((a, b) => b.total - a.total);
    }, [invoices, bonnen]);

    if (folders.length === 0) {
        return (
            <MetalCard>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FolderOpen size={14} style={{ color: GOLD }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Mappen per leverancier</span>
                </div>
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    Nog geen bestanden. Upload een factuur of bon — er wordt automatisch een map aangemaakt per leverancier.
                </div>
            </MetalCard>
        );
    }

    return (
        <MetalCard>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <FolderOpen size={14} style={{ color: GOLD }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Mappen per leverancier</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {folders.length} leverancier{folders.length === 1 ? '' : 's'} · {folders.reduce((s, f) => s + f.count, 0)} bestand{folders.reduce((s, f) => s + f.count, 0) === 1 ? '' : 'en'}</span>
            </div>
            <div>
                {folders.map((folder, idx) => {
                    const isExpanded = expanded[folder.name] ?? idx < 3; // default: eerste 3 open
                    return (
                        <div key={folder.name} style={{ borderBottom: idx < folders.length - 1 ? '1px solid var(--border)' : 'none' }}>
                            <button
                                onClick={() => onToggle(folder.name)}
                                style={{
                                    width: '100%', padding: '12px 18px', background: 'transparent', border: 'none',
                                    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: 'var(--text)',
                                    fontSize: 13, textAlign: 'left',
                                }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s', color: GOLD }}>▶</span>
                                <FolderOpen size={14} style={{ color: isExpanded ? GOLD : 'var(--muted)' }} />
                                <span style={{ fontWeight: 600, flex: 1 }}>{folder.name}</span>
                                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{folder.count} bestand{folder.count === 1 ? '' : 'en'}</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: GOLD, fontVariantNumeric: 'tabular-nums', minWidth: 70, textAlign: 'right' }}>{fmt2(folder.total)}</span>
                            </button>
                            {isExpanded && (
                                <div style={{ padding: '4px 14px 14px 50px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                                    {folder.files.map((f) => (
                                        <div key={`${f.type}-${f.id}`} style={{
                                            padding: 10, borderRadius: 8, border: '1px solid var(--border)',
                                            background: 'var(--color-bg-deep)',
                                            display: 'flex', flexDirection: 'column', gap: 4, position: 'relative',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {f.type === 'invoice' ? <FileText size={12} style={{ color: GOLD }} /> : <Receipt size={12} style={{ color: GOLD }} />}
                                                <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                                                    {f.type === 'invoice' ? 'Factuur' : 'Bon'}
                                                </span>
                                                {f.categorie && <Pill variant="brand">{f.categorie}</Pill>}
                                            </div>
                                            <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>{f.name}</div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                                                <span style={{ color: 'var(--muted)' }}>{f.date || '—'}</span>
                                                <span style={{ fontWeight: 600, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt2(f.total)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                                                {f.url ? (
                                                    <a href={f.url} target="_blank" rel="noopener noreferrer"
                                                        style={{ fontSize: 10, color: GOLD, display: 'inline-flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
                                                        <ExternalLink size={10} /> Open origineel
                                                    </a>
                                                ) : (
                                                    <span style={{ fontSize: 10, color: 'var(--muted-light)' }}>Geen bestand</span>
                                                )}
                                                <button
                                                    onClick={() => f.type === 'invoice' ? onDeleteInvoice(f.id) : onDeleteReceipt(f.id)}
                                                    style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 2, display: 'flex' }}
                                                    title="Verwijderen">
                                                    <Trash2 size={11} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </MetalCard>
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

            <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: preview ? '1fr 1.4fr' : '1fr', gap: 14 }}>
                {preview && (
                    <MetalCard>
                        <div style={{ padding: 14, maxHeight: 600, overflow: 'auto' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={preview} alt="Bon" style={{ width: '100%', borderRadius: 8 }} />
                        </div>
                    </MetalCard>
                )}
                <MetalCard>
                    <div className="responsive-grid" style={{ padding: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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

/** KPI-tegel in design-stijl: eyebrow-label, groot cijfer, sub */
function BoekKPI({ label, value, sub, tone, icon: I }: { label: string; value: string | number; sub?: string; tone?: 'ok' | 'warn' | 'bad'; icon?: any }) {
    const toneColor = tone === 'ok' ? 'var(--green)' : tone === 'bad' ? 'var(--red)' : tone === 'warn' ? 'var(--amber)' : 'var(--text)';
    return (
        <MetalCard>
            <div style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <Eyebrow>{label}</Eyebrow>
                    {I && <I size={14} style={{ color: 'var(--muted-light)' }} />}
                </div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 500, fontSize: 28, fontVariantNumeric: 'tabular-nums', color: toneColor, lineHeight: 1.1 }}>{value}</div>
                {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
            </div>
        </MetalCard>
    );
}

/** Context-banner: "Zo lees je dit overzicht" */
function BoekContextBanner() {
    return (
        <div style={{
            display: 'flex', gap: 10, padding: '10px 14px', borderRadius: 10,
            background: `${GOLD}08`, border: `1px solid ${GOLD}24`,
            fontSize: 12, color: 'var(--muted)', lineHeight: 1.55,
        }}>
            <Info size={13} style={{ color: GOLD, flexShrink: 0, marginTop: 1 }} />
            <span>
                <strong style={{ color: 'var(--text)' }}>Zo lees je dit overzicht:</strong>{' '}
                hover over de donut om een leverancier uit te lichten, klik voor een volledige AI-analyse met top-10 producten, koopmomenten en prijsstijgingen. De AI Tip Bouwer eronder stelt concrete acties voor op basis van je feitelijke inkoop — elke tip heeft een geschatte maandelijkse besparing en een vertrouwensscore.
            </span>
        </div>
    );
}

/** AI Tip Bouwer — 3 data-driven tips uit echte bySupplier-data */
type BookSupplier = { name: string; color: string; spend: number; count: number; products: number; lastDate: string | null; lines: { product: string; prijs: number; eenheid: string }[] };
type AiTip = {
    id: string; supplierName: string; supplierColor: string; action: 'Blijf' | 'Consolideer' | 'Verminder' | 'Benut' | 'Verschuif';
    headline: string; body: string; saving: number; confidence: number;
};

function buildAiTips(bySupplier: BookSupplier[], invoices: any[]): AiTip[] {
    const tips: AiTip[] = [];
    const active = bySupplier.filter(s => s.spend > 0).sort((a, b) => b.spend - a.spend);
    if (active.length === 0) return tips;

    // Tip 1: Consolideer bij de grootste leverancier (mits ≥ 30% aandeel)
    const top = active[0];
    const totalSpend = active.reduce((s, x) => s + x.spend, 0);
    const topShare = totalSpend > 0 ? (top.spend / totalSpend) : 0;
    if (topShare >= 0.25 && top.count >= 3) {
        tips.push({
            id: 't1', supplierName: top.name, supplierColor: top.color,
            action: topShare >= 0.4 ? 'Blijf' : 'Consolideer',
            headline: `${topShare >= 0.4 ? 'Houd' : 'Versterk'} ${top.name} als ruggengraat`,
            body: `${top.name} is je grootste leverancier met ${(topShare * 100).toFixed(0)}% aandeel (${top.count} facturen). Bundel losse orders hier voor leveringsvoordeel en betere marge-impact.`,
            saving: Math.round(top.spend * 0.035),
            confidence: Math.min(95, 70 + Math.round(top.count * 2)),
        });
    }

    // Tip 2: Verminder losse bonnen/runs bij leverancier met veel kleine facturen
    const smallRunner = active.find(s => s.count >= 10 && (s.spend / s.count) < 120 && s.name !== top.name);
    if (smallRunner) {
        const avg = smallRunner.spend / smallRunner.count;
        tips.push({
            id: 't2', supplierName: smallRunner.name, supplierColor: '#ef4444',
            action: 'Verminder',
            headline: `Je doet te veel ${smallRunner.name}-runs`,
            body: `${smallRunner.count} facturen met gemiddeld €${avg.toFixed(0)} per ritje. Consolideer wekelijks en gebruik ${smallRunner.name} alléén voor last-minute of unieke items.`,
            saving: Math.round(smallRunner.count * 4),
            confidence: Math.min(92, 65 + Math.round(smallRunner.count * 1.5)),
        });
    }

    // Tip 3: Prijsverschil tussen leveranciers — zelfde product, goedkoper elders
    const productMap: Record<string, { naam: string; perSup: Record<string, number[]> }> = {};
    (invoices || []).forEach((inv: any) => {
        const regels = inv.raw_ai_response?.regels || [];
        regels.forEach((r: any) => {
            const k = (r.product_naam || '').toLowerCase().trim();
            if (!k) return;
            if (!productMap[k]) productMap[k] = { naam: r.product_naam, perSup: {} };
            const p = r.prijs_normaal != null && r.prijs_normaal > 0 ? parseFloat(r.prijs_normaal) : parseFloat(r.prijs_per_eenheid) || 0;
            const sup = inv.leverancier || 'Onbekend';
            if (p > 0) {
                if (!productMap[k].perSup[sup]) productMap[k].perSup[sup] = [];
                productMap[k].perSup[sup].push(p);
            }
        });
    });
    const savings: { product: string; cheap: string; cheapPrice: number; expensive: string; expPrice: number; diff: number }[] = [];
    Object.values(productMap).forEach(p => {
        const sups = Object.entries(p.perSup).filter(([, arr]) => arr.length > 0);
        if (sups.length < 2) return;
        const avg = sups.map(([n, arr]) => ({ n, v: arr.reduce((a, b) => a + b, 0) / arr.length }));
        avg.sort((a, b) => a.v - b.v);
        const diff = avg[avg.length - 1].v - avg[0].v;
        if (diff / avg[avg.length - 1].v > 0.08) {
            savings.push({ product: p.naam, cheap: avg[0].n, cheapPrice: avg[0].v, expensive: avg[avg.length - 1].n, expPrice: avg[avg.length - 1].v, diff });
        }
    });
    savings.sort((a, b) => (b.diff / b.expPrice) - (a.diff / a.expPrice));
    if (savings.length > 0) {
        const s = savings[0];
        const cheapSup = bySupplier.find(x => x.name === s.cheap);
        tips.push({
            id: 't3', supplierName: s.cheap, supplierColor: cheapSup?.color || GOLD,
            action: 'Verschuif',
            headline: `${s.product.length > 36 ? s.product.slice(0, 36) + '…' : s.product} bij ${s.cheap}`,
            body: `Zelfde product is bij ${s.cheap} €${s.cheapPrice.toFixed(2)} vs €${s.expPrice.toFixed(2)} bij ${s.expensive} — ${((s.diff / s.expPrice) * 100).toFixed(0)}% goedkoper.`,
            saving: Math.round(s.diff * 10),
            confidence: 78 + Math.min(15, savings.length * 2),
        });
    }

    return tips.slice(0, 3);
}

function AiTipBuilder({ tips, onOpenSupplier }: { tips: AiTip[]; onOpenSupplier: (name: string) => void }) {
    const total = tips.reduce((s, t) => s + t.saving, 0);
    return (
        <MetalCard>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: `${GOLD}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Sparkles size={17} style={{ color: GOLD }} />
                    </div>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>AI Tip Bouwer</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Waar koop je wat · op basis van je eigen factuur-data</div>
                    </div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{tips.length} actie{tips.length === 1 ? '' : 's'}</span>
            </div>
            {tips.length === 0 ? (
                <div style={{ padding: 28, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    Nog te weinig data voor tips. Scan een paar facturen van verschillende leveranciers.
                </div>
            ) : (
                <div className="responsive-grid" style={{ padding: 16, display: 'grid', gridTemplateColumns: `repeat(${Math.min(tips.length, 3)}, 1fr)`, gap: 12 }}>
                    {tips.map((t, idx) => (
                        <div key={t.id} style={{
                            padding: 16, borderRadius: 12, border: '1px solid var(--border)',
                            background: 'linear-gradient(180deg, rgba(30,30,34,.6), rgba(20,20,22,.4))',
                            position: 'relative', overflow: 'hidden', animation: `fadeInUp .4s ease both ${idx * 80}ms`,
                        }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: t.supplierColor, opacity: 0.75 }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                <div style={{
                                    padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                                    background: `${t.supplierColor}22`, color: t.supplierColor, letterSpacing: '.05em',
                                }}>{t.action.toUpperCase()} · {t.supplierName}</div>
                                <span style={{ fontSize: 10, color: 'var(--muted-light)', fontFamily: 'var(--font-mono)' }}>
                                    <Hint tip="Hoe zeker is de AI dat deze tip klopt, op basis van hoeveel factuur-data er beschikbaar is. Boven 85% = sterk onderbouwd; onder 70% = hypothese, verifieer eerst.">{t.confidence}%</Hint>
                                </span>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, marginBottom: 8 }}>{t.headline}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 12 }}>{t.body}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: 15, color: t.action === 'Verminder' ? 'var(--green)' : GOLD }} className="tabular">
                                    +€ {t.saving.toLocaleString('nl-NL')}/mnd
                                </div>
                                <button onClick={() => onOpenSupplier(t.supplierName)} style={{
                                    background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer',
                                    fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, padding: 0, fontFamily: 'inherit',
                                }}>Bekijk <ArrowUpRight size={11} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {tips.length > 0 && (
                <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', background: 'var(--color-bg-deep)', fontSize: 11, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>
                        <Info size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        Totale potentiële marge-winst:{' '}
                        <Hint tip="Som van alle acties hierboven. Dit is een schatting van het maandelijkse effect als je alle tips opvolgt. We herberekenen automatisch zodra er nieuwe facturen binnenkomen.">
                            <strong style={{ color: GOLD }}>€ {total.toLocaleString('nl-NL')}/maand</strong>
                        </Hint>
                    </span>
                    <span>Gebaseerd op {invoiceCountLabel(tips)}</span>
                </div>
            )}
        </MetalCard>
    );
}

function invoiceCountLabel(tips: AiTip[]): string {
    return `${tips.length} leverancier${tips.length === 1 ? '' : 's'}`;
}

/** Prijsontwikkeling per categorie — 3 maand vs daarvoor, uit echte factuur-regels */
function CategoryPriceGrid({ invoices }: { invoices: any[] }) {
    const rows = useMemo(() => {
        const cats: Record<string, { recent: number[]; older: number[]; spend: number }> = {};
        const now = Date.now();
        const THREE_MONTHS = 90 * 24 * 3600 * 1000;
        (invoices || []).forEach((inv: any) => {
            const regels = inv.raw_ai_response?.regels || [];
            const datumStr = inv.datum;
            const dt = datumStr ? new Date(datumStr).getTime() : NaN;
            regels.forEach((r: any) => {
                const cat = r.categorie || 'Overig';
                const p = r.prijs_normaal != null && r.prijs_normaal > 0 ? parseFloat(r.prijs_normaal) : parseFloat(r.prijs_per_eenheid) || 0;
                const sub = parseFloat(r.subtotaal) || 0;
                if (!cats[cat]) cats[cat] = { recent: [], older: [], spend: 0 };
                cats[cat].spend += sub;
                if (p > 0 && !isNaN(dt)) {
                    if (now - dt <= THREE_MONTHS) cats[cat].recent.push(p);
                    else cats[cat].older.push(p);
                }
            });
        });
        const out: { cat: string; delta: number; spend: number }[] = [];
        Object.entries(cats).forEach(([cat, d]) => {
            if (d.recent.length === 0 || d.older.length === 0) {
                out.push({ cat, delta: 0, spend: d.spend });
                return;
            }
            const avgR = d.recent.reduce((s, v) => s + v, 0) / d.recent.length;
            const avgO = d.older.reduce((s, v) => s + v, 0) / d.older.length;
            const delta = avgO > 0 ? ((avgR - avgO) / avgO) * 100 : 0;
            out.push({ cat, delta, spend: d.spend });
        });
        return out.sort((a, b) => b.spend - a.spend).slice(0, 10);
    }, [invoices]);

    if (rows.length === 0) {
        return (
            <MetalCard>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <BarChart3 size={14} style={{ color: GOLD }} />
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Prijsontwikkeling per categorie</span>
                </div>
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                    Nog geen categorie-data. Scan een paar facturen met regels.
                </div>
            </MetalCard>
        );
    }

    const max = Math.max(...rows.map(r => Math.abs(r.delta)), 1);
    return (
        <MetalCard>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <BarChart3 size={14} style={{ color: GOLD }} />
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Prijsontwikkeling per categorie</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>laatste 3 mnd vs daarvoor</span>
            </div>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                {rows.map((r, i) => {
                    const up = r.delta > 0, flat = Math.abs(r.delta) < 0.5;
                    const color = flat ? 'var(--muted)' : up ? 'var(--red)' : 'var(--green)';
                    const intensity = Math.min(1, Math.abs(r.delta) / max);
                    return (
                        <div key={i} style={{
                            padding: 12, borderRadius: 10,
                            background: `linear-gradient(180deg, ${up ? 'rgba(239,68,68,' : 'rgba(34,197,94,'}${0.02 + intensity * 0.08}) 0%, transparent 100%)`,
                            border: '1px solid var(--border)', transition: 'transform .15s',
                        }}>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.cat}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                <div>
                                    <div className="tabular" style={{ fontSize: 15, fontWeight: 600, color, fontFamily: 'Outfit, sans-serif' }}>
                                        {flat ? '±0.0%' : `${r.delta > 0 ? '+' : ''}${r.delta.toFixed(1)}%`}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>€{Math.round(r.spend).toLocaleString('nl-NL')}</div>
                                </div>
                                <div style={{ width: 3, height: `${14 + intensity * 30}px`, background: color, borderRadius: 2, opacity: 0.6 }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </MetalCard>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   FOLDER: PRIJSLIJST BULK-UPLOAD
   60+ PDF's slepen → parallel parsen → supplier_prices vullen
   GEEN voorraad, alleen product+prijs+eenheid+categorie
   ═══════════════════════════════════════════════════════════════════ */

type BulkFileStatus = 'pending' | 'processing' | 'done' | 'error';
interface BulkFile {
    id: string;
    file: File;
    status: BulkFileStatus;
    producten: number;
    leverancier?: string;
    error?: string;
}

const MAX_CONCURRENT = 3;
const BATCH_SIZE = 30;          /* PDFs per batch — voorkom RAM-issues bij 60+ uploads */
const BATCH_PAUSE_MS = 1000;    /* Korte pauze tussen batches voor rate-limit safety */

/* Bibliotheek-samenvatting per leverancier */
type LibStat = {
    leverancier: string;
    total: number;
    laatsteDatum: string;
    eersteDatum: string;
    categorieen: string[];
    updateCount: number;
};

function PricelistLibrary({ refreshKey, orgId }: { refreshKey: number; orgId: string | null }) {
    const [stats, setStats] = useState<LibStat[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!orgId) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            /* Aggregatie per leverancier */
            const { data } = await supabase
                .from('supplier_prices')
                .select('leverancier, datum, categorie')
                .eq('organization_id', orgId);
            if (cancelled) return;
            if (!data) { setStats([]); setLoading(false); return; }
            const byLev: Record<string, { total: number; datums: Set<string>; cats: Set<string> }> = {};
            for (const row of data as any[]) {
                const lev = row.leverancier || 'Onbekend';
                if (!byLev[lev]) byLev[lev] = { total: 0, datums: new Set(), cats: new Set() };
                byLev[lev].total++;
                if (row.datum) byLev[lev].datums.add(row.datum);
                if (row.categorie) byLev[lev].cats.add(row.categorie);
            }
            const arr: LibStat[] = Object.entries(byLev).map(([lev, s]) => {
                const sorted = Array.from(s.datums).sort();
                return {
                    leverancier: lev,
                    total: s.total,
                    laatsteDatum: sorted[sorted.length - 1] || '',
                    eersteDatum: sorted[0] || '',
                    categorieen: Array.from(s.cats).slice(0, 6),
                    updateCount: sorted.length,
                };
            }).sort((a, b) => (b.laatsteDatum || '').localeCompare(a.laatsteDatum || ''));
            setStats(arr);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [orgId, refreshKey]);

    function formatDateShort(iso: string): string {
        if (!iso) return '—';
        const d = new Date(iso + 'T12:00:00');
        if (isNaN(d.getTime())) return iso;
        const now = Date.now();
        const days = Math.floor((now - d.getTime()) / 86400000);
        if (days === 0) return 'Vandaag';
        if (days === 1) return 'Gisteren';
        if (days < 7) return days + ' dagen geleden';
        if (days < 30) return Math.floor(days / 7) + ' wk geleden';
        return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function freshnessColor(iso: string): string {
        if (!iso) return 'var(--muted)';
        const days = Math.floor((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 86400000);
        if (days <= 7) return 'var(--green)';
        if (days <= 30) return GOLD;
        return 'var(--amber)';
    }

    if (loading) return null;
    if (stats.length === 0) return null;

    const totalProducts = stats.reduce((s, x) => s + x.total, 0);

    return (
        <MetalCard>
            <div style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <Eyebrow>📚 Prijsbibliotheek</Eyebrow>
                        <div style={{ fontFamily: 'Outfit, DM Sans, sans-serif', fontSize: 24, fontWeight: 300, marginTop: 4, color: 'var(--text)' }}>
                            <span style={{ color: GOLD, fontWeight: 500 }}>{totalProducts.toLocaleString('nl-NL')}</span> productprijzen
                            <span style={{ color: 'var(--muted)', fontSize: 14, fontWeight: 400, marginLeft: 10 }}>
                                van {stats.length} leverancier{stats.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                    {stats.map(s => (
                        <div key={s.leverancier}
                            style={{
                                padding: 14,
                                borderRadius: 10,
                                background: 'var(--color-bg-deep)',
                                border: `1px solid ${freshnessColor(s.laatsteDatum)}20`,
                                position: 'relative',
                                overflow: 'hidden',
                            }}>
                            {/* Freshness dot + indicator strip links */}
                            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: freshnessColor(s.laatsteDatum) }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {s.leverancier}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                        {s.updateCount} {s.updateCount === 1 ? 'upload' : 'uploads'}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 20, fontWeight: 400, color: GOLD, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                                        {s.total.toLocaleString('nl-NL')}
                                    </div>
                                    <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginTop: 2 }}>
                                        producten
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid rgba(130,130,130,.08)', fontSize: 11 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: freshnessColor(s.laatsteDatum) }} />
                                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>{formatDateShort(s.laatsteDatum)}</span>
                                </div>
                                <span style={{ color: 'var(--muted-light)', fontSize: 10 }}>laatst bijgewerkt</span>
                            </div>
                            {s.categorieen.length > 0 && (
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                                    {s.categorieen.slice(0, 4).map(c => (
                                        <span key={c} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(130,130,130,.08)', color: 'var(--muted-light)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>
                                            {c}
                                        </span>
                                    ))}
                                    {s.categorieen.length > 4 && <span style={{ fontSize: 9, color: 'var(--muted)' }}>+{s.categorieen.length - 4}</span>}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                <div style={{ marginTop: 12, fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} /> vers (&lt;7d)</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD }} /> redelijk (&lt;30d)</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)' }} /> verouderd (&gt;30d)</span>
                </div>
            </div>
        </MetalCard>
    );
}

function FolderPricelists() {
    const [files, setFiles] = useState<BulkFile[]>([]);
    const [working, setWorking] = useState(false);
    const [overrideSupplier, setOverrideSupplier] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const [savedCount, setSavedCount] = useState(0);
    const [libRefreshKey, setLibRefreshKey] = useState(0);
    const [batchInfo, setBatchInfo] = useState<{ current: number; total: number; batchSize: number } | null>(null);
    const { orgId } = useOrg();

    const totalProducten = files.reduce((s, f) => s + f.producten, 0);
    const doneCount = files.filter(f => f.status === 'done').length;
    const errorCount = files.filter(f => f.status === 'error').length;
    const allFinished = files.length > 0 && files.every(f => f.status === 'done' || f.status === 'error');

    function addFiles(newFiles: FileList | File[]) {
        const arr: BulkFile[] = Array.from(newFiles)
            .filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
            .map(f => ({ id: `${f.name}_${f.size}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, file: f, status: 'pending', producten: 0 }));
        setFiles(prev => [...prev, ...arr]);
    }

    async function parseOne(bf: BulkFile): Promise<{ ok: boolean; leverancier?: string; producten: any[]; error?: string }> {
        try {
            /* 1) Probeer client-side tekst-extractie (geen page-limit, 5x goedkoper) */
            const extractedText = await extractPdfText(bf.file);
            const useText = isUsableText(extractedText);

            let body: any = null;

            if (useText) {
                /* TEXT-MODE: stuur alleen de tekst. Kleine body, geen vision-tokens.
                   Werkt voor text-based PDFs ongeacht aantal pagina's. */
                const res = await fetch('/api/parse-pricelist', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ textContent: extractedText, model: 'haiku' }),
                });
                try { body = await res.json(); } catch { /* non-JSON */ }
                if (!res.ok || !body?.success) {
                    return { ok: false, producten: [], error: body?.error || `HTTP ${res.status}` };
                }
            } else {
                /* VISION FALLBACK voor ingescande/image-based PDFs.
                   Eerst upload naar Supabase storage (body-size omzeilen) → URL naar API. */
                const safeName = bf.file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
                const path = `${orgId || 'public'}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
                const { error: upErr } = await supabase.storage.from('pricelists').upload(path, bf.file, {
                    contentType: 'application/pdf',
                    upsert: false,
                });
                if (upErr) return { ok: false, producten: [], error: 'Upload: ' + upErr.message };
                const { data: urlData } = supabase.storage.from('pricelists').getPublicUrl(path);
                const pdfUrl = urlData?.publicUrl;
                if (!pdfUrl) return { ok: false, producten: [], error: 'Geen public URL' };

                const res = await fetch('/api/parse-pricelist', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pdfUrl, model: 'haiku' }),
                });
                try { body = await res.json(); } catch { /* non-JSON */ }
                if (!res.ok || !body?.success) {
                    return { ok: false, producten: [], error: body?.error || `HTTP ${res.status}` };
                }
            }

            const prods = body.data?.producten || [];
            return { ok: true, leverancier: body.data?.leverancier, producten: prods };
        } catch (e: any) {
            return { ok: false, producten: [], error: e?.message || 'Fout' };
        }
    }

    async function processQueue() {
        setWorking(true);
        setSavedCount(0);
        const queue = [...files.filter(f => f.status === 'pending')];
        let saved = 0;

        async function runOne(bf: BulkFile) {
            setFiles(prev => prev.map(f => f.id === bf.id ? { ...f, status: 'processing' } : f));
            const res = await parseOne(bf);
            if (!res.ok) {
                setFiles(prev => prev.map(f => f.id === bf.id ? { ...f, status: 'error', error: res.error } : f));
                return;
            }
            const leverancier = (overrideSupplier || res.leverancier || 'Onbekend').trim();
            const datum = new Date().toISOString().slice(0, 10);
            const rows = res.producten
                .filter(p => p && p.product_naam && typeof p.prijs === 'number')
                .map((p: any) => ({
                    organization_id: orgId,
                    leverancier,
                    product_naam: String(p.product_naam).trim(),
                    prijs: Number(p.prijs),
                    eenheid: String(p.eenheid || 'stuks').trim(),
                    categorie: p.categorie ? String(p.categorie).trim() : null,
                    datum,
                }));
            if (rows.length > 0) {
                const { error: insErr } = await supabase.from('supplier_prices').insert(rows);
                if (insErr) {
                    setFiles(prev => prev.map(f => f.id === bf.id ? { ...f, status: 'error', error: 'DB: ' + insErr.message, leverancier, producten: rows.length } : f));
                    return;
                }
                saved += rows.length;
                setSavedCount(saved);
                setLibRefreshKey(k => k + 1); /* Trigger library refresh */
            }
            setFiles(prev => prev.map(f => f.id === bf.id ? { ...f, status: 'done', leverancier, producten: rows.length } : f));
        }

        /*
         * BATCH-VERWERKING: splits queue in chunks van BATCH_SIZE.
         * Binnen een batch: MAX_CONCURRENT parallel.
         * Tussen batches: korte pauze zodat browser RAM vrijkomt en
         * eventuele rate-limits niet opstapelen.
         */
        const totalBatches = Math.ceil(queue.length / BATCH_SIZE);
        for (let b = 0; b < totalBatches; b++) {
            const batch = queue.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
            setBatchInfo({ current: b + 1, total: totalBatches, batchSize: batch.length });

            /* Concurrency pool binnen de batch */
            const runners: Promise<void>[] = [];
            let idx = 0;
            async function worker() {
                while (idx < batch.length) {
                    const i = idx++;
                    await runOne(batch[i]);
                }
            }
            for (let i = 0; i < Math.min(MAX_CONCURRENT, batch.length); i++) runners.push(worker());
            await Promise.all(runners);

            /* Korte pauze tussen batches (niet na de laatste) */
            if (b < totalBatches - 1) {
                await new Promise(r => setTimeout(r, BATCH_PAUSE_MS));
            }
        }

        setBatchInfo(null);
        setWorking(false);
    }

    function resetAll() {
        setFiles([]);
        setSavedCount(0);
    }

    function removeFile(id: string) {
        setFiles(prev => prev.filter(f => f.id !== id));
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Bibliotheek-overzicht (alleen zichtbaar als er al data is) */}
            <PricelistLibrary refreshKey={libRefreshKey} orgId={orgId} />

            {/* Context-banner */}
            <div style={{ padding: '12px 16px', borderRadius: 10, background: `${GOLD}0d`, border: `1px solid ${GOLD}35`, fontSize: 12.5, color: 'var(--muted)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Info size={14} style={{ color: GOLD, marginTop: 2, flexShrink: 0 }} />
                <div>
                    <strong style={{ color: 'var(--text)' }}>Prijslijst bulk-upload:</strong> sleep 60+ PDF&apos;s in één keer.
                    Verwerkt in batches van 30 (3 parallel per batch) om geheugen + rate-limits te respecteren.
                    Claude Haiku leest elke PDF en vult <code>supplier_prices</code> met alle regels.
                    <br />
                    <span style={{ color: 'var(--muted-light)' }}>Dit wordt <strong>geen voorraad</strong> — alleen een prijsbibliotheek voor Price Intelligence.</span>
                </div>
            </div>

            {/* Drop zone */}
            <MetalCard>
                <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => {
                        e.preventDefault();
                        setDragOver(false);
                        if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
                    }}
                    style={{
                        padding: 40,
                        borderRadius: 12,
                        margin: 16,
                        border: `2px dashed ${dragOver ? GOLD : 'var(--border)'}`,
                        background: dragOver ? `${GOLD}10` : 'var(--color-bg-deep)',
                        textAlign: 'center',
                        transition: 'all .2s',
                        cursor: 'pointer',
                    }}
                    onClick={() => document.getElementById('bulk-pricelist-input')?.click()}
                >
                    <FileUp size={44} style={{ color: dragOver ? GOLD : 'var(--muted-light)', marginBottom: 12 }} />
                    <div style={{ fontFamily: 'Outfit, DM Sans, sans-serif', fontSize: 20, fontWeight: 400, color: 'var(--text)', marginBottom: 6 }}>
                        Sleep PDF&apos;s hierheen
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                        of <span style={{ color: GOLD, textDecoration: 'underline' }}>klik om te selecteren</span> — accepteert meerdere PDF&apos;s tegelijk
                    </div>
                    <input id="bulk-pricelist-input" type="file" accept="application/pdf" multiple style={{ display: 'none' }}
                        onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
                </div>

                {/* Supplier-override */}
                {files.length > 0 && (
                    <div style={{ padding: '0 16px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Eyebrow>Leverancier (optioneel override)</Eyebrow>
                        <input
                            value={overrideSupplier}
                            onChange={e => setOverrideSupplier(e.target.value)}
                            placeholder="bv. Makro — leeg = AI detecteert zelf"
                            disabled={working}
                            style={{ flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--color-bg-deep)', color: 'var(--text)', fontSize: 13 }}
                        />
                    </div>
                )}
            </MetalCard>

            {/* File-list + progress */}
            {files.length > 0 && (
                <MetalCard>
                    <div style={{ padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                            <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
                                <div>
                                    <Eyebrow>Totaal</Eyebrow>
                                    <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 400, fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{files.length}</div>
                                </div>
                                <div>
                                    <Eyebrow>Verwerkt</Eyebrow>
                                    <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 400, fontSize: 22, fontVariantNumeric: 'tabular-nums', color: 'var(--green)' }}>{doneCount}</div>
                                </div>
                                {errorCount > 0 && (
                                    <div>
                                        <Eyebrow>Fout</Eyebrow>
                                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 400, fontSize: 22, fontVariantNumeric: 'tabular-nums', color: 'var(--red)' }}>{errorCount}</div>
                                    </div>
                                )}
                                <div>
                                    <Eyebrow>Producten</Eyebrow>
                                    <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 400, fontSize: 22, fontVariantNumeric: 'tabular-nums', color: GOLD }}>{totalProducten}</div>
                                </div>
                                {savedCount > 0 && (
                                    <div>
                                        <Eyebrow>Opgeslagen</Eyebrow>
                                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 400, fontSize: 22, fontVariantNumeric: 'tabular-nums', color: 'var(--green)' }}>{savedCount}</div>
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {!working && !allFinished && (
                                    <button onClick={processQueue} disabled={files.length === 0}
                                        style={{ padding: '10px 18px', borderRadius: 9, background: GOLD, color: 'var(--brand-background, #000)', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        <Sparkles size={14} /> Start verwerking ({files.length})
                                    </button>
                                )}
                                {working && (
                                    <div style={{ padding: '10px 18px', borderRadius: 9, background: `${GOLD}20`, color: GOLD, fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                        <Loader2 size={14} className="animate-spin" />
                                        <span>Verwerken {doneCount + errorCount}/{files.length}</span>
                                        {batchInfo && batchInfo.total > 1 && (
                                            <span style={{ padding: '2px 8px', borderRadius: 100, background: `${GOLD}30`, fontSize: 11, letterSpacing: '.04em' }}>
                                                Batch {batchInfo.current}/{batchInfo.total}
                                            </span>
                                        )}
                                    </div>
                                )}
                                <button onClick={resetAll} disabled={working}
                                    style={{ padding: '10px 14px', borderRadius: 9, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 600, cursor: working ? 'not-allowed' : 'pointer' }}>
                                    Wissen
                                </button>
                            </div>
                        </div>

                        {/* Progress bar */}
                        <div style={{ height: 4, borderRadius: 2, background: 'var(--color-bg-deep)', overflow: 'hidden', marginBottom: 14 }}>
                            <div style={{ height: '100%', width: `${files.length ? ((doneCount + errorCount) / files.length) * 100 : 0}%`, background: `linear-gradient(90deg, ${GOLD}, var(--green))`, transition: 'width .3s' }} />
                        </div>

                        {/* File rows */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 500, overflow: 'auto' }}>
                            {files.map((f, i) => (
                                <div key={f.id} style={{
                                    display: 'grid',
                                    gridTemplateColumns: '28px 1fr auto auto auto',
                                    gap: 10,
                                    padding: '8px 10px',
                                    borderRadius: 7,
                                    background: f.status === 'processing' ? `${GOLD}10` : f.status === 'done' ? 'rgba(34,197,94,.05)' : f.status === 'error' ? 'rgba(239,68,68,.05)' : 'transparent',
                                    alignItems: 'center',
                                    fontSize: 12,
                                }}>
                                    <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--muted)', fontSize: 11 }}>{i + 1}</span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file.name}</span>
                                    {f.leverancier && <span style={{ fontSize: 10, color: GOLD, fontWeight: 600 }}>{f.leverancier}</span>}
                                    {!f.leverancier && <span />}
                                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                                        {f.status === 'done' && `${f.producten} items`}
                                        {f.status === 'error' && (
                                            <span style={{ color: 'var(--red)', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'help' }} title={f.error || ''}>
                                                {f.error?.slice(0, 140)}
                                            </span>
                                        )}
                                    </span>
                                    <span style={{ width: 20, display: 'flex', justifyContent: 'center' }}>
                                        {f.status === 'pending' && <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--border)' }} />}
                                        {f.status === 'processing' && <Loader2 size={14} className="animate-spin" style={{ color: GOLD }} />}
                                        {f.status === 'done' && <Check size={14} style={{ color: 'var(--green)' }} />}
                                        {f.status === 'error' && <X size={14} style={{ color: 'var(--red)' }} />}
                                        {f.status === 'pending' && !working && (
                                            <button onClick={() => removeFile(f.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0, marginLeft: 4 }}>
                                                <X size={12} />
                                            </button>
                                        )}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {allFinished && savedCount > 0 && (
                            <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 9, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.3)', color: 'var(--green)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Check size={14} /> {savedCount} productprijzen opgeslagen in de database. Bekijk ze in de Prijsanalyse of zoek via product-naam.
                            </div>
                        )}
                    </div>
                </MetalCard>
            )}
        </div>
    );
}

function FolderBooks() {
    const { data: invoices } = useSupabase<any>('supplier_invoices', []);
    const { data: bonnen } = useSupabase<any>('bonnen', []);
    const { data: prijzen } = useSupabase<any>('supplier_prices', []);
    const showToast = useToast();
    const [csvOpen, setCsvOpen] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
    const [archiveOpen, setArchiveOpen] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [comparisonOpen, setComparisonOpen] = useState(false);

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

    // Maand-trend: laatste 6 maanden totaal
    const monthlyTrend = useMemo(() => {
        const months: { key: string; label: string; total: number }[] = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = d.toISOString().slice(0, 7);
            const label = d.toLocaleDateString('nl-NL', { month: 'short' });
            months.push({ key, label, total: 0 });
        }
        (invoices || []).forEach((i: any) => {
            if (!i.datum) return;
            const k = i.datum.slice(0, 7);
            const m = months.find(x => x.key === k);
            if (m) m.total += parseFloat(i.totaal_incl) || 0;
        });
        (bonnen || []).forEach((b: any) => {
            if (!b.datum) return;
            const k = b.datum.slice(0, 7);
            const m = months.find(x => x.key === k);
            if (m) m.total += parseFloat(b.totaal_bedrag) || 0;
        });
        return months;
    }, [invoices, bonnen]);

    // Deze maand vs vorige maand delta
    const monthDelta = useMemo(() => {
        if (monthlyTrend.length < 2) return null;
        const cur = monthlyTrend[monthlyTrend.length - 1].total;
        const prev = monthlyTrend[monthlyTrend.length - 2].total;
        if (prev === 0) return null;
        return { pct: ((cur - prev) / prev) * 100, cur, prev };
    }, [monthlyTrend]);

    // Categorie-uitgaven (uit factuur-regels)
    const byCategorie = useMemo(() => {
        const m: Record<string, number> = {};
        (invoices || []).forEach((inv: any) => {
            const regels = inv.raw_ai_response?.regels || [];
            regels.forEach((r: any) => {
                const cat = r.categorie || 'Overig';
                const sub = parseFloat(r.subtotaal) || 0;
                m[cat] = (m[cat] || 0) + sub;
            });
        });
        (bonnen || []).forEach((b: any) => {
            if (b.categorie) {
                m[b.categorie] = (m[b.categorie] || 0) + (parseFloat(b.totaal_bedrag) || 0);
            }
        });
        return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
    }, [invoices, bonnen]);

    // BTW totaal dit kwartaal
    const btwThisQuarter = useMemo(() => {
        const now = new Date();
        const q = Math.floor(now.getMonth() / 3);
        const qStart = new Date(now.getFullYear(), q * 3, 1);
        const qEnd = new Date(now.getFullYear(), q * 3 + 3, 0);
        const iso = (d: Date) => d.toISOString().slice(0, 10);
        let btw = 0;
        (invoices || []).forEach((i: any) => {
            if (i.datum && i.datum >= iso(qStart) && i.datum <= iso(qEnd)) {
                btw += parseFloat(i.totaal_btw) || 0;
            }
        });
        return { btw, label: `Q${q + 1} ${now.getFullYear()}` };
    }, [invoices]);

    // Prijsalarmen: producten 15%+ duurder dan gemiddelde
    const prijsalarmen = useMemo(() => {
        const productMap: Record<string, { prijzen: { prijs: number; datum: string | null; leverancier: string }[]; eenheid: string }> = {};
        (invoices || []).forEach((inv: any) => {
            const regels = inv.raw_ai_response?.regels || [];
            regels.forEach((r: any) => {
                if (!r.product_naam) return;
                const key = r.product_naam.toLowerCase().trim();
                if (!productMap[key]) productMap[key] = { prijzen: [], eenheid: r.eenheid || 'stuks' };
                // Gebruik normaalprijs indien beschikbaar (excl bulkkorting)
                const p = r.prijs_normaal != null && r.prijs_normaal > 0
                    ? parseFloat(r.prijs_normaal)
                    : parseFloat(r.prijs_per_eenheid) || 0;
                if (p > 0) productMap[key].prijzen.push({ prijs: p, datum: inv.datum, leverancier: inv.leverancier });
            });
        });
        const alarms: { product: string; eenheid: string; gem: number; laatst: number; pct: number; leverancier: string }[] = [];
        Object.entries(productMap).forEach(([product, d]) => {
            if (d.prijzen.length < 2) return;
            const sorted = d.prijzen.slice().sort((a, b) => {
                if (!a.datum) return 1;
                if (!b.datum) return -1;
                return b.datum.localeCompare(a.datum);
            });
            const laatst = sorted[0];
            const eerdere = sorted.slice(1);
            const gem = eerdere.reduce((s, x) => s + x.prijs, 0) / eerdere.length;
            if (gem === 0) return;
            const pct = ((laatst.prijs - gem) / gem) * 100;
            if (pct >= 15) {
                alarms.push({ product, eenheid: d.eenheid, gem, laatst: laatst.prijs, pct, leverancier: laatst.leverancier });
            }
        });
        return alarms.sort((a, b) => b.pct - a.pct).slice(0, 5);
    }, [invoices]);

    // CSV export: alle factuur-regels + totals voor accountant
    function exportToCSV() {
        const rows: any[] = [];
        (invoices || []).forEach((inv: any) => {
            const regels = inv.raw_ai_response?.regels || [];
            if (regels.length === 0) {
                rows.push({
                    datum: inv.datum || '',
                    leverancier: inv.leverancier || '',
                    factuurnummer: inv.factuurnummer || '',
                    product: '',
                    hoeveelheid: '',
                    eenheid: '',
                    prijs_per_eenheid: '',
                    btw_pct: '',
                    subtotaal_excl: inv.totaal_excl || 0,
                    btw: inv.totaal_btw || 0,
                    totaal_incl: inv.totaal_incl || 0,
                    categorie: '',
                });
            } else {
                regels.forEach((r: any) => {
                    rows.push({
                        datum: inv.datum || '',
                        leverancier: inv.leverancier || '',
                        factuurnummer: inv.factuurnummer || '',
                        product: r.product_naam || '',
                        hoeveelheid: r.hoeveelheid || '',
                        eenheid: r.eenheid || '',
                        prijs_per_eenheid: r.prijs_per_eenheid || '',
                        btw_pct: r.btw_pct || '',
                        subtotaal_excl: r.subtotaal || '',
                        btw: '',
                        totaal_incl: '',
                        categorie: r.categorie || '',
                    });
                });
            }
        });
        if (rows.length === 0) {
            showToast('Geen facturen om te exporteren', 'info');
            return;
        }
        const csv = Papa.unparse(rows);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bbq-boekhouding-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`${rows.length} regels geëxporteerd`, 'success');
    }

    if (csvOpen) return <CSVImport onClose={() => setCsvOpen(false)} />;
    if (archiveOpen) return <SupplierArchive invoices={invoices || []} bonnen={bonnen || []} onClose={() => setArchiveOpen(false)} />;

    const totaalInkoop = totalSpend + totalReceipts;
    // "Deze maand": als er geen data is, pak de laatste maand mét data
    const lastMonthWithData = monthlyTrend.slice().reverse().find(m => m.total > 0);
    const lastMonthIdx = lastMonthWithData ? monthlyTrend.findIndex(m => m.key === lastMonthWithData.key) : -1;
    const curMaand = lastMonthWithData?.total || 0;
    const curMaandLabel = lastMonthWithData ? new Date(lastMonthWithData.key + '-01').toLocaleDateString('nl-NL', { month: 'long' }) : 'deze maand';
    const vorigeMaand = lastMonthIdx > 0 ? monthlyTrend[lastMonthIdx - 1].total : 0;
    const vorigeMaandLabel = lastMonthIdx > 0 ? new Date(monthlyTrend[lastMonthIdx - 1].key + '-01').toLocaleDateString('nl-NL', { month: 'long' }) : '';
    const topCategorie = byCategorie[0];

    const aiTips = useMemo(() => buildAiTips(bySupplier as BookSupplier[], invoices || []), [bySupplier, invoices]);
    const aiSaving = aiTips.reduce((s, t) => s + t.saving, 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* KPI STRIP — design-stijl */}
            <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <BoekKPI label={`Inkoop ${curMaandLabel}`} value={`€ ${(curMaand / 1000).toFixed(1)}k`} sub={`${bySupplier.filter(s => s.spend > 0).length} leveranciers actief`} icon={Euro} />
                <BoekKPI label="Facturen" value={(invoices || []).length} sub={`+ ${(bonnen || []).length} bonnen`} icon={FileText} />
                <BoekKPI label="BTW-saldo" value={fmt2(btwThisQuarter.btw)} sub={btwThisQuarter.label} icon={Wallet} />
                <BoekKPI label="AI besparing" value={aiSaving > 0 ? `€ ${aiSaving.toLocaleString('nl-NL')}` : '—'} sub={aiSaving > 0 ? '/maand potentieel' : 'scan meer data'} tone={aiSaving > 0 ? 'ok' : undefined} icon={Sparkles} />
            </div>

            {/* CONTEXT BANNER — uitleg hoe het werkt */}
            <BoekContextBanner />

            {/* HERO — grote taart + 3 duidelijke cijfers */}
            <MetalCard>
                <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24, padding: 30, alignItems: 'center' }}>
                    <CategoryDonut data={byCategorie} total={totaalInkoop} onSliceClick={setSelectedCategory} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <HeroStat label={`Besteed in ${curMaandLabel}`} value={fmt2(curMaand)} delta={vorigeMaand > 0 && curMaand > 0 ? { pct: ((curMaand - vorigeMaand) / vorigeMaand) * 100, cur: curMaand, prev: vorigeMaand } : null} />
                        <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <MiniTile label={vorigeMaandLabel ? `In ${vorigeMaandLabel}` : 'Vorige maand'} value={fmt2(vorigeMaand)} />
                            <MiniTile label="Top categorie" value={topCategorie ? topCategorie[0] : '—'} sub={topCategorie ? fmt2(topCategorie[1]) : ''} color={topCategorie ? SUPPLIER_COLORS[0] : undefined} />
                        </div>
                        {prijsalarmen.length > 0 ? (
                            <div style={{ padding: 14, borderRadius: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', display: 'flex', alignItems: 'center', gap: 12 }}>
                                <AlertTriangle size={20} style={{ color: 'var(--red)', flexShrink: 0 }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600 }}>{prijsalarmen.length} product{prijsalarmen.length === 1 ? '' : 'en'} 15%+ duurder</div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>dan het gemiddelde — check hieronder voor details</div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ padding: 14, borderRadius: 10, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.25)', display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Check size={20} style={{ color: 'var(--green)', flexShrink: 0 }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600 }}>Prijzen stabiel</div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Geen sterke stijgingen deze periode</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </MetalCard>

            {/* GROTE ACTIE KNOPPEN */}
            <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <ActionCard icon={Store} title="Leveranciers vergelijken" desc="Zie wie goedkoper is" onClick={() => setComparisonOpen(true)} />
                <ActionCard icon={Archive} title="Archief bekijken" desc="Alle originele bestanden" onClick={() => setArchiveOpen(true)} />
                <ActionCard icon={Download} title="Export CSV" desc="Voor accountant" onClick={exportToCSV} />
                <ActionCard icon={Upload} title="Prijslijst importeren" desc="CSV-bestand inlezen" onClick={() => setCsvOpen(true)} />
            </div>

            {/* MAANDTREND — alleen tonen als er minstens 1 maand data heeft */}
            {monthlyTrend.some(m => m.total > 0) && (
                <MetalCard>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <BarChart3 size={16} style={{ color: GOLD }} />
                        <span style={{ fontSize: 14, fontWeight: 600 }}>Uitgaven per maand</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>Klik op een maand voor de facturen</span>
                    </div>
                    <MonthlyTrendChart data={monthlyTrend} onMonthClick={setSelectedMonth} />
                </MetalCard>
            )}

            {/* TOP 3 PRIJSALARMEN (grote kaarten) */}
            {prijsalarmen.length > 0 && (
                <MetalCard>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertTriangle size={16} style={{ color: 'var(--red)' }} />
                        <span style={{ fontSize: 14, fontWeight: 600 }}>Waar jij nu meer betaalt</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>Top {Math.min(prijsalarmen.length, 3)} duurdere producten</span>
                    </div>
                    <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                        {prijsalarmen.slice(0, 3).map((a, i) => (
                            <div key={i} style={{ padding: 14, borderRadius: 10, background: 'rgba(239,68,68,.04)', border: '1px solid rgba(239,68,68,.15)' }}>
                                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.product}</div>
                                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 10 }}>{a.leverancier}</div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                                    <span style={{ fontSize: 20, fontWeight: 600, fontFamily: 'Outfit, sans-serif', color: 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>€{a.laatst.toFixed(2)}</span>
                                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>nu</span>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>gemiddeld <span style={{ color: 'var(--text)' }}>€{a.gem.toFixed(2)}</span> · <span style={{ color: 'var(--red)', fontWeight: 700 }}>↑ {a.pct.toFixed(0)}%</span></div>
                            </div>
                        ))}
                    </div>
                </MetalCard>
            )}

            {/* LEVERANCIERS DONUT — al bestond */}
            <SupplierDonut bySupplier={bySupplier} total={totalSpend} onSelect={setSelectedSupplier} />

            {/* AI TIP BOUWER — 3 data-driven acties uit echte facturen */}
            <AiTipBuilder tips={aiTips} onOpenSupplier={setSelectedSupplier} />

            {/* PRIJSONTWIKKELING PER CATEGORIE */}
            <CategoryPriceGrid invoices={invoices || []} />

            {/* Drawers */}
            {selectedMonth && <MonthDetailDrawer monthKey={selectedMonth} invoices={invoices || []} bonnen={bonnen || []} onClose={() => setSelectedMonth(null)} />}
            {selectedCategory && <CategoryDetailDrawer category={selectedCategory} invoices={invoices || []} onClose={() => setSelectedCategory(null)} />}
            {comparisonOpen && <SupplierComparisonDrawer invoices={invoices || []} onClose={() => setComparisonOpen(false)} />}
            {selectedSupplier && (
                <SupplierAnalysisDrawer
                    supplierName={selectedSupplier}
                    bySupplier={bySupplier}
                    totalSpend={totalSpend}
                    onClose={() => setSelectedSupplier(null)}
                />
            )}

            {/* BTW TILE onderaan — subtiel, voor later */}
            <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <MetalCard>
                    <div style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 10, background: `${GOLD}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Wallet size={20} style={{ color: GOLD }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600 }}>BTW {btwThisQuarter.label}</div>
                            <div style={{ fontSize: 22, fontFamily: 'Outfit, sans-serif', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmt2(btwThisQuarter.btw)}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>te declareren bij belastingdienst</div>
                        </div>
                    </div>
                </MetalCard>
                <MetalCard>
                    <div style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 10, background: `${GOLD}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Euro size={20} style={{ color: GOLD }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600 }}>Totaal ingekocht</div>
                            <div style={{ fontSize: 22, fontFamily: 'Outfit, sans-serif', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmt2(totaalInkoop)}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>over {invoices.length} facturen + {bonnen.length} bonnen</div>
                        </div>
                    </div>
                </MetalCard>
            </div>
        </div>
    );
}

/** Groot hero-getal met delta */
function HeroStat({ label, value, delta }: { label: string; value: string; delta: { pct: number; cur: number; prev: number } | null }) {
    return (
        <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 600, marginBottom: 4 }}>{label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span style={{ fontSize: 42, fontFamily: 'Outfit, sans-serif', fontWeight: 400, color: GOLD, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</span>
                {delta && (
                    <span style={{ fontSize: 13, fontWeight: 600, color: delta.pct > 10 ? 'var(--red)' : delta.pct < -10 ? 'var(--green)' : 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {delta.pct > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {Math.abs(delta.pct).toFixed(0)}% t.o.v. vorige maand
                    </span>
                )}
            </div>
        </div>
    );
}

/** Klein tegel */
function MiniTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
    return (
        <div style={{ padding: 14, borderRadius: 10, background: 'var(--color-bg-deep)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 600, marginBottom: 4 }}>{label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                {color && <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />}
                <span style={{ fontSize: 18, fontFamily: 'Outfit, sans-serif', fontWeight: 500, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
                {sub && <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>· {sub}</span>}
            </div>
        </div>
    );
}

/** Grote klikbare actie-kaart */
function ActionCard({ icon: Icon, title, desc, onClick }: { icon: any; title: string; desc: string; onClick: () => void }) {
    return (
        <button onClick={onClick} style={{
            padding: 18, borderRadius: 12, background: 'var(--card)',
            border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)',
            boxShadow: '0 0 0 1px color-mix(in srgb, var(--brand-primary) 8%, transparent), 0 4px 12px color-mix(in srgb, var(--brand-primary) 6%, transparent)',
            textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10,
            transition: 'all .15s', color: 'var(--text)',
        }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 0 1px color-mix(in srgb, var(--brand-primary) 40%, transparent), 0 4px 16px color-mix(in srgb, var(--brand-primary) 25%, transparent)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 0 1px color-mix(in srgb, var(--brand-primary) 8%, transparent), 0 4px 12px color-mix(in srgb, var(--brand-primary) 6%, transparent)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)', border: '1px solid color-mix(in srgb, var(--brand-primary) 35%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={18} style={{ color: 'var(--brand-primary)' }} />
            </div>
            <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, color: 'var(--text)' }}>{title}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{desc}</div>
            </div>
        </button>
    );
}

/** Echt SVG taartdiagram — met total in het midden en klikbare slices */
function CategoryDonut({ data, total, onSliceClick }: { data: [string, number][]; total: number; onSliceClick: (cat: string) => void }) {
    const [hover, setHover] = useState<string | null>(null);
    const size = 280;
    const cx = size / 2;
    const cy = size / 2;
    const rOuter = 120;
    const rInner = 78;
    const totalVal = data.reduce((s, [, v]) => s + v, 0);

    if (totalVal === 0 || data.length === 0) {
        return (
            <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                <PieChart size={40} style={{ color: 'var(--muted-light)', opacity: 0.4 }} />
                <div>Nog geen data</div>
                <div style={{ fontSize: 10 }}>Scan een factuur om te starten</div>
            </div>
        );
    }

    let currentAngle = -Math.PI / 2;
    const slices = data.map(([cat, val], i) => {
        const angle = (val / totalVal) * 2 * Math.PI;
        const x1o = cx + rOuter * Math.cos(currentAngle);
        const y1o = cy + rOuter * Math.sin(currentAngle);
        const x2o = cx + rOuter * Math.cos(currentAngle + angle);
        const y2o = cy + rOuter * Math.sin(currentAngle + angle);
        const x1i = cx + rInner * Math.cos(currentAngle + angle);
        const y1i = cy + rInner * Math.sin(currentAngle + angle);
        const x2i = cx + rInner * Math.cos(currentAngle);
        const y2i = cy + rInner * Math.sin(currentAngle);
        const largeArc = angle > Math.PI ? 1 : 0;
        const path = `M ${x1o} ${y1o} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x2i} ${y2i} Z`;
        const midAngle = currentAngle + angle / 2;
        const labelR = (rOuter + rInner) / 2;
        const lx = cx + labelR * Math.cos(midAngle);
        const ly = cy + labelR * Math.sin(midAngle);
        currentAngle += angle;
        const pct = (val / totalVal) * 100;
        return { cat, val, path, color: SUPPLIER_COLORS[i % SUPPLIER_COLORS.length], pct, lx, ly };
    });

    const hoveredSlice = hover ? slices.find(s => s.cat === hover) : null;
    const centerLabel = hoveredSlice ? hoveredSlice.cat : 'Totaal';
    const centerValue = hoveredSlice ? fmt2(hoveredSlice.val) : fmt2(total);
    const centerSub = hoveredSlice ? `${hoveredSlice.pct.toFixed(0)}% van uitgaven` : `${data.length} categorie${data.length === 1 ? '' : 'ën'}`;

    return (
        <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {slices.map(s => (
                    <path
                        key={s.cat}
                        d={s.path}
                        fill={s.color}
                        stroke="var(--card)"
                        strokeWidth={2}
                        opacity={hover === null || hover === s.cat ? 1 : 0.3}
                        style={{ cursor: 'pointer', transition: 'opacity .15s, transform .15s', transformOrigin: `${cx}px ${cy}px`, transform: hover === s.cat ? 'scale(1.03)' : 'scale(1)' }}
                        onMouseEnter={() => setHover(s.cat)}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => onSliceClick(s.cat)}
                    >
                        <title>{s.cat}: {fmt2(s.val)} ({s.pct.toFixed(0)}%) — klik voor details</title>
                    </path>
                ))}
                {slices.filter(s => s.pct >= 6).map(s => (
                    <text key={`lbl-${s.cat}`} x={s.lx} y={s.ly} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 10, fontWeight: 700, fill: 'rgba(0,0,0,.75)', pointerEvents: 'none' }}>
                        {s.pct.toFixed(0)}%
                    </text>
                ))}
            </svg>
            {/* Center tekst */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.12em', fontWeight: 600 }}>{centerLabel}</div>
                <div style={{ fontSize: 28, fontFamily: 'Outfit, sans-serif', fontWeight: 400, fontVariantNumeric: 'tabular-nums', color: hoveredSlice ? hoveredSlice.color : GOLD, lineHeight: 1.1 }}>{centerValue}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{centerSub}</div>
            </div>
        </div>
    );
}

function MonthlyTrendChart({ data, onMonthClick }: { data: { key: string; label: string; total: number }[]; onMonthClick?: (key: string) => void }) {
    const max = Math.max(...data.map(d => d.total), 1);
    return (
        <div style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
                {data.map((m, i) => {
                    const h = (m.total / max) * 100;
                    const isCurrent = i === data.length - 1;
                    const clickable = m.total > 0 && !!onMonthClick;
                    return (
                        <div key={m.key}
                            onClick={() => clickable && onMonthClick!(m.key)}
                            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: clickable ? 'pointer' : 'default' }}
                            title={clickable ? `${m.label}: ${fmt2(m.total)} — klik voor details` : `${m.label}: ${fmt2(m.total)}`}>
                            <div style={{ fontSize: 10, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', height: 14 }}>{m.total > 0 ? `€${Math.round(m.total)}` : ''}</div>
                            <div style={{ width: '100%', height: `${h}%`, minHeight: m.total > 0 ? 2 : 0, background: isCurrent ? GOLD : `${GOLD}66`, borderRadius: '4px 4px 0 0', transition: 'all .2s' }} className={clickable ? 'hover-brighten' : ''} />
                            <div style={{ fontSize: 10, color: isCurrent ? GOLD : 'var(--muted)', fontWeight: isCurrent ? 700 : 500, textTransform: 'uppercase', letterSpacing: '.05em' }}>{m.label}</div>
                        </div>
                    );
                })}
            </div>
            {onMonthClick && <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>Klik op een balk voor alle facturen in die maand</div>}
            <style>{`.hover-brighten:hover{filter:brightness(1.3);}`}</style>
        </div>
    );
}

function CategoryBreakdown({ data, onCategoryClick }: { data: [string, number][]; onCategoryClick?: (cat: string) => void }) {
    if (data.length === 0) {
        return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>Nog geen gecategoriseerde uitgaven. Scan een factuur om te beginnen.</div>;
    }
    const max = data[0][1];
    const total = data.reduce((s, [, v]) => s + v, 0);
    return (
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.map(([cat, val], i) => {
                const w = (val / max) * 100;
                const pct = total > 0 ? (val / total) * 100 : 0;
                const clickable = !!onCategoryClick;
                return (
                    <div key={cat}
                        onClick={() => clickable && onCategoryClick!(cat)}
                        style={{ cursor: clickable ? 'pointer' : 'default', padding: 2, borderRadius: 4, transition: 'background .15s' }}
                        className={clickable ? 'hover-bg' : ''}
                        title={clickable ? `Klik voor alle ${cat}-producten` : undefined}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 11 }}>
                            <span style={{ fontWeight: 500 }}>{cat}</span>
                            <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt2(val)} <span style={{ color: 'var(--muted-light)' }}>· {pct.toFixed(0)}%</span></span>
                        </div>
                        <div style={{ height: 6, background: 'rgba(130,130,130,.08)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${w}%`, height: '100%', background: SUPPLIER_COLORS[i % SUPPLIER_COLORS.length], transition: 'width .3s' }} />
                        </div>
                    </div>
                );
            })}
            {onCategoryClick && <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', marginTop: 6 }}>Klik op een categorie voor productoverzicht + prijshistorie</div>}
            <style>{`.hover-bg:hover{background:rgba(196,163,90,.08);}`}</style>
        </div>
    );
}

/** Drawer: alle facturen in een specifieke maand */
function MonthDetailDrawer({ monthKey, invoices, bonnen, onClose }: { monthKey: string; invoices: any[]; bonnen: any[]; onClose: () => void }) {
    const monthInvoices = invoices.filter((i: any) => i.datum?.slice(0, 7) === monthKey);
    const monthBonnen = bonnen.filter((b: any) => b.datum?.slice(0, 7) === monthKey);
    const total = monthInvoices.reduce((s: number, i: any) => s + (parseFloat(i.totaal_incl) || 0), 0)
        + monthBonnen.reduce((s: number, b: any) => s + (parseFloat(b.totaal_bedrag) || 0), 0);
    const label = new Date(monthKey + '-01').toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ width: 'min(680px, 100vw)', background: 'var(--bg)', borderLeft: '1px solid var(--border)', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300 }}>Uitgaven {label}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{monthInvoices.length} factuur{monthInvoices.length === 1 ? '' : 'en'} · {monthBonnen.length} bon{monthBonnen.length === 1 ? '' : 'nen'} · totaal {fmt2(total)}</div>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 6 }}><X size={18} /></button>
                </div>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {monthInvoices.length === 0 && monthBonnen.length === 0 && (
                        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Geen facturen of bonnen in deze maand.</div>
                    )}
                    {monthInvoices.map((inv: any) => (
                        <a key={`inv-${inv.id}`} href={inv.file_url || '#'} target="_blank" rel="noopener noreferrer"
                            onClick={e => { if (!inv.file_url) e.preventDefault(); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)', transition: 'border-color .15s' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = GOLD; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}>
                            <FileText size={14} style={{ color: GOLD }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{inv.leverancier}</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{inv.factuurnummer || '—'} · {inv.datum}</div>
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 600, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt2(inv.totaal_incl)}</span>
                            {inv.file_url && <ExternalLink size={12} style={{ color: 'var(--muted)' }} />}
                        </a>
                    ))}
                    {monthBonnen.map((b: any) => (
                        <a key={`bon-${b.id}`} href={b.foto_url || '#'} target="_blank" rel="noopener noreferrer"
                            onClick={e => { if (!b.foto_url) e.preventDefault(); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)' }}>
                            <Receipt size={14} style={{ color: GOLD }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{b.winkel}</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Bon · {b.datum} {b.categorie ? `· ${b.categorie}` : ''}</div>
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 600, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt2(b.totaal_bedrag)}</span>
                            {b.foto_url && <ExternalLink size={12} style={{ color: 'var(--muted)' }} />}
                        </a>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** Drawer: alle producten in een categorie met prijshistorie per product */
function CategoryDetailDrawer({ category, invoices, onClose }: { category: string; invoices: any[]; onClose: () => void }) {
    const products = useMemo(() => {
        const m: Record<string, { naam: string; eenheid: string; prijzen: { prijs: number; datum: string | null; leverancier: string; hoeveelheid: number }[] }> = {};
        invoices.forEach((inv: any) => {
            const regels = inv.raw_ai_response?.regels || [];
            regels.forEach((r: any) => {
                if ((r.categorie || 'Overig') !== category) return;
                const key = (r.product_naam || '').toLowerCase().trim();
                if (!key) return;
                if (!m[key]) m[key] = { naam: r.product_naam, eenheid: r.eenheid || 'stuks', prijzen: [] };
                const p = r.prijs_normaal != null && r.prijs_normaal > 0 ? parseFloat(r.prijs_normaal) : parseFloat(r.prijs_per_eenheid) || 0;
                if (p > 0) m[key].prijzen.push({ prijs: p, datum: inv.datum, leverancier: inv.leverancier, hoeveelheid: parseFloat(r.hoeveelheid) || 0 });
            });
        });
        return Object.values(m).map(p => {
            const sorted = p.prijzen.slice().sort((a, b) => {
                if (!a.datum) return 1;
                if (!b.datum) return -1;
                return b.datum.localeCompare(a.datum);
            });
            const gem = p.prijzen.length > 0 ? p.prijzen.reduce((s, x) => s + x.prijs, 0) / p.prijzen.length : 0;
            const totaalGekocht = p.prijzen.reduce((s, x) => s + (x.prijs * x.hoeveelheid), 0);
            return { ...p, prijzen: sorted, gem, laatst: sorted[0], totaalGekocht };
        }).sort((a, b) => b.totaalGekocht - a.totaalGekocht);
    }, [invoices, category]);

    const totaal = products.reduce((s, p) => s + p.totaalGekocht, 0);

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ width: 'min(780px, 100vw)', background: 'var(--bg)', borderLeft: '1px solid var(--border)', overflow: 'auto' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300 }}>Categorie: {category}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{products.length} product{products.length === 1 ? '' : 'en'} · totaal ingekocht {fmt2(totaal)}</div>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 6 }}><X size={18} /></button>
                </div>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {products.length === 0 && (
                        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Geen producten in deze categorie.</div>
                    )}
                    {products.map((p, i) => {
                        const prices = p.prijzen.slice().reverse().map(x => x.prijs);
                        const trend = prices.length >= 2 ? ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100 : 0;
                        return (
                            <div key={i} style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600 }}>{p.naam}</div>
                                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.prijzen.length}× gekocht · {p.laatst.leverancier}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>€{p.laatst.prijs.toFixed(2)}<span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>/{p.eenheid}</span></div>
                                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>gem. €{p.gem.toFixed(2)}</div>
                                    </div>
                                </div>
                                {prices.length >= 2 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <PriceSparkline prices={prices} />
                                        {Math.abs(trend) > 3 && (
                                            <span style={{ fontSize: 10, fontWeight: 700, color: trend > 0 ? 'var(--red)' : 'var(--green)' }}>
                                                {trend > 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(0)}% over {p.prijzen.length} inkopen
                                            </span>
                                        )}
                                        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>totaal {fmt2(p.totaalGekocht)}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/** Drawer: leveranciers-vergelijking — zelfde product bij verschillende suppliers */
function SupplierComparisonDrawer({ invoices, onClose }: { invoices: any[]; onClose: () => void }) {
    const comparisons = useMemo(() => {
        // Verzamel per product (genormaliseerde naam) de prijzen per leverancier
        const productMap: Record<string, { naam: string; eenheid: string; perSupplier: Record<string, number[]> }> = {};
        invoices.forEach((inv: any) => {
            const regels = inv.raw_ai_response?.regels || [];
            regels.forEach((r: any) => {
                const key = (r.product_naam || '').toLowerCase().trim();
                if (!key) return;
                if (!productMap[key]) productMap[key] = { naam: r.product_naam, eenheid: r.eenheid || 'stuks', perSupplier: {} };
                const sup = inv.leverancier || 'Onbekend';
                const p = r.prijs_normaal != null && r.prijs_normaal > 0 ? parseFloat(r.prijs_normaal) : parseFloat(r.prijs_per_eenheid) || 0;
                if (p > 0) {
                    if (!productMap[key].perSupplier[sup]) productMap[key].perSupplier[sup] = [];
                    productMap[key].perSupplier[sup].push(p);
                }
            });
        });
        // Filter alleen producten bij ≥2 leveranciers
        return Object.values(productMap)
            .filter(p => Object.keys(p.perSupplier).length >= 2)
            .map(p => {
                const suppliers = Object.entries(p.perSupplier).map(([name, prijzen]) => ({
                    name,
                    avg: prijzen.reduce((s, v) => s + v, 0) / prijzen.length,
                    count: prijzen.length,
                }));
                suppliers.sort((a, b) => a.avg - b.avg);
                const cheapest = suppliers[0];
                const dearest = suppliers[suppliers.length - 1];
                const saving = dearest.avg - cheapest.avg;
                const savingPct = (saving / dearest.avg) * 100;
                return { ...p, suppliers, cheapest, dearest, saving, savingPct };
            })
            .sort((a, b) => b.savingPct - a.savingPct);
    }, [invoices]);

    const totaalPotentie = comparisons.reduce((s, c) => s + c.saving, 0);

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ width: 'min(820px, 100vw)', background: 'var(--bg)', borderLeft: '1px solid var(--border)', overflow: 'auto' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300 }}>Leveranciersvergelijking</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{comparisons.length} product{comparisons.length === 1 ? '' : 'en'} bij meerdere leveranciers · potentiële besparing per eenheid: {fmt2(totaalPotentie)}</div>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 6 }}><X size={18} /></button>
                </div>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {comparisons.length === 0 && (
                        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                            Geen producten gevonden bij meerdere leveranciers. Scan facturen van andere leveranciers om vergelijkingen te zien.
                        </div>
                    )}
                    {comparisons.map((c, i) => (
                        <div key={i} style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.naam}</div>
                                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>per {c.eenheid}</div>
                                </div>
                                {c.savingPct >= 5 && (
                                    <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(34,197,94,.15)', color: 'var(--green)', border: '1px solid rgba(34,197,94,.3)', fontSize: 11, fontWeight: 700 }}>
                                        Bespaar {c.savingPct.toFixed(0)}% · €{c.saving.toFixed(2)}/{c.eenheid}
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {c.suppliers.map((s, j) => {
                                    const isLow = j === 0;
                                    const isHigh = j === c.suppliers.length - 1;
                                    const widthPct = (s.avg / c.dearest.avg) * 100;
                                    return (
                                        <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 }}>
                                            <span style={{ width: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isLow ? 'var(--green)' : isHigh ? 'var(--muted)' : 'var(--text)', fontWeight: isLow ? 700 : 500 }} title={s.name}>
                                                {isLow && '✓ '}{s.name}
                                            </span>
                                            <div style={{ flex: 1, height: 8, background: 'rgba(130,130,130,.08)', borderRadius: 4, overflow: 'hidden' }}>
                                                <div style={{ width: `${widthPct}%`, height: '100%', background: isLow ? 'var(--green)' : isHigh ? 'var(--red)' : GOLD, transition: 'width .3s' }} />
                                            </div>
                                            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: isLow ? 700 : 500, color: isLow ? 'var(--green)' : 'var(--text)', minWidth: 60, textAlign: 'right' }}>€{s.avg.toFixed(2)}</span>
                                            <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 30, textAlign: 'right' }}>({s.count}×)</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function SupplierArchive({ invoices, bonnen, onClose }: { invoices: any[]; bonnen: any[]; onClose: () => void }) {
    const grouped = useMemo(() => {
        const m: Record<string, { type: 'invoice' | 'receipt'; name: string; date: string | null; url: string; id: number; totaal: number }[]> = {};
        invoices.forEach((inv) => {
            if (!inv.file_url) return;
            const key = inv.leverancier || 'Onbekend';
            if (!m[key]) m[key] = [];
            m[key].push({
                type: 'invoice',
                name: inv.factuurnummer || `Factuur ${inv.id}`,
                date: inv.datum,
                url: inv.file_url,
                id: inv.id,
                totaal: parseFloat(inv.totaal_incl) || 0,
            });
        });
        bonnen.forEach((b) => {
            if (!b.foto_url) return;
            const key = b.winkel || 'Onbekend';
            if (!m[key]) m[key] = [];
            m[key].push({
                type: 'receipt',
                name: `Bon ${b.id}`,
                date: b.datum,
                url: b.foto_url,
                id: b.id,
                totaal: parseFloat(b.totaal_bedrag) || 0,
            });
        });
        for (const k of Object.keys(m)) {
            m[k].sort((a, b) => {
                if (!a.date) return 1;
                if (!b.date) return -1;
                return b.date.localeCompare(a.date);
            });
        }
        return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
    }, [invoices, bonnen]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <BtnGhost icon={ArrowLeft} onClick={onClose}>Terug</BtnGhost>
                <div>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300 }}>Bestandsarchief</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Alle gearchiveerde facturen en bonnen, gegroepeerd per leverancier.</div>
                </div>
            </div>

            {grouped.length === 0 ? (
                <MetalCard>
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                        Nog geen gearchiveerde bestanden. Upload een factuur of bon om te beginnen.
                    </div>
                </MetalCard>
            ) : (
                grouped.map(([supplier, files]) => (
                    <MetalCard key={supplier}>
                        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Store size={14} style={{ color: GOLD }} />
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{supplier}</span>
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {files.length} bestand{files.length === 1 ? '' : 'en'} · totaal {fmt2(files.reduce((s, f) => s + f.totaal, 0))}</span>
                        </div>
                        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                            {files.map((f, i) => (
                                <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                                    style={{ display: 'block', padding: 10, borderRadius: 8, border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)', transition: 'all .15s' }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                        {f.type === 'invoice' ? <FileText size={14} style={{ color: GOLD }} /> : <Receipt size={14} style={{ color: GOLD }} />}
                                        <span style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{f.date || 'geen datum'}</div>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt2(f.totaal)}</div>
                                    <div style={{ marginTop: 6, fontSize: 9, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                        <ExternalLink size={9} /> Open origineel
                                    </div>
                                </a>
                            ))}
                        </div>
                    </MetalCard>
                ))
            )}
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
                        <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
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
                <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: spendSuppliers.length > 0 ? '280px 1fr' : '1fr', gap: 28, padding: 22 }}>
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

                            <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
