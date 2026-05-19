/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useMemo, useEffect } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { fmt } from '@/lib/utils';
import BarcodeScanner from '@/components/BarcodeScanner';
import EmptyState from '@/components/EmptyState';
import {
    AlertTriangle, Barcode, Plus, Package, Sparkles,
    X, Search, ShoppingCart, Euro, ArrowUpRight, ArrowLeft, Save, Trash2,
    Printer, PieChart, Clock, CheckCircle, HelpCircle,
    ChevronRight, Link as LinkIcon, History, Info,
    ClipboardCheck, Leaf, Fish, Beef, Milk, Flame, CupSoda,
    ChefHat, CalendarClock, Activity, Store, LineChart, Mail, Copy,
    Download, Zap, Edit3, ScanLine, Carrot, Croissant, ListChecks,
} from 'lucide-react';
import PageGuideNote from '@/components/PageGuideNote';
import type { InventoryItem, Recept, StockMovement } from '@/types';
import { RequireTier } from '@/components/PaywallPrompt';

const GOLD = '#c4a35a';

const CATEGORIEEN = ['Vlees', 'Vis', 'Groenten', 'Zuivel', 'Kruiden', 'Sauzen', 'Dranken', 'Brood', 'Hout', 'Overig'] as const;
const EENHEDEN = ['kg', 'g', 'L', 'ml', 'stuks', 'bos', 'pot', 'fles', 'zak', 'doos', 'krat', 'bakje'] as const;

const CAT_META: Record<string, { color: string; icon: any }> = {
    Vlees: { color: 'var(--red)', icon: Beef },
    Vis: { color: '#4ECDC4', icon: Fish },
    Groenten: { color: '#22c55e', icon: Carrot },
    Zuivel: { color: '#FFBF00', icon: Milk },
    Kruiden: { color: '#a78bfa', icon: Leaf },
    Sauzen: { color: '#f97316', icon: Flame },
    Dranken: { color: '#3b82f6', icon: CupSoda },
    Brood: { color: '#c4a35a', icon: Croissant },
    Hout: { color: '#9e781c', icon: Flame },
    Overig: { color: '#949494', icon: Package },
};

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */
function stockStatus(item: InventoryItem) {
    const cur = Number(item.current_stock || 0);
    const reorder = Number(item.min_stock || 0);
    const par = Number(item.par_level || 0);
    if (cur === 0) return { key: 'out', label: 'Op', color: 'var(--red)', bg: 'rgba(239,68,68,.12)', br: 'rgba(239,68,68,.35)', pct: 0 };
    if (cur <= reorder) return { key: 'low', label: 'Laag', color: 'var(--amber)', bg: 'rgba(245,158,11,.12)', br: 'rgba(245,158,11,.3)', pct: par > 0 ? (cur / par) * 100 : 50 };
    if (par > 0 && cur >= par * 0.85) return { key: 'ok', label: 'Voldoende', color: 'var(--green)', bg: 'rgba(34,197,94,.1)', br: 'rgba(34,197,94,.25)', pct: Math.min(100, (cur / par) * 100) };
    return { key: 'mid', label: 'Op peil', color: 'var(--muted)', bg: 'transparent', br: 'var(--border)', pct: par > 0 ? Math.min(100, (cur / par) * 100) : 100 };
}

function stockValue(item: InventoryItem) {
    return Number(item.current_stock || 0) * Number(item.purchase_price || 0);
}

function daysUntilTHT(thtStr?: string | null): number | null {
    if (!thtStr) return null;
    const tht = new Date(thtStr);
    if (isNaN(tht.getTime())) return null;
    const now = new Date();
    return Math.round((tht.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function coverageDays(item: InventoryItem): number {
    const avg = Number(item.avg_daily || 0);
    if (avg <= 0) return Infinity;
    return Number(item.current_stock || 0) / avg;
}

/* Stable kleur-hash voor leverancier-strings (geen hardcoded SUPPLIER lijst) */
function supplierColor(name: string): string {
    if (!name) return '#949494';
    const palette = ['#FFBF00', '#c4a35a', '#4ECDC4', '#22c55e', '#a78bfa', 'var(--red)', '#f97316', '#3b82f6'];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
    return palette[Math.abs(h) % palette.length];
}

/* ═══════════════════════════════════════════════════════════════════
   ATOMS
   ═══════════════════════════════════════════════════════════════════ */
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
                    background: '#0a0a0c', border: `1px solid ${GOLD}4D`, borderRadius: 8,
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

function MetalCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            ...style,
        }}>{children}</div>
    );
}

function Eyebrow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--muted-light)', fontWeight: 700, textTransform: 'uppercase', ...style }}>{children}</div>
    );
}

function StatTile({ label, value, sub, tone, icon: I }: { label: React.ReactNode; value: React.ReactNode; sub?: string; tone?: 'ok' | 'warn' | 'bad'; icon?: any }) {
    const color = tone === 'ok' ? 'var(--green)' : tone === 'warn' ? 'var(--amber)' : tone === 'bad' ? 'var(--red)' : 'var(--text)';
    return (
        <MetalCard>
            <div style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>{label}</span>
                    {I && <I size={14} style={{ color: 'var(--muted-light)' }} />}
                </div>
                <div style={{ fontFamily: 'Outfit, DM Sans, sans-serif', fontSize: 28, fontWeight: 200, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{value}</div>
                {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
            </div>
        </MetalCard>
    );
}

function Pill({ variant = 'draft', children, onClick, style }: { variant?: 'brand' | 'draft' | 'danger' | 'warn' | 'ok'; children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties }) {
    const variants: Record<string, React.CSSProperties> = {
        brand: { background: `${GOLD}26`, color: GOLD, border: `1px solid ${GOLD}66` },
        draft: { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)' },
        danger: { background: 'rgba(239,68,68,.12)', color: 'var(--red)', border: '1px solid rgba(239,68,68,.35)' },
        warn: { background: 'rgba(245,158,11,.12)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,.35)' },
        ok: { background: 'rgba(34,197,94,.1)', color: 'var(--green)', border: '1px solid rgba(34,197,94,.3)' },
    };
    return (
        <span onClick={onClick} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 100,
            fontSize: 11, fontWeight: 600, cursor: onClick ? 'pointer' : 'default', transition: '.15s',
            ...variants[variant], ...style,
        }}>{children}</span>
    );
}

function BtnPrimary({ children, icon: I, right: R, onClick, style, disabled }: { children: React.ReactNode; icon?: any; right?: any; onClick?: () => void; style?: React.CSSProperties; disabled?: boolean }) {
    return (
        <button onClick={onClick} disabled={disabled} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8,
            background: disabled ? 'var(--muted-light)' : `linear-gradient(180deg, ${GOLD}, #9e781c)`,
            color: '#0a0a0c', fontWeight: 600, fontSize: 12, border: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer', transition: '.15s', opacity: disabled ? 0.5 : 1, ...style,
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
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8,
            background: 'transparent', color: 'var(--text)', fontWeight: 500, fontSize: 12,
            border: '1px solid var(--border)', cursor: 'pointer', transition: '.15s', ...style,
        }}>
            {I && <I size={14} />}
            {children}
            {R && <R size={14} />}
        </button>
    );
}

function SectionExplain({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', marginBottom: 14,
            background: 'rgba(59,130,246,.06)', border: '1px solid rgba(59,130,246,.18)',
            borderLeft: '2px solid rgba(59,130,246,.5)', borderRadius: 10,
            fontSize: 12, color: 'var(--muted)', lineHeight: 1.5,
        }}>
            <Info size={14} style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 1 }} />
            <div>{children}</div>
        </div>
    );
}

