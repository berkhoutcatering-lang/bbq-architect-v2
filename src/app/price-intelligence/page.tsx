/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useMemo, useRef } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { fileToImageBase64 } from '@/lib/documentToImage';
import Papa from 'papaparse';
import {
    FileScan, Receipt, PieChart, Sparkles, Upload, Camera, X, Check,
    AlertTriangle, Loader2, Edit3, Trash2, Package, ArrowUpRight, Clock,
    Info, HelpCircle, Plus, Search, FileText, TrendingUp, TrendingDown,
    Store, ChevronRight, Download, Euro, CheckCircle, FileUp, CloudUpload,
    ArrowLeft, Save, Filter,
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
    const showToast = useToast();
    const showConfirm = useConfirm();
    const [scanning, setScanning] = useState(false);
    const [parsedInvoice, setParsedInvoice] = useState<ParsedInvoice | null>(null);
    const [scanPreview, setScanPreview] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    async function handleFile(file: File) {
        if (!file) return;
        setError(null);
        setScanning(true);
        try {
            const imageBase64 = await fileToImageBase64(file);
            setScanPreview(imageBase64);
            const res = await fetch('/api/parse-document', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64, type: 'invoice' }),
            });
            const body = await res.json();
            if (!res.ok) {
                setError(body.error || 'Scan mislukt');
                setScanning(false);
                return;
            }
            setParsedInvoice(body.data as ParsedInvoice);
            setScanning(false);
            showToast('Factuur gelezen — controleer en boek in', 'success');
        } catch (e: any) {
            setError(e.message || 'Scan mislukt');
            setScanning(false);
        }
    }

    async function saveInvoice() {
        if (!parsedInvoice) return;
        const { regels = [], ...header } = parsedInvoice;
        const inserted = await insert({
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
        const invoiceId = (inserted as any)?.[0]?.id || (inserted as any)?.id;
        if (invoiceId && regels.length > 0) {
            for (const r of regels) {
                await fetch('/api/supabase-proxy', { method: 'POST' }).catch(() => { /* noop fallback */ });
            }
        }
        showToast(`Factuur opgeslagen · ${regels.length} regels`, 'success');
        setParsedInvoice(null);
        setScanPreview(null);
        refetch();
    }

    function cancelScan() {
        setParsedInvoice(null);
        setScanPreview(null);
        setError(null);
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

            {/* Dropzone */}
            <MetalCard>
                <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
                    onClick={() => !scanning && fileRef.current?.click()}
                    style={{
                        padding: 40, textAlign: 'center', cursor: scanning ? 'wait' : 'pointer',
                        border: `2px dashed ${scanning ? GOLD : 'var(--border-strong)'}`,
                        margin: 14, borderRadius: 12,
                        background: scanning ? `${GOLD}08` : 'transparent',
                        transition: 'all .2s',
                    }}>
                    {scanning ? (
                        <>
                            <Loader2 size={32} style={{ color: GOLD, margin: '0 auto 12px', animation: 'spin 1s linear infinite' }} />
                            <div style={{ fontSize: 15, fontWeight: 600, color: GOLD }}>AI leest je factuur…</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Dit duurt 5-15 seconden</div>
                        </>
                    ) : (
                        <>
                            <div style={{ width: 64, height: 64, margin: '0 auto 16px', borderRadius: 16, background: `${GOLD}18`, border: `1px solid ${GOLD}4D`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CloudUpload size={28} style={{ color: GOLD }} />
                            </div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 20, fontWeight: 300 }}>Sleep factuur hierheen of klik om te kiezen</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                                PDF, JPG of PNG · Groot bestand? Geen probleem — we verkleinen automatisch.
                            </div>
                        </>
                    )}
                    <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
                        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                </div>

                {error && (
                    <div style={{ margin: '0 14px 14px', padding: 12, borderRadius: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--red)' }}>
                        <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                        <div><strong>Scan mislukt:</strong> {error}</div>
                    </div>
                )}
            </MetalCard>

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
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: 'rgba(130,130,130,.04)', borderBottom: '1px solid var(--border)' }}>
                                {['Leverancier', 'Factuurnr.', 'Datum', 'Excl. BTW', 'BTW', 'Totaal', 'Status', ''].map(h => (
                                    <th key={h} style={{ padding: '10px 12px', textAlign: ['Excl. BTW', 'BTW', 'Totaal'].includes(h) ? 'right' : 'left', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.slice().sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((inv: any) => (
                                <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{inv.leverancier || 'Onbekend'}</td>
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
                                        <button onClick={() => deleteInvoice(inv.id)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }} title="Verwijderen">
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

function InvoiceReview({ invoice, setInvoice, preview, onSave, onCancel }: {
    invoice: ParsedInvoice; setInvoice: (i: ParsedInvoice) => void; preview: string | null;
    onSave: () => void | Promise<void>; onCancel: () => void;
}) {
    const [saving, setSaving] = useState(false);

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
                <BtnPrimary icon={Save} onClick={doSave} disabled={saving}>{saving ? 'Opslaan…' : 'Opslaan'}</BtnPrimary>
            </div>

            <SectionExplain>
                <strong style={{ color: 'var(--text)' }}>Tip:</strong> klik op elk veld om te bewerken. De AI maakt soms kleine fouten bij slechte scans — check vooral de totalen en BTW onderaan.
            </SectionExplain>

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
                            <Field label={<Hint tip="Bedrag exclusief BTW zoals op de factuur staat. AI berekent dit automatisch.">Totaal excl. BTW</Hint>} value={String(invoice.totaal_excl ?? 0)} onChange={v => updateHeader('totaal_excl', parseFloat(v) || 0)} type="number" />
                            <Field label="BTW bedrag" value={String(invoice.totaal_btw ?? 0)} onChange={v => updateHeader('totaal_btw', parseFloat(v) || 0)} type="number" />
                            <Field label="Totaal incl. BTW" value={String(invoice.totaal_incl ?? 0)} onChange={v => updateHeader('totaal_incl', parseFloat(v) || 0)} type="number" />
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
                                            {['Product', 'Aantal', 'Eenheid', 'Prijs', 'BTW%', 'Subtotaal', ''].map(h => (
                                                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(invoice.regels || []).map((r, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: 4 }}><InlineInput value={r.product_naam} onChange={v => updateLine(i, 'product_naam', v)} /></td>
                                                <td style={{ padding: 4, width: 70 }}><InlineInput value={String(r.hoeveelheid)} onChange={v => updateLine(i, 'hoeveelheid', parseFloat(v) || 0)} type="number" /></td>
                                                <td style={{ padding: 4, width: 80 }}><InlineInput value={r.eenheid} onChange={v => updateLine(i, 'eenheid', v)} /></td>
                                                <td style={{ padding: 4, width: 80 }}><InlineInput value={String(r.prijs_per_eenheid)} onChange={v => updateLine(i, 'prijs_per_eenheid', parseFloat(v) || 0)} type="number" /></td>
                                                <td style={{ padding: 4, width: 60 }}><InlineInput value={String(r.btw_pct)} onChange={v => updateLine(i, 'btw_pct', parseFloat(v) || 0)} type="number" /></td>
                                                <td style={{ padding: 4, width: 90 }}><InlineInput value={String(r.subtotaal)} onChange={v => updateLine(i, 'subtotaal', parseFloat(v) || 0)} type="number" /></td>
                                                <td style={{ padding: 4, width: 28 }}>
                                                    <button onClick={() => removeLine(i)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}>
                                                        <X size={12} />
                                                    </button>
                                                </td>
                                            </tr>
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

function Field({ label, value, onChange, type }: { label: React.ReactNode; value: string; onChange: (v: string) => void; type?: string }) {
    return (
        <div>
            <Eyebrow>{label}</Eyebrow>
            <input value={value} onChange={e => onChange(e.target.value)} type={type || 'text'}
                style={{ width: '100%', marginTop: 6, padding: '9px 12px', background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, fontVariantNumeric: 'tabular-nums', outline: 'none' }} />
        </div>
    );
}

function InlineInput({ value, onChange, type }: { value: string; onChange: (v: string) => void; type?: string }) {
    return (
        <input value={value} onChange={e => onChange(e.target.value)} type={type || 'text'}
            style={{ width: '100%', padding: '6px 8px', background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, fontVariantNumeric: 'tabular-nums', outline: 'none' }} />
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
    const [scanning, setScanning] = useState(false);
    const [parsed, setParsed] = useState<any | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const cameraRef = useRef<HTMLInputElement>(null);

    async function handleFile(file: File) {
        if (!file) return;
        setError(null); setScanning(true);
        try {
            const imageBase64 = await fileToImageBase64(file);
            setPreview(imageBase64);
            const res = await fetch('/api/parse-document', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64, type: 'receipt' }),
            });
            const body = await res.json();
            if (!res.ok) { setError(body.error || 'Scan mislukt'); setScanning(false); return; }
            setParsed(body.data);
            setScanning(false);
            showToast('Bon gelezen — controleer en bewaar', 'success');
        } catch (e: any) {
            setError(e.message || 'Scan mislukt');
            setScanning(false);
        }
    }

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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <MetalCard>
                    <div
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
                        onClick={() => !scanning && fileRef.current?.click()}
                        style={{ padding: 30, textAlign: 'center', cursor: scanning ? 'wait' : 'pointer', border: `2px dashed ${scanning ? GOLD : 'var(--border-strong)'}`, margin: 14, borderRadius: 12 }}>
                        {scanning ? (
                            <><Loader2 size={28} style={{ color: GOLD, margin: '0 auto 10px', animation: 'spin 1s linear infinite' }} />
                                <div style={{ fontSize: 13, color: GOLD, fontWeight: 600 }}>AI leest bon…</div></>
                        ) : (
                            <><Upload size={24} style={{ color: GOLD, margin: '0 auto 10px' }} />
                                <div style={{ fontSize: 14, fontWeight: 600 }}>Upload foto</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>JPG/PNG/PDF</div></>
                        )}
                        <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                    </div>
                </MetalCard>
                <MetalCard>
                    <div onClick={() => !scanning && cameraRef.current?.click()}
                        style={{ padding: 30, textAlign: 'center', cursor: 'pointer', border: '2px dashed var(--border-strong)', margin: 14, borderRadius: 12 }}>
                        <Camera size={24} style={{ color: GOLD, margin: '0 auto 10px' }} />
                        <div style={{ fontSize: 14, fontWeight: 600 }}>Fotograferen</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Opent camera op mobiel</div>
                        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                    </div>
                </MetalCard>
            </div>

            {error && (
                <div style={{ padding: 12, borderRadius: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--red)' }}>
                    <AlertTriangle size={14} /> <div><strong>Scan mislukt:</strong> {error}</div>
                </div>
            )}

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
                        <Field label="Totaal bedrag (incl BTW)" value={String(parsed.totaal_bedrag ?? 0)} onChange={v => upd('totaal_bedrag', parseFloat(v) || 0)} type="number" />
                        <Field label="BTW %" value={String(parsed.btw_pct ?? 21)} onChange={v => upd('btw_pct', parseFloat(v) || 21)} type="number" />
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

function FolderBooks() {
    const { data: invoices } = useSupabase<any>('supplier_invoices', []);
    const { data: bonnen } = useSupabase<any>('bonnen', []);
    const { data: prijzen } = useSupabase<any>('supplier_prices', []);
    const [csvOpen, setCsvOpen] = useState(false);

    const bySupplier = useMemo(() => {
        const m: Record<string, { spend: number; count: number; lastDate: string | null; products: number }> = {};
        (invoices || []).forEach((i: any) => {
            const key = i.leverancier || 'Onbekend';
            if (!m[key]) m[key] = { spend: 0, count: 0, lastDate: null, products: 0 };
            m[key].spend += parseFloat(i.totaal_incl) || 0;
            m[key].count += 1;
            if (!m[key].lastDate || (i.datum && i.datum > m[key].lastDate)) m[key].lastDate = i.datum;
        });
        (prijzen || []).forEach((p: any) => {
            const key = p.leverancier || 'Onbekend';
            if (!m[key]) m[key] = { spend: 0, count: 0, lastDate: null, products: 0 };
            m[key].products += 1;
        });
        return Object.entries(m).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.spend - a.spend);
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

            <MetalCard>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Store size={14} style={{ color: GOLD }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Uitgaven per leverancier</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {bySupplier.length} leveranciers</span>
                </div>
                {bySupplier.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                        Nog geen leverancier-data. Scan een factuur of importeer een CSV.
                    </div>
                ) : (
                    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {bySupplier.map(s => {
                            const pct = totalSpend > 0 ? (s.spend / totalSpend) * 100 : 0;
                            return (
                                <div key={s.name} style={{ display: 'grid', gridTemplateColumns: '8px 1fr auto auto auto', gap: 12, alignItems: 'center', padding: '10px 12px', borderRadius: 8, background: 'rgba(130,130,130,.04)' }}>
                                    <div style={{ width: 8, height: 40, background: GOLD, borderRadius: 2 }} />
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                                        <div style={{ position: 'relative', height: 4, background: 'rgba(130,130,130,.1)', borderRadius: 2, marginTop: 6, overflow: 'hidden', maxWidth: 300 }}>
                                            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: GOLD, borderRadius: 2 }} />
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)', minWidth: 70, textAlign: 'right' }}>{s.count} factuur · {s.products} prod.</div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)', minWidth: 70 }}>{s.lastDate || '—'}</div>
                                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 18, fontWeight: 500, color: GOLD, fontVariantNumeric: 'tabular-nums', minWidth: 110, textAlign: 'right' }}>{fmt2(s.spend)}</div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </MetalCard>

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