function StockBar({ item }: { item: InventoryItem }) {
    const s = stockStatus(item);
    const par = Number(item.par_level || 0);
    const reorder = Number(item.min_stock || 0);
    const reorderPos = par > 0 ? Math.min(100, (reorder / par) * 100) : 0;
    return (
        <div style={{ position: 'relative', height: 6, background: 'rgba(130,130,130,.12)', borderRadius: 3, overflow: 'visible', width: '100%', minWidth: 80 }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, s.pct)}%`, background: s.color, borderRadius: 3, transition: 'width .3s' }} />
            {par > 0 && reorder > 0 && (
                <div style={{ position: 'absolute', left: `${reorderPos}%`, top: -2, bottom: -2, width: 1, background: 'rgba(245,158,11,.55)' }} title="Bestelpunt" />
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
/* P0.24 — VoorraadClient is de Client-body; `<page.tsx>` Server Component
   prefetcht initial-data zodat first paint geen waterfall toont. */
export interface VoorraadInitial {
    inventory?: InventoryItem[];
    recepten?: Recept[];
    supplierPrices?: any[];
    movements?: StockMovement[];
    priceHistory?: Array<{ id: number; inventory_id: number; datum: string; unit_price: number; unit?: string; source: string }>;
}

export default function VoorraadClient({ initial }: { initial?: VoorraadInitial } = {}) {
    const { data: inventory, insert, update, remove } = useSupabase<InventoryItem>('inventory', initial?.inventory ?? []);
    const { data: recepten } = useSupabase<Recept>('recepten', initial?.recepten ?? []);
    const { data: supplierPrices } = useSupabase<any>('supplier_prices', initial?.supplierPrices ?? []);
    const { data: movements } = useSupabase<StockMovement>('stock_movements', initial?.movements ?? []);
    /* price_history wordt door /api/bon-process gevuld bij elke verwerkte bon —
       voedt de prijs-trend grafiek per item zonder dat user iets handmatig hoeft te doen. */
    const { data: priceHistoryRows } = useSupabase<{ id: number; inventory_id: number; datum: string; unit_price: number; unit?: string; source: string }>('price_history', initial?.priceHistory ?? []);
    const showToast = useToast();
    const showConfirm = useConfirm();

    const [view, setView] = useState<'overzicht' | 'tellen' | 'inkooplijst'>('overzicht');
    const [filter, setFilter] = useState<string>('Alles');
    const [search, setSearch] = useState('');
    const [scannerOpen, setScannerOpen] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [editing, setEditing] = useState<number | 'new' | null>(null);
    const [editForm, setEditForm] = useState<any>(null);
    const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
    const [addOpen, setAddOpen] = useState(false);

    /* ───── derived ───── */
    const totalItems = inventory.length;
    const lowStock = useMemo(
        () => inventory.filter(i => ['out', 'low'].includes(stockStatus(i).key)),
        [inventory]
    );
    const outOfStock = useMemo(() => inventory.filter(i => (i.current_stock || 0) === 0), [inventory]);
    const totalValue = useMemo(() => inventory.reduce((s, i) => s + stockValue(i), 0), [inventory]);

    const expiringSoon = useMemo(() => inventory.filter(i => {
        const d = daysUntilTHT(i.tht);
        return d !== null && d >= 0 && d <= 3;
    }), [inventory]);

    const avgCoverage = useMemo(() => {
        const withUse = inventory.filter(i => Number(i.avg_daily || 0) > 0);
        if (withUse.length === 0) return null;
        const total = withUse.reduce((s, i) => s + coverageDays(i), 0);
        return total / withUse.length;
    }, [inventory]);

    const tekortCost = useMemo(
        () => lowStock.reduce((s, i) => {
            const need = Math.max(0, Number(i.par_level || i.min_stock || 0) - Number(i.current_stock || 0));
            return s + need * Number(i.purchase_price || 0);
        }, 0),
        [lowStock]
    );

    const byCategory = useMemo(() => {
        return CATEGORIEEN.map(c => {
            const items = inventory.filter(i => i.categorie === c);
            const value = items.reduce((s, i) => s + stockValue(i), 0);
            return { name: c, count: items.length, value, color: CAT_META[c]?.color || '#949494' };
        }).filter(c => c.count > 0);
    }, [inventory]);

    const filtered = useMemo(() => inventory.filter(i => {
        if (search && !(i.naam || '').toLowerCase().includes(search.toLowerCase())) return false;
        if (filter === 'Alles') return true;
        if (filter === 'Kritiek') return ['out', 'low'].includes(stockStatus(i).key);
        if (filter === 'THT') { const d = daysUntilTHT(i.tht); return d !== null && d >= 0 && d <= 3; }
        if (filter === 'Op peil') return !['out', 'low'].includes(stockStatus(i).key);
        return i.categorie === filter;
    }), [inventory, filter, search]);

    /* ───── stock actions ───── */
    async function logMovement(item: InventoryItem, type: StockMovement['type'], qty: number, note?: string) {
        try {
            const newStock = Math.max(0, Number(item.current_stock || 0) + qty);
            await fetch('/api/_supa/stock-movement', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inventory_id: item.id, type, qty, resulting_stock: newStock, note }),
            }).catch(() => null);  /* logging is best-effort, blokkeert update niet */
        } catch { /* idem */ }
    }

    function quickAdjust(item: InventoryItem, amount: number) {
        const newStock = Math.max(0, (item.current_stock || 0) + amount);
        update(item.id, { current_stock: newStock } as any).then(() => {
            showToast(item.naam + ': ' + newStock + ' ' + item.unit, 'success');
            void logMovement(item, amount > 0 ? 'receive' : 'usage', amount);
        });
    }

    function setStock(item: InventoryItem, newStock: number) {
        const delta = newStock - Number(item.current_stock || 0);
        update(item.id, { current_stock: Math.max(0, newStock) } as any);
        if (delta !== 0) void logMovement(item, 'count', delta, 'Telling-modus');
    }

    function openNewItem() { setAddOpen(true); }

    function openEditItem(item: InventoryItem) {
        setEditForm(JSON.parse(JSON.stringify(item)));
        setEditing(item.id);
    }

    function saveItem() {
        if (!editForm.naam?.trim()) { showToast('Vul een naam in', 'error'); return; }
        if (editing === 'new') {
            /* Client-side dedup-check: voorkom dat user dubbel toevoegt.
               DB heeft sinds migration 028 ook een UNIQUE-index als laatste vangnet. */
            const naamNorm = (editForm.naam as string).trim().toLowerCase();
            const dupe = inventory.find(i => (i.naam || '').trim().toLowerCase() === naamNorm);
            if (dupe) {
                showToast(`"${dupe.naam}" bestaat al in voorraad — bewerk dat item ipv nieuw toe te voegen`, 'error');
                return;
            }
            insert(editForm).then(() => {
                showToast('Item toegevoegd aan voorraad', 'success');
                setEditing(null); setEditForm(null);
            }).catch((e: any) => {
                /* Vangnet voor DB-unique-violation (race-condition) */
                if (String(e?.message || '').includes('ux_inventory_naam_org')) {
                    showToast('Bestaat al — kon niet toevoegen', 'error');
                } else {
                    showToast('Toevoegen mislukt: ' + (e?.message || 'onbekend'), 'error');
                }
            });
        } else {
            const { id, created_at, ...rest } = editForm;
            void id; void created_at;
            update(editing as number, rest).then(() => {
                showToast('Voorraad bijgewerkt', 'success');
                setEditing(null); setEditForm(null);
            });
        }
    }

    function deleteItem() {
        showConfirm('Dit item verwijderen uit de voorraad?', () => {
            remove(editing as number).then(() => {
                showToast('Item verwijderd', 'success');
                setEditing(null); setEditForm(null);
                setSelectedId(null);
            });
        });
    }

    function handleBarcodeScan(barcode: string) {
        setScannerOpen(false);
        const match = inventory.find(i => (i.naam || '').toLowerCase().includes(barcode.toLowerCase()));
        if (match) {
            setSelectedId(match.id);
            showToast('Gevonden: ' + match.naam, 'success');
        } else {
            showToast('Product niet gevonden — voeg handmatig toe', 'error');
        }
    }

    /* ───── PDF export ───── */
    async function exportPDF() {
        const { default: jsPDF } = await import('jspdf');
        const autoTable = (await import('jspdf-autotable')).default;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        doc.setFillColor(18, 18, 20); doc.rect(0, 0, 210, 30, 'F');
        doc.setTextColor(196, 163, 90);
        doc.setFontSize(20); doc.text('Voorraadlijst', 14, 14);
        doc.setTextColor(148, 148, 148);
        doc.setFontSize(9); doc.text('Hop & Bites · Smart Inventory', 14, 20);
        const today = new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' });
        doc.text(today, 196, 20, { align: 'right' });

        doc.setTextColor(60, 60, 60);
        doc.setFontSize(10);
        let y = 40;
        doc.text(`Totaal producten: ${totalItems}`, 14, y);
        doc.text(`Onder par-level: ${lowStock.length}`, 75, y);
        doc.text(`Waarde: ${fmt(totalValue)}`, 140, y);
        y += 10;

        byCategory.forEach(cat => {
            const items = inventory.filter(i => i.categorie === cat.name);
            if (items.length === 0) return;
            autoTable(doc, {
                startY: y,
                head: [[cat.name.toUpperCase(), 'VOORRAAD', 'PAR', 'PRIJS', 'WAARDE', 'LEVERANCIER', 'STATUS']],
                body: items.map(i => {
                    const s = stockStatus(i);
                    return [
                        i.naam,
                        `${i.current_stock} ${i.unit}`,
                        `${i.par_level || i.min_stock} ${i.unit}`,
                        fmt(i.purchase_price || 0),
                        fmt(stockValue(i)),
                        i.supplier || '—',
                        s.label,
                    ];
                }),
                theme: 'striped',
                headStyles: { fillColor: [196, 163, 90], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
                bodyStyles: { fontSize: 9 },
                margin: { left: 14, right: 14 },
            });
            y = (doc as any).lastAutoTable.finalY + 8;
        });

        doc.setFontSize(8); doc.setTextColor(148, 148, 148);
        doc.text(`Gegenereerd door BBQ Architect · ${new Date().toLocaleString('nl-NL')}`, 14, 287);
        doc.save(`voorraadlijst-${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('PDF gedownload', 'success');
    }

    /* ───── AI advies-rapport (uitgebreid, voor drawer) ───── */
    const [aiReport, setAiReport] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);

    async function generateAIReport() {
        setAiDrawerOpen(true);
        setAiLoading(true);
        setAiReport(null);
        await new Promise(r => setTimeout(r, 600));
        const lines: string[] = [];
        lines.push(`**Voorraad-analyse · ${new Date().toLocaleDateString('nl-NL')}**\n`);
        lines.push(`Je hebt **${totalItems} producten** met een totale waarde van **${fmt(totalValue)}**.`);
        if (lowStock.length > 0) {
            lines.push(`\n## Urgent — onder par-level`);
            lines.push(`**${lowStock.length} items** moeten worden bijbesteld. Geschatte inkoop: **${fmt(tekortCost)}**.\n`);
            lowStock.slice(0, 8).forEach(i => {
                const par = i.par_level || i.min_stock || 0;
                lines.push(`- **${i.naam}** — ${i.current_stock}/${par} ${i.unit} · ${i.supplier || 'geen lev.'}`);
            });
        } else {
            lines.push(`\nAlle voorraden zijn op peil.`);
        }
        if (expiringSoon.length > 0) {
            lines.push(`\n## THT-alert (≤3 dagen)`);
            expiringSoon.forEach(i => {
                const d = daysUntilTHT(i.tht);
                lines.push(`- **${i.naam}** — nog ${d} dag(en) · ${i.current_stock} ${i.unit} verwerken`);
            });
        }
        const bySupplier: Record<string, InventoryItem[]> = {};
        lowStock.forEach(i => {
            const sup = i.supplier || 'Onbekend';
            (bySupplier[sup] ||= []).push(i);
        });
        if (Object.keys(bySupplier).length > 0) {
            lines.push(`\n## Bestel-voorstel (gebundeld)`);
            Object.entries(bySupplier).forEach(([sup, items]) => {
                const t = items.reduce((s, i) => s + ((Number(i.par_level || i.min_stock) - Number(i.current_stock)) * Number(i.purchase_price || 0)), 0);
                lines.push(`- **${sup}** · ${items.length} item(s) · ± ${fmt(t)}`);
            });
        }
        const topValue = [...inventory].sort((a, b) => stockValue(b) - stockValue(a)).slice(0, 3);
        if (topValue.length > 0) {
            lines.push(`\n## Grootste voorraadwaarde`);
            topValue.forEach(i => lines.push(`- **${i.naam}** — ${fmt(stockValue(i))} (${i.current_stock} ${i.unit})`));
        }
        lines.push(`\n## Aanbevelingen`);
        if (lowStock.length > 3) lines.push(`- Plan een wekelijks telling-moment.`);
        lines.push(`- Koppel recepten aan ingrediënten zodat verbruik automatisch update.`);
        if (supplierPrices && supplierPrices.length > 0) lines.push(`- Open Price Intelligence om de goedkoopste leverancier per product te zien.`);
        setAiReport(lines.join('\n'));
        setAiLoading(false);
    }

    /* ═══════════════════════════════════════════════════════════════════
       RENDER — sub-views first
       ═══════════════════════════════════════════════════════════════════ */
    if (editing !== null && editForm) {
        return <EditItemView
            editForm={editForm} setEditForm={setEditForm}
            editing={editing} recepten={recepten}
            onSave={saveItem} onDelete={deleteItem}
            onClose={() => { setEditing(null); setEditForm(null); }}
        />;
    }

    if (view === 'tellen') {
        return <CountMode
            inventory={inventory} byCategory={byCategory}
            onSetStock={setStock}
            onClose={() => setView('overzicht')}
        />;
    }

    if (view === 'inkooplijst') {
        return <InkooplijstView
            inventory={inventory}
            onClose={() => setView('overzicht')}
            onExport={exportPDF}
        />;
    }

    return (
        <RequireTier feature="voorraad">
            <div className="mobile-safe-bottom" style={{ padding: '24px var(--space-mobile-edge) 32px', maxWidth: 1440, margin: '0 auto' }}>

                <PageGuideNote
                    id="voorraad"
                    accent="#84cc16"
                    icon={Package}
                    intro="Real-time voorraadstand: wat heb je liggen, wat staat onder par-level, en wat moet binnen 3 dagen op?"
                    actions={[
                        { lead: 'Tellen of Scannen', text: 'om snel te updaten — handmatig of met je telefooncamera.' },
                        { lead: 'AI Advies rechtsboven', text: 'stelt bestelhoeveelheden voor op basis van je geplande events.' },
                        { lead: 'Klik op een item', text: 'voor details, alternatieve leveranciers en prijshistorie per kilo.' },
                    ]}
                />
                <div style={{ height: 18 }} />
                <HeroHeader
                    totalItems={totalItems}
                    lowStockCount={lowStock.length}
                    expiringCount={expiringSoon.length}
                    avgCoverage={avgCoverage}
                    totalValue={totalValue}
                    onTell={() => setView('tellen')}
                    onScan={() => setScannerOpen(true)}
                    onPDF={exportPDF}
                    onAI={generateAIReport}
                    onAdd={openNewItem}
                />

                {totalItems === 0 ? (
                    <>
                        <div style={{ height: 20 }} />
                        <EmptyState page="/voorraad" onAction={openNewItem} />
                    </>
                ) : (
                    <>
                        <div style={{ height: 20 }} />
                        <AIAssistantBar inventory={inventory} />

                        <div style={{ height: 20 }} />
                        <ActionPanel
                            lowStock={lowStock}
                            expiring={expiringSoon}
                            inventory={inventory}
                            onOpenItem={setSelectedId}
                            onOpenBuyList={() => setView('inkooplijst')}
                            onAdjust={quickAdjust}
                        />

                        {byCategory.length > 1 && (
                            <>
                                <div style={{ height: 20 }} />
                                <CategoryChart categories={byCategory} />
                            </>
                        )}

                        <div style={{ height: 20 }} />
                        <FilterBar
                            search={search} setSearch={setSearch}
                            filter={filter} setFilter={setFilter}
                            counts={{
                                all: totalItems,
                                kritiek: lowStock.length,
                                tht: expiringSoon.length,
                                peil: totalItems - lowStock.length,
                            }}
                        />

                        <div style={{ height: 14 }} />
                        <ProductTable
                            items={filtered}
                            onOpenItem={setSelectedId}
                            onAdjust={quickAdjust}
                        />
                    </>
                )}

                {selectedId !== null && (
                    <ItemDetailDrawer
                        item={inventory.find(i => i.id === selectedId)!}
                        supplierPrices={supplierPrices || []}
                        recepten={recepten || []}
                        movements={(movements || []).filter((m: any) => m.inventory_id === selectedId)}
                        bonPriceHistory={(priceHistoryRows || []).filter(p => p.inventory_id === selectedId)}
                        onClose={() => setSelectedId(null)}
                        onAdjust={quickAdjust}
                        onEdit={() => {
                            const it = inventory.find(i => i.id === selectedId);
                            if (it) { setSelectedId(null); openEditItem(it); }
                        }}
                    />
                )}

                {addOpen && (
                    <AddItemModal
                        onClose={() => setAddOpen(false)}
                        onSave={(data: any) => {
                            insert(data).then(() => {
                                showToast('Item toegevoegd', 'success');
                                setAddOpen(false);
                            });
                        }}
                    />
                )}

                {aiDrawerOpen && (
                    <AIReportDrawer
                        loading={aiLoading}
                        report={aiReport}
                        onClose={() => setAiDrawerOpen(false)}
                        onRegenerate={generateAIReport}
                    />
                )}

                <BarcodeScanner isOpen={scannerOpen} onScan={handleBarcodeScan} onClose={() => setScannerOpen(false)} />
            </div>
        </RequireTier>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   HERO HEADER — 5 KPI tiles (mockup-style)
   ═══════════════════════════════════════════════════════════════════ */
function HeroHeader({ totalItems, lowStockCount, expiringCount, avgCoverage, totalValue, onTell, onScan, onPDF, onAI, onAdd }: any) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <h1 style={{ fontFamily: 'Outfit, DM Sans, sans-serif', fontWeight: 200, fontSize: 34, letterSpacing: '-.015em', margin: '0 0 4px' }}>Voorraad</h1>
                    <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                        {totalItems} producten · live gesynct · altijd zicht op wat je nodig hebt
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <BtnGhost icon={Barcode} onClick={onScan}>Scan</BtnGhost>
                    <BtnGhost icon={ScanLine} onClick={onTell} style={{ padding: '6px 12px', fontSize: 11 }}>Tellen</BtnGhost>
                    <BtnGhost icon={Printer} onClick={onPDF} style={{ padding: '6px 12px', fontSize: 11 }}>Voorraadlijst PDF</BtnGhost>
                    <BtnGhost icon={Sparkles} right={ArrowUpRight} onClick={onAI} style={{ borderColor: `${GOLD}66`, color: GOLD }}>AI Advies</BtnGhost>
                    <BtnPrimary icon={Plus} onClick={onAdd}>Item toevoegen</BtnPrimary>
                </div>
            </div>

            <div className="voorraad-kpi-grid">
                <StatTile
                    label="Voorraadwaarde"
                    value={fmt(totalValue)}
                    sub={`${totalItems} SKU's actief`}
                    icon={Euro}
                />
                <StatTile
                    label={<Hint tip="Producten waar de huidige voorraad onder of op het bestelpunt staat. Tijd om bij te bestellen.">Onder par-level</Hint>}
                    value={lowStockCount}
                    sub={lowStockCount > 0 ? 'actie vereist' : 'alles op peil'}
                    tone={lowStockCount > 3 ? 'bad' : lowStockCount > 0 ? 'warn' : 'ok'}
                    icon={AlertTriangle}
                />
                <StatTile
                    label={<Hint tip="Tenminste Houdbaar Tot. Producten waarvan THT binnen 3 dagen verloopt — eerst gebruiken.">THT ≤ 3 dagen</Hint>}
                    value={expiringCount}
                    sub={expiringCount > 0 ? 'direct gebruiken' : 'niets bederft'}
                    tone={expiringCount > 0 ? 'warn' : 'ok'}
                    icon={Clock}
                />
                <StatTile
                    label={<Hint tip="Hoeveel dagen je gemiddeld nog uithoud bij huidig dagelijks verbruik. Wordt berekend zodra je verbruik logt.">Gem. dekking</Hint>}
                    value={avgCoverage === null ? '—' : avgCoverage === Infinity ? '∞' : `${avgCoverage.toFixed(1)}d`}
                    sub={avgCoverage === null ? 'log verbruik' : 'bij huidig tempo'}
                    icon={CalendarClock}
                />
                <StatTile
                    label="AI-tip"
                    value={lowStockCount > 0 ? 'Bestel nu' : 'Alles ok'}
                    sub={lowStockCount > 0 ? 'klik AI Advies' : 'geen actie'}
                    tone={lowStockCount > 0 ? 'warn' : 'ok'}
                    icon={Sparkles}
                />
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   AI ASSISTANT BAR — quick-action pills + Q&A
   ═══════════════════════════════════════════════════════════════════ */
function AIAssistantBar({ inventory }: { inventory: InventoryItem[] }) {
    const [q, setQ] = useState('');
    const [answering, setAnswering] = useState(false);
    const [response, setResponse] = useState<string | null>(null);

    const quickActions = [
        { label: 'Wat is bijna op?', q: 'Welke producten zijn deze week bijna op?' },
        { label: 'Maak bestellijst', q: 'Genereer een bestellijst per leverancier voor alles onder par-level.' },
        { label: 'Wat bederft eerst?', q: 'Welke producten moet ik als eerste gebruiken op basis van THT?' },
        { label: 'Dure langzaamlopers?', q: 'Welke dure items hebben lage omloopsnelheid?' },
    ];

    async function ask(question: string) {
        if (!question.trim()) return;
        setQ(question);
        setAnswering(true);
        setResponse(null);
        try {
            const ctx = inventory.slice(0, 80).map(i => {
                const s = stockStatus(i);
                const tht = daysUntilTHT(i.tht);
                return `- ${i.naam} (${i.categorie}): ${i.current_stock}/${i.par_level || i.min_stock} ${i.unit}, status=${s.label}, lev=${i.supplier || '—'}${tht !== null ? `, THT=${tht}d` : ''}`;
            }).join('\n');
            const res = await fetch('/api/voorraad-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, snapshot: ctx }),
            });
            const body = await res.json();
            if (body.success && body.text) setResponse(body.text);
            else setResponse(body.error || 'Geen antwoord ontvangen.');
        } catch (e: any) {
            setResponse('Kon AI niet bereiken: ' + (e?.message || 'fout'));
        }
        setAnswering(false);
    }

    return (
        <MetalCard>
            <div style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: response || answering ? 14 : 0 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `${GOLD}1f`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Sparkles size={15} style={{ color: GOLD }} />
                    </div>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <input
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') ask(q); }}
                            placeholder="Vraag de AI: wat moet ik nu bestellen, wat bederft, hoeveel marge laat ik liggen…"
                            style={{ width: '100%', paddingLeft: 14, paddingRight: 100, fontSize: 13, height: 40, borderRadius: 8, background: 'var(--color-bg-deep)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
                        />
                        <button onClick={() => ask(q)} disabled={!q.trim() || answering} style={{
                            position: 'absolute', right: 6, top: 6, height: 28, padding: '0 12px',
                            borderRadius: 6, background: q.trim() && !answering ? `linear-gradient(180deg, ${GOLD}, #9e781c)` : 'var(--muted-light)',
                            color: '#0a0a0c', fontWeight: 600, fontSize: 11, border: 'none',
                            cursor: q.trim() && !answering ? 'pointer' : 'not-allowed',
                        }}>
                            {answering ? 'AI denkt…' : 'Vraag AI'}
                        </button>
                    </div>
                </div>

                {!response && !answering && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {quickActions.map(a => (
                            <Pill key={a.label} variant="draft" onClick={() => ask(a.q)} style={{ cursor: 'pointer' }}>
                                <Zap size={10} /> {a.label}
                            </Pill>
                        ))}
                    </div>
                )}

                {(answering || response) && (
                    <div style={{ marginTop: 4, padding: 14, borderRadius: 10, background: `${GOLD}10`, border: `1px solid ${GOLD}33`, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {answering ? (
                            <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>De AI analyseert je voorraad…</div>
                        ) : response}
                        {response && (
                            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 11, color: GOLD, fontWeight: 500 }}>AI antwoord · op basis van live voorraad</span>
                                <button onClick={() => { setResponse(null); setQ(''); }} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Wissen</button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </MetalCard>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   ACTION PANEL — 3 cards (under-par, THT, AI bestelvoorstel)
   ═══════════════════════════════════════════════════════════════════ */
function ActionPanel({ lowStock, expiring, inventory, onOpenItem, onOpenBuyList, onAdjust }: { lowStock: InventoryItem[]; expiring: InventoryItem[]; inventory: InventoryItem[]; onOpenItem: (id: number) => void; onOpenBuyList: () => void; onAdjust: (item: InventoryItem, amount: number) => void }) {
    /* AI bundel-voorstel: groepeer onder-par per leverancier */
    const bySupplier: Record<string, { id: string; name: string; color: string; items: InventoryItem[]; total: number }> = {};
    lowStock.forEach(p => {
        const sup = p.supplier || 'Onbekend';
        if (!bySupplier[sup]) bySupplier[sup] = { id: sup, name: sup, color: supplierColor(sup), items: [], total: 0 };
        const need = Math.max(0, Number(p.par_level || p.min_stock || 0) - Number(p.current_stock || 0));
        bySupplier[sup].items.push(p);
        bySupplier[sup].total += need * Number(p.purchase_price || 0);
    });
    const supplierList = Object.values(bySupplier).sort((a, b) => b.items.length - a.items.length);
    const topSupplier = supplierList[0];

    void inventory;  /* placeholder voor future use */

    return (
        <div className="voorraad-action-grid">
            {/* Card 1 — Onder par-level */}
            <MetalCard style={{ borderColor: lowStock.length > 0 ? 'rgba(239,68,68,.3)' : undefined }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: lowStock.length > 0 ? 'rgba(239,68,68,.04)' : 'transparent' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: lowStock.length > 0 ? 'rgba(239,68,68,.15)' : 'rgba(34,197,94,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${lowStock.length > 0 ? 'rgba(239,68,68,.3)' : 'rgba(34,197,94,.25)'}` }}>
                        {lowStock.length > 0 ? <AlertTriangle size={15} style={{ color: 'var(--red)' }} /> : <CheckCircle size={15} style={{ color: 'var(--green)' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Onder par-level</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{lowStock.length} item(s) moeten worden bijbesteld</div>
                    </div>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300, color: lowStock.length > 0 ? 'var(--red)' : 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>{lowStock.length}</div>
                </div>
                <div style={{ padding: 10, maxHeight: 220, overflow: 'auto' }}>
                    {lowStock.length === 0 ? (
                        <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                            <CheckCircle size={24} style={{ color: 'var(--green)', marginBottom: 8 }} />
                            <div>Alles op peil. Goed bezig.</div>
                        </div>
                    ) : lowStock.slice(0, 5).map(p => {
                        const s = stockStatus(p);
                        const meta = CAT_META[p.categorie] || CAT_META.Overig;
                        const par = p.par_level || p.min_stock || 0;
                        return (
                            <div key={p.id} style={{
                                display: 'grid', gridTemplateColumns: '3px 1fr auto auto', gap: 8, alignItems: 'center',
                                padding: '8px 10px', borderRadius: 8, transition: 'background .12s',
                            }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <div style={{ width: 3, height: 24, background: meta.color, borderRadius: 2 }} />
                                <div onClick={() => onOpenItem(p.id)} style={{ minWidth: 0, cursor: 'pointer' }}>
                                    <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.naam}</div>
                                    <div style={{ fontSize: 10, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{p.current_stock} / {par} {p.unit}</div>
                                </div>
                                {/* Inline quick-adjust: +1 stelt voorraad +1 zonder modal te openen */}
                                <div style={{ display: 'flex', gap: 2 }}>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); onAdjust(p, -1); }}
                                        title={'-1 ' + p.unit + ' (verbruik)'}
                                        aria-label={p.naam + ' min 1'}
                                        style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >−</button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); onAdjust(p, 1); }}
                                        title={'+1 ' + p.unit + ' (ontvangst)'}
                                        aria-label={p.naam + ' plus 1'}
                                        style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(34,197,94,.08)', color: 'var(--green)', cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >+</button>
                                </div>
                                <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', background: s.bg, color: s.color, border: `1px solid ${s.br}` }}>{s.label}</span>
                            </div>
                        );
                    })}
                    {lowStock.length > 5 && (
                        <div style={{ textAlign: 'center', padding: 8, fontSize: 11, color: 'var(--muted)' }}>+ {lowStock.length - 5} meer in tabel hieronder</div>
                    )}
                </div>
            </MetalCard>

            {/* Card 2 — THT alert */}
            <MetalCard style={{ borderColor: expiring.length > 0 ? 'rgba(245,158,11,.3)' : undefined }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: expiring.length > 0 ? 'rgba(245,158,11,.04)' : 'transparent' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: expiring.length > 0 ? 'rgba(245,158,11,.15)' : 'rgba(34,197,94,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${expiring.length > 0 ? 'rgba(245,158,11,.3)' : 'rgba(34,197,94,.25)'}` }}>
                        <Clock size={15} style={{ color: expiring.length > 0 ? 'var(--amber)' : 'var(--green)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                            <Hint tip="Tenminste Houdbaar Tot. We tonen producten waarvan de datum binnen 3 dagen verloopt. Gebruik eerst op (FIFO) of verwerk in iets.">THT alert</Hint>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{expiring.length} producten ≤ 3 dagen houdbaar</div>
                    </div>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300, color: expiring.length > 0 ? 'var(--amber)' : 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>{expiring.length}</div>
                </div>
                <div style={{ padding: 10, maxHeight: 220, overflow: 'auto' }}>
                    {expiring.length === 0 ? (
                        <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                            <CheckCircle size={24} style={{ color: 'var(--green)', marginBottom: 8 }} />
                            <div>Geen producten die bijna verlopen.</div>
                        </div>
                    ) : expiring.slice(0, 5).map(p => {
                        const d = daysUntilTHT(p.tht);
                        const meta = CAT_META[p.categorie] || CAT_META.Overig;
                        const urgency = d === 0 ? { c: 'var(--red)', l: 'VANDAAG' } : d === 1 ? { c: 'var(--red)', l: 'MORGEN' } : { c: 'var(--amber)', l: `${d} DGN` };
                        return (
                            <div key={p.id} onClick={() => onOpenItem(p.id)} style={{
                                display: 'grid', gridTemplateColumns: '3px 1fr auto', gap: 10, alignItems: 'center',
                                padding: '8px 10px', borderRadius: 8, cursor: 'pointer', transition: 'background .12s',
                            }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <div style={{ width: 3, height: 24, background: meta.color, borderRadius: 2 }} />
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.naam}</div>
                                    <div style={{ fontSize: 10, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>voorraad: {p.current_stock} {p.unit}</div>
                                </div>
                                <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', background: `${urgency.c}22`, color: urgency.c, border: `1px solid ${urgency.c}55` }}>{urgency.l}</span>
                            </div>
                        );
                    })}
                </div>
            </MetalCard>

            {/* Card 3 — AI bestelvoorstel */}
            <MetalCard style={{ position: 'relative', overflow: 'hidden', borderColor: `${GOLD}4D` }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: `${GOLD}10` }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `${GOLD}26`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${GOLD}4D` }}>
                        <Sparkles size={15} style={{ color: GOLD }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>AI bestelvoorstel</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>Gebundeld per leverancier — bespaar leveringen</div>
                    </div>
                    <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', background: `${GOLD}26`, color: GOLD, border: `1px solid ${GOLD}4D` }}>KLAAR</span>
                </div>
                <div style={{ padding: 14 }}>
                    {topSupplier ? (
                        <>
                            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 12 }}>
                                <strong style={{ color: 'var(--text)' }}>{topSupplier.items.length} item(s) bij {topSupplier.name}</strong>. Samen bestellen = één levering i.p.v. meerdere runs.
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                                {supplierList.slice(0, 4).map(s => (
                                    <div key={s.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 10, alignItems: 'center', padding: '6px 0' }}>
                                        <div style={{ width: 6, height: 6, borderRadius: 1, background: s.color }} />
                                        <div style={{ fontSize: 12, fontWeight: 500 }}>{s.name}</div>
                                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.items.length} items</div>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt(s.total)}</div>
                                    </div>
                                ))}
                            </div>
                            <BtnPrimary icon={ShoppingCart} right={ArrowUpRight} onClick={onOpenBuyList} style={{ width: '100%', justifyContent: 'center' }}>Open inkooplijst</BtnPrimary>
                        </>
                    ) : (
                        <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                            <CheckCircle size={24} style={{ color: 'var(--green)', marginBottom: 8 }} />
                            <div>Geen bestelling nodig.</div>
                        </div>
                    )}
                </div>
            </MetalCard>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   CATEGORY CHART — donut + horizontal bar legend
   ═══════════════════════════════════════════════════════════════════ */
function CategoryChart({ categories }: { categories: { name: string; count: number; value: number; color: string }[] }) {
    const [hovered, setHovered] = useState<string | null>(null);
    const total = categories.reduce((s, c) => s + c.value, 0);
    const R = 78, IR = 54, CX = 100, CY = 100;
    const C = 2 * Math.PI * R;
    let offset = 0;
    const segs = categories.map(c => {
        const pct = total > 0 ? c.value / total : 0;
        const len = pct * C;
        const seg = { ...c, pct, len, offset, dash: len, gap: C - len };
        offset += len;
        return seg;
    });
    const hov = hovered ? segs.find(s => s.name === hovered) : null;

    return (
        <MetalCard>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <PieChart size={14} style={{ color: GOLD }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Voorraad per categorie</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Totaal: <span style={{ color: 'var(--text)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</span>
                </div>
            </div>
            <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 28, padding: 22 }}>
                <div style={{ position: 'relative', width: 220, height: 220, justifySelf: 'center' }}>
                    <svg width="220" height="220" viewBox="0 0 200 200" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(130,130,130,.08)" strokeWidth={R - IR} />
                        {segs.map(s => (
                            <circle key={s.name} cx={CX} cy={CY} r={R} fill="none" stroke={s.color}
                                strokeWidth={R - IR}
                                strokeDasharray={`${s.dash} ${s.gap}`}
                                strokeDashoffset={-s.offset}
                                style={{
                                    transition: 'opacity .18s, stroke-width .18s',
                                    opacity: hovered && hovered !== s.name ? 0.3 : 1,
                                    strokeWidth: hovered === s.name ? (R - IR) + 6 : (R - IR),
                                    cursor: 'pointer',
                                }}
                                onMouseEnter={() => setHovered(s.name)}
                                onMouseLeave={() => setHovered(null)}
                            />
                        ))}
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', pointerEvents: 'none' }}>
                        {hov ? <>
                            <div style={{ fontSize: 10, letterSpacing: '.18em', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>{hov.name}</div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 300, color: hov.color, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{fmt(hov.value)}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{(hov.pct * 100).toFixed(1)}% · {hov.count} items</div>
                        </> : <>
                            <div style={{ fontSize: 10, letterSpacing: '.18em', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>Totaal</div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</div>
                        </>}
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                    {segs.slice().sort((a, b) => b.value - a.value).map(s => (
                        <div key={s.name}
                            onMouseEnter={() => setHovered(s.name)}
                            onMouseLeave={() => setHovered(null)}
                            style={{
                                display: 'grid', gridTemplateColumns: '10px 1fr auto auto', gap: 10, alignItems: 'center',
                                padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                                background: hovered === s.name ? 'rgba(255,255,255,.03)' : 'transparent',
                                opacity: hovered && hovered !== s.name ? 0.45 : 1, transition: 'all .15s',
                            }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {s.name} <span style={{ fontSize: 10, color: 'var(--muted-light)' }}>· {s.count} items</span>
                                </div>
                                <div style={{ position: 'relative', height: 4, background: 'rgba(130,130,130,.1)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${s.pct * 100}%`, background: s.color, borderRadius: 2 }} />
                                </div>
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 600, minWidth: 60, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(s.value)}</div>
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
function FilterBar({ search, setSearch, filter, setFilter, counts }: any) {
    return (
        <MetalCard>
            <div className="responsive-grid" style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'center' }}>
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
                    <Pill variant={filter === 'Alles' ? 'brand' : 'draft'} onClick={() => setFilter('Alles')}>Alles · {counts.all}</Pill>
                    <Pill variant={filter === 'Kritiek' ? 'brand' : 'draft'} onClick={() => setFilter('Kritiek')}>
                        <AlertTriangle size={10} /> Onder par · {counts.kritiek}
                    </Pill>
                    <Pill variant={filter === 'THT' ? 'brand' : 'draft'} onClick={() => setFilter('THT')}>
                        <Clock size={10} /> THT ≤ 3d · {counts.tht}
                    </Pill>
                    <Pill variant={filter === 'Op peil' ? 'brand' : 'draft'} onClick={() => setFilter('Op peil')}>
                        <CheckCircle size={10} /> Op peil · {counts.peil}
                    </Pill>
                    {CATEGORIEEN.map(c => (
                        <Pill key={c} variant={filter === c ? 'brand' : 'draft'} onClick={() => setFilter(c)}>
                            <span style={{ width: 6, height: 6, borderRadius: 1, background: CAT_META[c]?.color || '#949494', display: 'inline-block' }} />
                            {c}
                        </Pill>
                    ))}
                </div>
            </div>
        </MetalCard>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   PRODUCT TABLE — stockbar, dekking, par, prijs, waarde, leverancier, THT, status
   ═══════════════════════════════════════════════════════════════════ */
function ProductTable({ items, onOpenItem, onAdjust }: { items: InventoryItem[]; onOpenItem: (id: number) => void; onAdjust: (item: InventoryItem, amount: number) => void }) {
    return (
        <MetalCard style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Package size={14} style={{ color: GOLD }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Producten</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {items.length} getoond</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted-light)', letterSpacing: '.15em', textTransform: 'uppercase', fontWeight: 700 }}>
                    <Hint tip="Par-level = wat je altijd op voorraad wilt hebben. Bestelpunt (gele streep in balk) = drempel waaronder we waarschuwen.">Par & bestelpunt</Hint>
                </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: 'rgba(130,130,130,.04)', borderBottom: '1px solid var(--border)' }}>
                            {['Item', 'Voorraad', 'Dekking', 'Par', 'Prijs', 'Waarde', 'Leverancier', 'THT', 'Status', ''].map(h => (
                                <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Waarde' || h === 'Prijs' ? 'right' : 'left', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(i => {
                            const s = stockStatus(i);
                            const meta = CAT_META[i.categorie] || CAT_META.Overig;
                            const cov = coverageDays(i);
                            const thtDays = daysUntilTHT(i.tht);
                            const par = i.par_level || i.min_stock || 0;
                            return (
                                <tr key={i.id}
                                    onClick={() => onOpenItem(i.id)}
                                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .12s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.02)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ padding: '10px 12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{ width: 3, height: 28, background: meta.color, borderRadius: 2, flexShrink: 0 }} />
                                            <div>
                                                <div style={{ fontWeight: 500, fontSize: 12.5 }}>{i.naam}</div>
                                                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{i.categorie}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px 12px', minWidth: 140 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{ flex: 1, minWidth: 70 }}><StockBar item={i} /></div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: s.color, minWidth: 50, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                {i.current_stock} {i.unit}
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>
                                        <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: cov === Infinity ? 'var(--muted-light)' : cov < 3 ? 'var(--red)' : cov < 7 ? 'var(--amber)' : 'var(--muted)' }}>
                                            {cov === Infinity ? '—' : `~${cov.toFixed(1)}d`}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{par} {i.unit}</td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(i.purchase_price || 0)}</td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt(stockValue(i))}</td>
                                    <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--muted)' }}>
                                        {i.supplier ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <div style={{ width: 6, height: 6, borderRadius: 1, background: supplierColor(i.supplier) }} />
                                                <span>{i.supplier}</span>
                                            </div>
                                        ) : '—'}
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>
                                        {thtDays === null ? (
                                            <span style={{ fontSize: 11, color: 'var(--muted-light)' }}>n.v.t.</span>
                                        ) : thtDays <= 3 ? (
                                            <span style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: thtDays <= 1 ? 'var(--red)' : 'var(--amber)' }}>{thtDays}d</span>
                                        ) : (
                                            <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{thtDays}d</span>
                                        )}
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>
                                        <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', background: s.bg, color: s.color, border: `1px solid ${s.br}` }}>{s.label}</span>
                                    </td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                        <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                                            <button onClick={() => onAdjust(i, -1)} title="Eén eraf" style={{ width: 26, height: 26, borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>−</button>
                                            <button onClick={() => onAdjust(i, +1)} title="Eén erbij" style={{ width: 26, height: 26, borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>+</button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {items.length === 0 && (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                    <Search size={28} style={{ color: 'var(--muted-light)', marginBottom: 10 }} />
                    <div>Geen producten gevonden met deze filter.</div>
                </div>
            )}
        </MetalCard>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   ITEM DETAIL DRAWER — tabs (Prijs, Leveranciers, Verbruik, Audit log)
   ═══════════════════════════════════════════════════════════════════ */
function ItemDetailDrawer({ item, supplierPrices, recepten, movements, bonPriceHistory, onClose, onAdjust, onEdit }: {
    item: InventoryItem;
    supplierPrices: any[];
    recepten: Recept[];
    movements: StockMovement[];
    /* Rijen uit price_history-tabel gefilterd op deze inventory_id; gevuld door /api/bon-process. */
    bonPriceHistory?: { id: number; inventory_id: number; datum: string; unit_price: number; unit?: string; source: string }[];
    onClose: () => void;
    onAdjust: (i: InventoryItem, a: number) => void;
    onEdit: () => void;
}) {
    const [tab, setTab] = useState<'prijs' | 'leveranciers' | 'verbruik' | 'log'>('prijs');
    const s = stockStatus(item);
    const meta = CAT_META[item.categorie] || CAT_META.Overig;
    const cov = coverageDays(item);
    const thtDays = daysUntilTHT(item.tht);
    const par = item.par_level || item.min_stock || 0;

    const priceHistory = useMemo(() => {
        return (supplierPrices || [])
            .filter((p: any) => p.product_naam && p.product_naam.toLowerCase().includes(item.naam.toLowerCase()))
            .sort((a: any, b: any) => new Date(a.created_at || a.datum).getTime() - new Date(b.created_at || b.datum).getTime());
    }, [supplierPrices, item.naam]);

    const recipesUsing = useMemo(() => {
        return (recepten || []).filter((r: any) =>
            (r.ingredienten || []).some((ing: any) => ing.naam && ing.naam.toLowerCase().includes(item.naam.toLowerCase()))
        );
    }, [recepten, item.naam]);

    /* Sparkline-points uit prijshistorie (max 12 punten) */
    const sparkPoints = useMemo(() => {
        if (priceHistory.length < 2) return null;
        const slice = priceHistory.slice(-12).map((p: any) => Number(p.prijs) || 0);
        const min = Math.min(...slice), max = Math.max(...slice);
        const range = max - min || 1;
        return slice.map((v: number, i: number) => `${(i / (slice.length - 1)) * 100},${40 - ((v - min) / range) * 36}`).join(' ');
    }, [priceHistory]);

    /* Alternatieve leveranciers met deze (of vergelijkbare) productnaam */
    const altSuppliers = useMemo(() => {
        const groups: Record<string, { name: string; prijs: number; eenheid: string; datum: string }> = {};
        (supplierPrices || [])
            .filter((p: any) => p.product_naam && p.product_naam.toLowerCase().includes(item.naam.toLowerCase()))
            .forEach((p: any) => {
                if (!groups[p.leverancier] || new Date(p.datum) > new Date(groups[p.leverancier].datum)) {
                    groups[p.leverancier] = { name: p.leverancier, prijs: Number(p.prijs), eenheid: p.eenheid, datum: p.datum };
                }
            });
        return Object.values(groups).sort((a, b) => a.prijs - b.prijs);
    }, [supplierPrices, item.naam]);
    const cheapest = altSuppliers[0]?.prijs;

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', zIndex: 9998 }} />
            <aside style={{ position: 'fixed', right: 0, top: 0, height: '100vh', width: 640, maxWidth: '100vw', background: 'var(--color-bg-elevated)', borderLeft: '1px solid var(--border)', zIndex: 9999, boxShadow: '-20px 0 40px rgba(0,0,0,.4)', display: 'flex', flexDirection: 'column' }}>

                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: `linear-gradient(180deg, ${meta.color}15, transparent)`, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${meta.color}, transparent)` }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                                <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}40` }}>{item.categorie.toUpperCase()}</span>
                                <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', background: s.bg, color: s.color, border: `1px solid ${s.br}` }}>{s.label}</span>
                                {thtDays !== null && thtDays <= 3 && (
                                    <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', background: 'rgba(245,158,11,.15)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,.3)' }}>THT {thtDays}D</span>
                                )}
                            </div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 300, letterSpacing: '-.01em' }}>{item.naam}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>per {item.unit} · leverancier: {item.supplier || '—'}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <a
                                href={`/voorraad/historie/${item.id}`}
                                title="Volledige audit-trail: mutaties + prijshistorie + marge-alerts"
                                style={{ width: 34, height: 34, borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
                            >
                                <History size={15} />
                            </a>
                            <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 20 }}>
                        <div>
                            <Eyebrow>Huidige voorraad</Eyebrow>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 32, fontWeight: 300, color: s.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{item.current_stock}</div>
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>/ {par} {item.unit}</div>
                            </div>
                            <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
                                <button onClick={() => onAdjust(item, -1)} style={{ padding: '4px 10px', minWidth: 32, borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>−1</button>
                                <button onClick={() => onAdjust(item, +1)} style={{ padding: '4px 10px', minWidth: 32, borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>+1</button>
                            </div>
                        </div>
                        <div>
                            <Eyebrow><Hint tip="Hoeveel dagen je nog vooruit komt bij huidig dagelijks verbruik. Vereist `avg_daily` op het item.">Dekking</Hint></Eyebrow>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 32, fontWeight: 300, marginTop: 4, color: cov === Infinity ? 'var(--muted-light)' : cov < 3 ? 'var(--red)' : cov < 7 ? 'var(--amber)' : 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                                {cov === Infinity ? '∞' : `${cov.toFixed(1)}d`}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>~{Number(item.avg_daily || 0)}/dag verbruik</div>
                        </div>
                        <div>
                            <Eyebrow>Voorraadwaarde</Eyebrow>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 32, fontWeight: 300, color: GOLD, marginTop: 4, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fmt(stockValue(item))}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>à {fmt(item.purchase_price || 0)} / {item.unit}</div>
                        </div>
                    </div>

                    {item.used_in && item.used_in.length > 0 && (
                        <div style={{ marginTop: 16, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,191,0,.05)', border: '1px solid rgba(255,191,0,.18)', fontSize: 11, color: GOLD, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <LinkIcon size={11} />
                            <span>Gebruikt in: <strong style={{ color: 'var(--text)' }}>{item.used_in.join(' · ')}</strong></span>
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, padding: '10px 18px 0', borderBottom: '1px solid var(--border)' }}>
                    {([
                        { id: 'prijs' as const, label: 'Prijshistorie', Icon: LineChart },
                        { id: 'leveranciers' as const, label: `Leveranciers (${altSuppliers.length})`, Icon: Store },
                        { id: 'verbruik' as const, label: `Verbruik (${recipesUsing.length})`, Icon: Activity },
                        { id: 'log' as const, label: `Audit log (${movements.length})`, Icon: History },
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

                {/* Tab content */}
                <div style={{ flex: 1, overflow: 'auto', padding: 22 }}>
                    {tab === 'prijs' && (
                        <div>
                            {/* Bon-prijshistorie — gevuld door /api/bon-process bij elke verwerkte bon */}
                            {bonPriceHistory && bonPriceHistory.length > 0 && (
                                <div style={{ marginBottom: 24 }}>
                                    <Eyebrow style={{ color: 'var(--green)' }}>Inkoopprijs uit verwerkte bonnen ({bonPriceHistory.length})</Eyebrow>
                                    {(() => {
                                        const sorted = bonPriceHistory.slice().sort((a, b) => a.datum.localeCompare(b.datum));
                                        const last = sorted[sorted.length - 1];
                                        const first = sorted[0];
                                        const trendPct = first.unit_price > 0 ? ((last.unit_price - first.unit_price) / first.unit_price) * 100 : 0;
                                        return (
                                            <>
                                                <div style={{ marginTop: 8, padding: 12, border: '1px solid rgba(34,197,94,.25)', borderRadius: 10, background: 'rgba(34,197,94,.05)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
                                                        <span>Laatste inkoop {last.datum}</span>
                                                        <span style={{ color: trendPct > 5 ? 'var(--red)' : trendPct < -5 ? 'var(--green)' : 'var(--muted)' }}>
                                                            {trendPct === 0 ? '—' : (trendPct > 0 ? '+' : '') + trendPct.toFixed(1) + '% vs eerste'}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                                        {fmt(Number(last.unit_price))} <span style={{ fontSize: 11, color: 'var(--muted)' }}>/ {last.unit || item.unit}</span>
                                                    </div>
                                                </div>
                                                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    {sorted.slice().reverse().slice(0, 8).map(p => (
                                                        <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: 12, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}>
                                                            <span style={{ color: 'var(--muted)' }}>{p.datum}</span>
                                                            <span style={{ color: 'var(--muted-light)', fontSize: 10, alignSelf: 'center' }}>{p.source}</span>
                                                            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(Number(p.unit_price))}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            )}

                            <Eyebrow>Prijshistorie uit Price Intelligence</Eyebrow>
                            {priceHistory.length === 0 ? (
                                <div style={{ marginTop: 16, padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12, border: '1px dashed var(--border)', borderRadius: 10 }}>
                                    <Info size={20} style={{ color: 'var(--muted-light)', marginBottom: 6 }} />
                                    <div>{bonPriceHistory && bonPriceHistory.length > 0 ? 'Geen extra Price Intelligence-data — bovenstaande inkoopprijs uit bonnen is leidend.' : 'Nog geen prijsdata voor dit product.'}</div>
                                    <div style={{ fontSize: 11, marginTop: 6 }}>{bonPriceHistory && bonPriceHistory.length > 0 ? '' : <>Verwerk bonnen via <a href="/inkoop" style={{ color: GOLD, textDecoration: 'underline' }}>Inkoop</a> of importeer prijslijsten in <a href="/price-intelligence" style={{ color: GOLD, textDecoration: 'underline' }}>Price Intelligence</a> om trends te zien.</>}</div>
                                </div>
                            ) : (
                                <>
                                    {sparkPoints && (
                                        <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--color-bg-deep)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 11, color: 'var(--muted)' }}>
                                                <span>Trend laatste {Math.min(12, priceHistory.length)} prijs-noteringen</span>
                                                <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{fmt(Number(priceHistory[priceHistory.length - 1].prijs))}</span>
                                            </div>
                                            <svg width="100%" height="40" viewBox="0 0 100 40" preserveAspectRatio="none">
                                                <polyline points={sparkPoints} fill="none" stroke={GOLD} strokeWidth="1.5" />
                                            </svg>
                                        </div>
                                    )}
                                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {priceHistory.slice().reverse().map((p: any, i: number) => (
                                            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
                                                <div style={{ width: 6, height: 6, borderRadius: 1, background: supplierColor(p.leverancier) }} />
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 500 }}>{p.leverancier}</div>
                                                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.datum}</div>
                                                </div>
                                                <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(Number(p.prijs))} <span style={{ fontSize: 10, color: 'var(--muted)' }}>/ {p.eenheid}</span></div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {tab === 'leveranciers' && (
                        <div>
                            <Eyebrow>Leverancier-vergelijking</Eyebrow>
                            {altSuppliers.length === 0 ? (
                                <div style={{ marginTop: 16, padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12, border: '1px dashed var(--border)', borderRadius: 10 }}>
                                    Nog geen vergelijkingsdata. Upload prijslijsten van meerdere leveranciers in Price Intelligence.
                                </div>
                            ) : (
                                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {altSuppliers.map((a, i) => {
                                        const diffPct = cheapest ? ((a.prijs - cheapest) / cheapest) * 100 : 0;
                                        return (
                                            <div key={a.name} style={{
                                                display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 12, alignItems: 'center',
                                                padding: '10px 12px', border: `1px solid ${i === 0 ? `${GOLD}66` : 'var(--border)'}`, borderRadius: 8,
                                                background: i === 0 ? `${GOLD}10` : 'transparent',
                                            }}>
                                                <div style={{ width: 8, height: 8, borderRadius: 2, background: supplierColor(a.name) }} />
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 600 }}>{a.name} {i === 0 && <span style={{ marginLeft: 6, fontSize: 9, color: GOLD, letterSpacing: '.1em' }}>GOEDKOOPST</span>}</div>
                                                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{a.datum}</div>
                                                </div>
                                                <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(a.prijs)} <span style={{ fontSize: 10, color: 'var(--muted)' }}>/ {a.eenheid}</span></div>
                                                <div style={{ fontSize: 11, color: diffPct === 0 ? 'var(--green)' : 'var(--red)', fontVariantNumeric: 'tabular-nums', minWidth: 50, textAlign: 'right' }}>
                                                    {diffPct === 0 ? '—' : `+${diffPct.toFixed(1)}%`}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {tab === 'verbruik' && (
                        <div>
                            <Eyebrow>Gebruikt in recepten</Eyebrow>
                            {recipesUsing.length === 0 ? (
                                <div style={{ marginTop: 16, padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12, border: '1px dashed var(--border)', borderRadius: 10 }}>
                                    Dit product wordt nog niet gebruikt in een recept.
                                </div>
                            ) : (
                                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {recipesUsing.map((r: any) => (
                                        <a key={r.id} href={`/recepten?id=${r.id}`} style={{
                                            display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center',
                                            padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, textDecoration: 'none', color: 'var(--text)',
                                        }}>
                                            <ChefHat size={14} style={{ color: 'var(--purple)' }} />
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 500 }}>{r.naam}</div>
                                                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{r.porties} porties</div>
                                            </div>
                                            <ChevronRight size={14} style={{ color: 'var(--muted)' }} />
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {tab === 'log' && (
                        <div>
                            <Eyebrow>Audit log — alle voorraad-mutaties</Eyebrow>
                            {movements.length === 0 ? (
                                <div style={{ marginTop: 16, padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12, border: '1px dashed var(--border)', borderRadius: 10 }}>
                                    Nog geen mutaties geregistreerd. Tellingen, verbruik en ontvangsten verschijnen hier automatisch.
                                </div>
                            ) : (
                                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {movements.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 50).map(m => {
                                        const tone = m.type === 'usage' ? 'var(--red)' : m.type === 'receive' ? 'var(--green)' : m.type === 'count' ? GOLD : 'var(--muted)';
                                        return (
                                            <div key={m.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
                                                <div style={{ width: 6, height: 6, borderRadius: 1, background: tone }} />
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 500, textTransform: 'capitalize' }}>{m.type}{m.note ? ` · ${m.note}` : ''}</div>
                                                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{new Date(m.created_at).toLocaleString('nl-NL')}{m.by_user ? ` · ${m.by_user}` : ''}</div>
                                                </div>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: tone, fontVariantNumeric: 'tabular-nums' }}>
                                                    {m.qty > 0 ? '+' : ''}{m.qty} {item.unit}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', background: 'var(--color-bg-deep)' }}>
                    <BtnGhost icon={Edit3} onClick={onEdit}>Bewerken</BtnGhost>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {s.key === 'low' || s.key === 'out' ? <Pill variant="danger">Onder par · bestel bij</Pill> : null}
                    </div>
                </div>
            </aside>
        </>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   ADD ITEM MODAL — met AI-assistent tab
   ═══════════════════════════════════════════════════════════════════ */
function AddItemModal({ onClose, onSave }: { onClose: () => void; onSave: (data: any) => void }) {
    const [tab, setTab] = useState<'ai' | 'manual'>('ai');
    const [aiInput, setAiInput] = useState('');
    const [aiBusy, setAiBusy] = useState(false);
    const [aiResult, setAiResult] = useState<any>(null);
    const [form, setForm] = useState<any>({
        naam: '', categorie: 'Vlees', current_stock: 0, min_stock: 0, par_level: 0,
        unit: 'kg', purchase_price: 0, supplier: '', tht: '', avg_daily: 0,
    });

    async function aiAssist() {
        if (!aiInput.trim()) return;
        setAiBusy(true);
        try {
            const prompt = `Een gebruiker tikt: "${aiInput}". Stel voor (alleen JSON, geen uitleg):
{
  "naam": "korte productnaam (2-5 woorden)",
  "categorie": "een van: Vlees, Vis, Groenten, Zuivel, Kruiden, Sauzen, Dranken, Brood, Hout, Overig",
  "unit": "logische eenheid (kg, stuks, fles, doos, krat, etc.)",
  "par_level": 10,
  "min_stock": 5,
  "supplier": "veldwaarde of leeg",
  "purchase_price": 0
}`;
            const res = await fetch('/api/voorraad-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: prompt, snapshot: '' }),
            });
            const body = await res.json();
            const text = body.text || '';
            const cleaned = text.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            setAiResult(parsed);
            setForm((f: any) => ({ ...f, ...parsed }));
        } catch {
            setAiResult({ error: 'Kon AI-suggestie niet verwerken' });
        }
        setAiBusy(false);
    }

    function submit() {
        if (!form.naam?.trim()) return;
        onSave(form);
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{
                width: 600, maxHeight: '90vh', overflow: 'auto', background: 'var(--color-bg-elevated)',
                border: '1px solid var(--border)', borderRadius: 16, position: 'relative',
            }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />

                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <Eyebrow>Nieuw product toevoegen</Eyebrow>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300, marginTop: 4 }}>Voeg item aan voorraad toe</div>
                        </div>
                        <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}><X size={16} /></button>
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 16 }}>
                        {[{ id: 'ai' as const, label: 'AI-assistent', Icon: Sparkles }, { id: 'manual' as const, label: 'Handmatig', Icon: Edit3 }].map(t => (
                            <button key={t.id} onClick={() => setTab(t.id)}
                                style={{
                                    padding: '6px 12px', borderRadius: 6, border: 'none',
                                    background: tab === t.id ? `linear-gradient(180deg, ${GOLD}, #9e781c)` : 'transparent',
                                    color: tab === t.id ? '#0a0a0c' : 'var(--muted)',
                                    fontWeight: 600, fontSize: 11, cursor: 'pointer',
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                }}>
                                <t.Icon size={12} /> {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ padding: 24 }}>
                    {tab === 'ai' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ padding: 12, borderRadius: 10, background: `${GOLD}10`, border: `1px solid ${GOLD}33`, fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }}>
                                <Sparkles size={12} style={{ color: GOLD, marginRight: 4 }} />
                                Beschrijf het product kort. AI vult <strong style={{ color: 'var(--text)' }}>categorie, eenheid, par-level en leverancier</strong> automatisch in.
                            </div>
                            <div>
                                <Eyebrow style={{ marginBottom: 6 }}>Wat wil je toevoegen?</Eyebrow>
                                <textarea value={aiInput} onChange={e => setAiInput(e.target.value)} rows={3}
                                    placeholder='Bv. "5kg gerookte zalmfilet voor sushi-bar"'
                                    style={{ width: '100%', padding: 12, borderRadius: 8, background: 'var(--color-bg-deep)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, resize: 'none', lineHeight: 1.5, outline: 'none', fontFamily: 'inherit' }} />
                            </div>
                            <BtnPrimary icon={Sparkles} right={ArrowUpRight} onClick={aiAssist} disabled={aiBusy} style={{ width: '100%', justifyContent: 'center' }}>
                                {aiBusy ? 'AI denkt…' : 'AI vult voor mij in'}
                            </BtnPrimary>
                            {aiResult && !aiResult.error && (
                                <div style={{ padding: 14, borderRadius: 10, background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.25)' }}>
                                    <Eyebrow style={{ color: 'var(--green)', marginBottom: 8 }}>AI-suggestie · gevuld in formulier</Eyebrow>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                                        <div><span style={{ color: 'var(--muted)' }}>Naam:</span> <strong>{aiResult.naam}</strong></div>
                                        <div><span style={{ color: 'var(--muted)' }}>Categorie:</span> {aiResult.categorie}</div>
                                        <div><span style={{ color: 'var(--muted)' }}>Eenheid:</span> {aiResult.unit}</div>
                                        <div><span style={{ color: 'var(--muted)' }}>Par-level:</span> {aiResult.par_level} {aiResult.unit}</div>
                                        <div><span style={{ color: 'var(--muted)' }}>Leverancier:</span> {aiResult.supplier || '—'}</div>
                                    </div>
                                    <div style={{ marginTop: 10 }}>
                                        <BtnGhost icon={Edit3} onClick={() => setTab('manual')}>Bekijk & pas aan</BtnGhost>
                                    </div>
                                </div>
                            )}
                            {aiResult?.error && (
                                <div style={{ padding: 12, borderRadius: 8, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', color: 'var(--red)', fontSize: 12 }}>{aiResult.error}</div>
                            )}
                        </div>
                    )}

                    {tab === 'manual' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <Field label="Productnaam">
                                <input value={form.naam} onChange={e => setForm({ ...form, naam: e.target.value })} placeholder="Bv. Brisket Angus" style={inputStyle} />
                            </Field>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <Field label="Categorie">
                                    <select value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })} style={inputStyle}>
                                        {CATEGORIEEN.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </Field>
                                <Field label="Eenheid">
                                    <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={inputStyle}>
                                        {EENHEDEN.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </Field>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                <Field label="Huidig">
                                    <input type="number" step="0.1" value={form.current_stock} onChange={e => setForm({ ...form, current_stock: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                                </Field>
                                <Field label="Bestelpunt">
                                    <input type="number" step="0.1" value={form.min_stock} onChange={e => setForm({ ...form, min_stock: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                                </Field>
                                <Field label="Par-level">
                                    <input type="number" step="0.1" value={form.par_level} onChange={e => setForm({ ...form, par_level: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                                </Field>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <Field label="Inkoopprijs (€)">
                                    <input type="number" step="0.01" value={form.purchase_price} onChange={e => setForm({ ...form, purchase_price: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                                </Field>
                                <Field label="Leverancier">
                                    <input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} placeholder="Bv. Sligro" style={inputStyle} />
                                </Field>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <Field label="THT (optioneel)">
                                    <input type="date" value={form.tht || ''} onChange={e => setForm({ ...form, tht: e.target.value })} style={inputStyle} />
                                </Field>
                                <Field label="Gem. dagverbruik">
                                    <input type="number" step="0.1" value={form.avg_daily} onChange={e => setForm({ ...form, avg_daily: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                                </Field>
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <BtnGhost onClick={onClose}>Annuleren</BtnGhost>
                    <BtnPrimary icon={Save} onClick={submit}>Toevoegen</BtnPrimary>
                </div>
            </div>
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', height: 36, borderRadius: 8,
    background: 'var(--color-bg-deep)', border: '1px solid var(--border)',
    color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <Eyebrow style={{ marginBottom: 6 }}>{label}</Eyebrow>
            {children}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   EDIT ITEM VIEW — full-page form (uitgebreid met nieuwe velden)
   ═══════════════════════════════════════════════════════════════════ */
function EditItemView({ editForm, setEditForm, editing, recepten, onSave, onDelete, onClose }: any) {
    function setField(k: string, v: any) { setEditForm({ ...editForm, [k]: v }); }
    const stockVal = (editForm.current_stock || 0) * (editForm.purchase_price || 0);
    const isLow = (editForm.current_stock || 0) <= (editForm.min_stock || 0);
    const usedIn = editing !== 'new' ? (recepten || []).filter((r: any) =>
        (r.ingredienten || []).some((ing: any) => ing.naam && ing.naam.toLowerCase().includes((editForm.naam || '').toLowerCase()))
    ) : [];

    return (
        <div className="mobile-safe-bottom" style={{ padding: '24px var(--space-mobile-edge) 32px', maxWidth: 900, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', minHeight: 44, color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, touchAction: 'manipulation' }}>
                    <ArrowLeft size={14} /> Terug
                </button>
                <div>
                    <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 200, fontSize: 28, margin: 0 }}>
                        {editing === 'new' ? 'Nieuw item' : editForm.naam || 'Item bewerken'}
                    </h1>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {editing === 'new' ? 'Vul alles in, klik opslaan' : 'Pas aan en klik opslaan'}
                    </div>
                </div>
            </div>

            <SectionExplain>
                <strong style={{ color: 'var(--text)' }}>Hoe werkt dit?</strong> Geef je product een naam, kies categorie, vul je <em>par-level</em> en <em>bestelpunt</em>. Par-level = wat je altijd op voorraad wilt; bestelpunt = drempel waaronder we waarschuwen.
            </SectionExplain>

            <MetalCard style={{ padding: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <Field label="Productnaam">
                        <input value={editForm.naam || ''} onChange={e => setField('naam', e.target.value)} style={inputStyle} />
                    </Field>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Field label="Categorie">
                            <select value={editForm.categorie || 'Overig'} onChange={e => setField('categorie', e.target.value)} style={inputStyle}>
                                {CATEGORIEEN.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </Field>
                        <Field label="Eenheid">
                            <select value={editForm.unit || 'kg'} onChange={e => setField('unit', e.target.value)} style={inputStyle}>
                                {EENHEDEN.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </Field>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                        <Field label="Huidige voorraad">
                            <input type="number" step="0.1" value={editForm.current_stock || 0} onChange={e => setField('current_stock', parseFloat(e.target.value) || 0)} style={inputStyle} />
                        </Field>
                        <Field label="Bestelpunt">
                            <input type="number" step="0.1" value={editForm.min_stock || 0} onChange={e => setField('min_stock', parseFloat(e.target.value) || 0)} style={inputStyle} />
                        </Field>
                        <Field label="Par-level">
                            <input type="number" step="0.1" value={editForm.par_level || 0} onChange={e => setField('par_level', parseFloat(e.target.value) || 0)} style={inputStyle} />
                        </Field>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Field label="Inkoopprijs (€)">
                            <input type="number" step="0.01" value={editForm.purchase_price || 0} onChange={e => setField('purchase_price', parseFloat(e.target.value) || 0)} style={inputStyle} />
                        </Field>
                        <Field label="Leverancier">
                            <input value={editForm.supplier || ''} onChange={e => setField('supplier', e.target.value)} style={inputStyle} />
                        </Field>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Field label="THT (optioneel)">
                            <input type="date" value={editForm.tht || ''} onChange={e => setField('tht', e.target.value || null)} style={inputStyle} />
                        </Field>
                        <Field label="Gem. dagverbruik">
                            <input type="number" step="0.1" value={editForm.avg_daily || 0} onChange={e => setField('avg_daily', parseFloat(e.target.value) || 0)} style={inputStyle} />
                        </Field>
                    </div>
                </div>

                {usedIn.length > 0 && (
                    <div style={{ marginTop: 18, padding: 12, borderRadius: 10, background: `${GOLD}10`, border: `1px solid ${GOLD}33` }}>
                        <Eyebrow>Gebruikt in {usedIn.length} recept(en)</Eyebrow>
                        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text)' }}>
                            {usedIn.map((r: any) => r.naam).join(' · ')}
                        </div>
                    </div>
                )}

                <div style={{ marginTop: 18, padding: 12, borderRadius: 10, background: isLow ? 'rgba(239,68,68,.1)' : 'var(--color-bg-deep)', border: `1px solid ${isLow ? 'rgba(239,68,68,.3)' : 'var(--border)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Voorraadwaarde nu</div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt(stockVal)}</div>
                    </div>
                    {isLow && <Pill variant="danger">Onder bestelpunt</Pill>}
                </div>
            </MetalCard>

            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
                {editing !== 'new' ? (
                    <BtnGhost icon={Trash2} onClick={onDelete} style={{ borderColor: 'rgba(239,68,68,.3)', color: 'var(--red)' }}>Verwijderen</BtnGhost>
                ) : <span />}
                <div style={{ display: 'flex', gap: 8 }}>
                    <BtnGhost onClick={onClose}>Annuleren</BtnGhost>
                    <BtnPrimary icon={Save} onClick={onSave}>Opslaan</BtnPrimary>
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   COUNT MODE — telling-modus voor mobiel
   ═══════════════════════════════════════════════════════════════════ */
function CountMode({ inventory, byCategory, onSetStock, onClose }: { inventory: InventoryItem[]; byCategory: any[]; onSetStock: (i: InventoryItem, n: number) => void; onClose: () => void }) {
    const [activeCat, setActiveCat] = useState<string>(byCategory[0]?.name || 'Vlees');
    const [counted, setCounted] = useState<Set<number>>(new Set());

    const items = inventory.filter(i => i.categorie === activeCat);

    return (
        <div className="mobile-safe-bottom" style={{ padding: '24px var(--space-mobile-edge) 32px', maxWidth: 900, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', minHeight: 44, color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, touchAction: 'manipulation' }}>
                    <ArrowLeft size={14} /> Terug
                </button>
                <div>
                    <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 200, fontSize: 28, margin: 0 }}>Telling-modus</h1>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{counted.size} geteld · {inventory.length - counted.size} nog te doen</div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {byCategory.map(c => (
                    <Pill key={c.name} variant={activeCat === c.name ? 'brand' : 'draft'} onClick={() => setActiveCat(c.name)}>
                        {c.name} · {c.count}
                    </Pill>
                ))}
            </div>

            <MetalCard>
                <div style={{ padding: 12 }}>
                    {items.map(i => (
                        <div key={i.id} style={{
                            display: 'grid', gridTemplateColumns: '3px 1fr 200px', gap: 12, alignItems: 'center',
                            padding: '12px 10px', borderBottom: '1px solid var(--border)',
                            background: counted.has(i.id) ? `${GOLD}10` : 'transparent',
                        }}>
                            <div style={{ width: 3, height: 32, background: CAT_META[i.categorie]?.color || '#949494', borderRadius: 2 }} />
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 500 }}>{i.naam}</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{i.current_stock} {i.unit} · par {i.par_level || i.min_stock}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <input type="number" step="0.1" defaultValue={i.current_stock} onBlur={(e) => {
                                    const v = parseFloat(e.target.value);
                                    if (!isNaN(v)) {
                                        onSetStock(i, v);
                                        setCounted(prev => new Set(prev).add(i.id));
                                    }
                                }} style={{ ...inputStyle, height: 36, textAlign: 'right' }} />
                                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{i.unit}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </MetalCard>

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <BtnPrimary icon={CheckCircle} onClick={onClose}>Telling afsluiten ({counted.size})</BtnPrimary>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   INKOOPLIJST VIEW — gebundeld per leverancier
   ═══════════════════════════════════════════════════════════════════ */
function InkooplijstView({ inventory, onClose, onExport }: { inventory: InventoryItem[]; onClose: () => void; onExport: () => void }) {
    const lowStock = inventory.filter(i => ['out', 'low'].includes(stockStatus(i).key));
    const bySupplier: Record<string, { name: string; color: string; items: { item: InventoryItem; qty: number; lineTotal: number }[]; total: number }> = {};
    lowStock.forEach(i => {
        const sup = i.supplier || 'Onbekend';
        if (!bySupplier[sup]) bySupplier[sup] = { name: sup, color: supplierColor(sup), items: [], total: 0 };
        const need = Math.max(0, Number(i.par_level || i.min_stock || 0) - Number(i.current_stock || 0));
        const lineTotal = need * Number(i.purchase_price || 0);
        bySupplier[sup].items.push({ item: i, qty: need, lineTotal });
        bySupplier[sup].total += lineTotal;
    });
    const supplierList = Object.values(bySupplier);
    const [active, setActive] = useState<string>(supplierList[0]?.name || '');
    const grandTotal = supplierList.reduce((s, sup) => s + sup.total, 0);

    const activeSup = supplierList.find(s => s.name === active);

    function copyAsText() {
        if (!activeSup) return;
        const text = `Inkooplijst voor ${activeSup.name}\n\n` + activeSup.items.map(it => `- ${it.item.naam}: ${it.qty} ${it.item.unit} (${fmt(it.lineTotal)})`).join('\n') + `\n\nTotaal: ${fmt(activeSup.total)}`;
        navigator.clipboard.writeText(text);
    }

    return (
        <div className="mobile-safe-bottom" style={{ padding: '24px var(--space-mobile-edge) 32px', maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', minHeight: 44, color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, touchAction: 'manipulation' }}>
                    <ArrowLeft size={14} /> Terug
                </button>
                <div>
                    <Eyebrow style={{ color: GOLD }}>Inkooplijst · AI gebundeld</Eyebrow>
                    <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 200, fontSize: 28, margin: 0 }}>
                        {lowStock.length} items bij {supplierList.length} leveranciers
                    </h1>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Totaal: <strong style={{ color: GOLD }}>{fmt(grandTotal)}</strong></div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <BtnGhost icon={Printer} onClick={onExport}>PDF</BtnGhost>
                </div>
            </div>

            {supplierList.length === 0 ? (
                <MetalCard style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                    <CheckCircle size={32} style={{ color: 'var(--green)', marginBottom: 10 }} />
                    <div>Geen items om bij te bestellen — alles is op peil.</div>
                </MetalCard>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
                    <MetalCard>
                        <div style={{ padding: 8 }}>
                            {supplierList.map(s => (
                                <div key={s.name} onClick={() => setActive(s.name)} style={{
                                    padding: 12, borderRadius: 10, cursor: 'pointer', marginBottom: 4,
                                    background: active === s.name ? `${s.color}15` : 'transparent',
                                    border: `1px solid ${active === s.name ? `${s.color}50` : 'transparent'}`,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                                        <div style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{s.name}</div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
                                        <span>{s.items.length} item{s.items.length === 1 ? '' : 's'}</span>
                                        <span style={{ color: GOLD, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(s.total)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </MetalCard>

                    <MetalCard>
                        {activeSup && (
                            <>
                                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 12, height: 12, borderRadius: 3, background: activeSup.color }} />
                                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 400 }}>{activeSup.name}</div>
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                                        <BtnGhost icon={Mail}>Mail bestelling</BtnGhost>
                                        <BtnGhost icon={Copy} onClick={copyAsText}>Kopieer</BtnGhost>
                                        <BtnGhost icon={Download} onClick={onExport}>PDF</BtnGhost>
                                    </div>
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(130,130,130,.04)' }}>
                                                {['Product', 'Aantal', 'Prijs', 'Subtotaal'].map(h => (
                                                    <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Prijs' || h === 'Subtotaal' ? 'right' : 'left', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted-light)', fontWeight: 700 }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {activeSup.items.map(({ item, qty, lineTotal }) => (
                                                <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        <div style={{ fontWeight: 500 }}>{item.naam}</div>
                                                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>nu: {item.current_stock} / par: {item.par_level || item.min_stock} {item.unit}</div>
                                                    </td>
                                                    <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums' }}>{qty} {item.unit}</td>
                                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(item.purchase_price || 0)}</td>
                                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt(lineTotal)}</td>
                                                </tr>
                                            ))}
                                            <tr>
                                                <td colSpan={3} style={{ padding: '14px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--muted)' }}>TOTAAL</td>
                                                <td style={{ padding: '14px 14px', textAlign: 'right', fontWeight: 700, color: GOLD, fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>{fmt(activeSup.total)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </MetalCard>
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   AI REPORT DRAWER
   ═══════════════════════════════════════════════════════════════════ */
function AIReportDrawer({ loading, report, onClose, onRegenerate }: { loading: boolean; report: string | null; onClose: () => void; onRegenerate: () => void }) {
    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', zIndex: 9998 }} />
            <aside style={{ position: 'fixed', right: 0, top: 0, height: '100vh', width: 580, maxWidth: '100vw', background: 'var(--color-bg-elevated)', borderLeft: '1px solid var(--border)', zIndex: 9999, boxShadow: '-20px 0 40px rgba(0,0,0,.4)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: `linear-gradient(180deg, ${GOLD}15, transparent)`, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <Eyebrow style={{ color: GOLD }}>AI Voorraad-advies</Eyebrow>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300, marginTop: 4 }}>Gegenereerd advies-rapport</div>
                        </div>
                        <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}><X size={16} /></button>
                    </div>
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
                    {loading ? (
                        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                            <Sparkles size={24} style={{ color: GOLD, marginBottom: 10 }} />
                            <div>De AI analyseert je voorraad…</div>
                        </div>
                    ) : (
                        <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                            {report?.split('\n').map((line, i) => {
                                if (line.startsWith('## ')) return <h3 key={i} style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 400, fontSize: 16, color: GOLD, marginTop: 18, marginBottom: 6 }}>{line.replace('## ', '')}</h3>;
                                if (line.startsWith('**') && line.endsWith('**')) return <strong key={i}>{line.replace(/\*\*/g, '')}</strong>;
                                if (line.startsWith('- ')) return <div key={i} style={{ marginLeft: 16 }}>• {line.replace(/\*\*/g, '').substring(2)}</div>;
                                return <div key={i}>{line.replace(/\*\*(.+?)\*\*/g, '$1')}</div>;
                            })}
                        </div>
                    )}
                </div>
                <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <BtnGhost icon={Sparkles} onClick={onRegenerate}>Opnieuw genereren</BtnGhost>
                    <BtnPrimary icon={CheckCircle} onClick={onClose}>Sluiten</BtnPrimary>
                </div>
            </aside>
        </>
    );
}
