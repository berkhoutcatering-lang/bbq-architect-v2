/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useMemo, useRef } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { fmt } from '@/lib/utils';
import BarcodeScanner from '@/components/BarcodeScanner';
import EmptyState from '@/components/EmptyState';
import {
    AlertTriangle, Barcode, Plus, Package, Sparkles,
    X, Search, ShoppingCart, Euro, ArrowUpRight, ArrowLeft, Save, Trash2,
    FileText, Printer, PieChart, Clock, CheckCircle, HelpCircle,
    BookOpen, ChevronRight, Link as LinkIcon, History, Info,
    ClipboardCheck, Minus, Leaf, Fish, Beef, Milk, Flame, CupSoda,
    ChefHat,
} from 'lucide-react';
import type { InventoryItem, Recept } from '@/types';
import { RequireTier } from '@/components/PaywallPrompt';

const GOLD = '#c4a35a';

const CATEGORIEEN = ['Vlees', 'Vis', 'Groenten', 'Zuivel', 'Kruiden', 'Sauzen', 'Dranken', 'Overig'] as const;
const EENHEDEN = ['kg', 'g', 'L', 'ml', 'stuks', 'bos', 'pot', 'fles', 'zak'] as const;

const CAT_META: Record<string, { color: string; icon: any }> = {
    Vlees: { color: '#ef4444', icon: Beef },
    Vis: { color: '#4ECDC4', icon: Fish },
    Groenten: { color: '#22c55e', icon: Leaf },
    Zuivel: { color: '#FFBF00', icon: Milk },
    Kruiden: { color: '#a78bfa', icon: Leaf },
    Sauzen: { color: '#f97316', icon: Flame },
    Dranken: { color: '#3b82f6', icon: CupSoda },
    Overig: { color: '#949494', icon: Package },
};

/* ───────── helpers ───────── */
function stockStatus(item: InventoryItem) {
    const cur = item.current_stock || 0;
    const min = item.min_stock || 0;
    if (cur === 0) return { key: 'out', label: 'OP', color: 'var(--red)', bg: 'rgba(239,68,68,.12)', br: 'rgba(239,68,68,.35)', pct: 0 };
    if (cur < min) return { key: 'low', label: 'LAAG', color: 'var(--amber)', bg: 'rgba(245,158,11,.12)', br: 'rgba(245,158,11,.3)', pct: min > 0 ? (cur / min) * 100 : 0 };
    if (min > 0 && cur >= min * 1.5) return { key: 'ok', label: 'VOLDOENDE', color: 'var(--green)', bg: 'rgba(34,197,94,.1)', br: 'rgba(34,197,94,.25)', pct: Math.min(100, (cur / (min * 1.5)) * 100) };
    return { key: 'mid', label: 'OP PEIL', color: 'var(--muted)', bg: 'transparent', br: 'var(--border)', pct: min > 0 ? Math.min(100, (cur / (min * 1.5)) * 100) : 100 };
}

function stockValue(item: InventoryItem) { return (item.current_stock || 0) * (item.purchase_price || 0); }

/* ───────── atoms ───────── */
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

function MetalCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{
            position: 'relative', background: 'var(--card)', backdropFilter: 'blur(18px)',
            border: '1px solid rgba(130,130,130,.12)', borderRadius: 14, overflow: 'hidden',
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

function BtnPrimary({ children, icon: I, right: R, onClick, style, disabled }: { children: React.ReactNode; icon?: any; right?: any; onClick?: () => void; style?: React.CSSProperties; disabled?: boolean }) {
    return (
        <button onClick={onClick} disabled={disabled} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10,
            background: 'var(--brand)', color: 'var(--brand-background)', fontWeight: 700, fontSize: 13,
            border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
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
            border: '1px solid var(--border)', cursor: 'pointer',
            ...style,
        }}>
            {I && <I size={14} />} {children} {R && <R size={14} />}
        </button>
    );
}

function SectionExplain({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-start',
            padding: '10px 14px', marginBottom: 10,
            background: 'rgba(59,130,246,.06)', border: '1px solid rgba(59,130,246,.15)',
            borderLeft: '2px solid rgba(59,130,246,.5)', borderRadius: 10,
            fontSize: 12, color: 'var(--muted)', lineHeight: 1.5,
        }}>
            <Info size={14} style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 1 }} />
            <div>{children}</div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════ */

export default function Voorraad() {
    const { data: inventory, insert, update, remove } = useSupabase<InventoryItem>('inventory', []);
    const { data: recepten } = useSupabase<Recept>('recepten', []);
    const { data: supplierPrices } = useSupabase<any>('supplier_prices', []);
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

    /* ───── derived ───── */
    const totalItems = inventory.length;
    const lowStock = useMemo(() => inventory.filter(i => (i.current_stock || 0) < (i.min_stock || 0)), [inventory]);
    const outOfStock = useMemo(() => inventory.filter(i => (i.current_stock || 0) === 0), [inventory]);
    const totalValue = useMemo(() => inventory.reduce((s, i) => s + stockValue(i), 0), [inventory]);
    const tekortCost = useMemo(() => lowStock.reduce((s, i) => s + ((i.min_stock - i.current_stock) * (i.purchase_price || 0)), 0), [lowStock]);

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
        if (filter === 'Kritiek') return (i.current_stock || 0) < (i.min_stock || 0);
        if (filter === 'Op peil') return (i.current_stock || 0) >= (i.min_stock || 0);
        return i.categorie === filter;
    }), [inventory, filter, search]);

    /* ───── actions ───── */
    function quickAdjust(item: InventoryItem, amount: number) {
        const newStock = Math.max(0, (item.current_stock || 0) + amount);
        update(item.id, { current_stock: newStock } as any).then(() => {
            showToast(item.naam + ': ' + newStock + ' ' + item.unit, 'success');
        });
    }

    function setStock(item: InventoryItem, newStock: number) {
        update(item.id, { current_stock: Math.max(0, newStock) } as any);
    }

    function openNewItem() {
        setEditForm({ naam: '', categorie: 'Vlees', current_stock: 0, min_stock: 0, unit: 'kg', purchase_price: 0, supplier: '', yield_factor: 1.0 });
        setEditing('new');
    }

    function openEditItem(item: InventoryItem) {
        setEditForm(JSON.parse(JSON.stringify(item)));
        setEditing(item.id);
    }

    function saveItem() {
        if (!editForm.naam?.trim()) { showToast('Vul een naam in', 'error'); return; }
        if (editing === 'new') {
            insert(editForm).then(() => {
                showToast('Item toegevoegd aan voorraad', 'success');
                setEditing(null); setEditForm(null);
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
        doc.setFontSize(9); doc.text('Hop & Bites · BBQ Architect', 14, 20);
        const today = new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' });
        doc.text(today, 196, 20, { align: 'right' });

        doc.setTextColor(60, 60, 60);
        doc.setFontSize(10);
        let y = 40;
        doc.text(`Totaal producten: ${totalItems}`, 14, y);
        doc.text(`Onder minimum: ${lowStock.length}`, 75, y);
        doc.text(`Waarde: ${fmt(totalValue)}`, 140, y);
        y += 10;

        byCategory.forEach(cat => {
            const items = inventory.filter(i => i.categorie === cat.name);
            if (items.length === 0) return;

            autoTable(doc, {
                startY: y,
                head: [[cat.name.toUpperCase(), 'VOORRAAD', 'MIN', 'PRIJS', 'WAARDE', 'LEVERANCIER', 'STATUS']],
                body: items.map(i => {
                    const s = stockStatus(i);
                    return [
                        i.naam,
                        `${i.current_stock} ${i.unit}`,
                        `${i.min_stock} ${i.unit}`,
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

    /* ───── AI advies ───── */
    const [aiReport, setAiReport] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);

    async function generateAIReport() {
        setAiDrawerOpen(true);
        setAiLoading(true);
        setAiReport(null);
        await new Promise(r => setTimeout(r, 900));

        const lines: string[] = [];
        lines.push(`**Voorraad-analyse · ${new Date().toLocaleDateString('nl-NL')}**\n`);
        lines.push(`Je hebt **${totalItems} producten** met een totale waarde van **${fmt(totalValue)}**.\n`);

        if (lowStock.length > 0) {
            lines.push(`\n## Urgente actie nodig`);
            lines.push(`**${lowStock.length} items** staan onder minimum-voorraad. Geschatte inkoop om bij te vullen: **${fmt(tekortCost)}**.`);
            lines.push('\nTop 5 meest kritiek:');
            lowStock.slice(0, 5).forEach(i => {
                const tekort = i.min_stock - i.current_stock;
                lines.push(`- **${i.naam}** — ${i.current_stock}/${i.min_stock} ${i.unit} (tekort ${tekort.toFixed(1)} ${i.unit}) · ${i.supplier || 'geen leverancier'}`);
            });
        } else {
            lines.push(`\nAlle voorraden zijn op peil. Geen urgente acties.`);
        }

        if (outOfStock.length > 0) {
            lines.push(`\n## Volledig op`);
            outOfStock.forEach(i => lines.push(`- **${i.naam}** (${i.categorie}) — nu 0 ${i.unit}, bestel bij ${i.supplier || 'onbekend'}`));
        }

        const bySupplier: Record<string, InventoryItem[]> = {};
        lowStock.forEach(i => {
            const sup = i.supplier || 'Onbekend';
            if (!bySupplier[sup]) bySupplier[sup] = [];
            bySupplier[sup].push(i);
        });
        if (Object.keys(bySupplier).length > 0) {
            lines.push(`\n## Bestel-voorstel (gebundeld per leverancier)`);
            lines.push(`Bundel bestellingen om transportkosten en leveringen te beperken.`);
            Object.entries(bySupplier).forEach(([sup, items]) => {
                const totalSup = items.reduce((s, i) => s + ((i.min_stock - i.current_stock) * (i.purchase_price || 0)), 0);
                lines.push(`- **${sup}** — ${items.length} item(s) · ± ${fmt(totalSup)}`);
            });
        }

        const topValue = [...inventory].sort((a, b) => stockValue(b) - stockValue(a)).slice(0, 3);
        if (topValue.length > 0) {
            lines.push(`\n## Grootste voorraadwaarde`);
            lines.push(`Deze producten vertegenwoordigen de meeste waarde — houd ze goed bij.`);
            topValue.forEach(i => {
                lines.push(`- **${i.naam}** — ${fmt(stockValue(i))} (${i.current_stock} ${i.unit})`);
            });
        }

        lines.push(`\n## Aanbevelingen`);
        if (lowStock.length > 3) lines.push(`- Plan een wekelijks telling-moment om te voorkomen dat items onverwacht op zijn.`);
        lines.push(`- Koppel recepten aan ingrediënten zodat verbruik automatisch wordt bijgewerkt.`);
        lines.push(`- Gebruik de Telling-modus op je telefoon in de koeling — sneller dan met pen en papier.`);
        if (supplierPrices && supplierPrices.length > 0) lines.push(`- Open Price Intelligence om de goedkoopste leverancier per product te zien.`);
        else lines.push(`- Importeer CSV-prijslijsten in Price Intelligence om marges beter te bewaken.`);

        setAiReport(lines.join('\n'));
        setAiLoading(false);
    }

    async function downloadAIReport() {
        if (!aiReport) return;
        const { default: jsPDF } = await import('jspdf');
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        doc.setFillColor(18, 18, 20); doc.rect(0, 0, 210, 30, 'F');
        doc.setTextColor(196, 163, 90);
        doc.setFontSize(20); doc.text('AI Voorraad-advies', 14, 14);
        doc.setTextColor(148, 148, 148);
        doc.setFontSize(9); doc.text('Hop & Bites · BBQ Architect', 14, 20);
        const today = new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' });
        doc.text(today, 196, 20, { align: 'right' });

        doc.setTextColor(40, 40, 40);
        doc.setFontSize(10);
        let y = 42;
        const lines = aiReport.split('\n');
        lines.forEach(line => {
            if (y > 275) { doc.addPage(); y = 20; }
            if (line.startsWith('## ')) {
                y += 4;
                doc.setTextColor(196, 163, 90); doc.setFontSize(13); doc.setFont('helvetica', 'bold');
                doc.text(line.replace('## ', ''), 14, y); y += 7;
                doc.setTextColor(40, 40, 40); doc.setFontSize(10); doc.setFont('helvetica', 'normal');
            } else if (line.startsWith('**') && line.endsWith('**')) {
                doc.setFont('helvetica', 'bold');
                doc.text(line.replace(/\*\*/g, ''), 14, y); y += 6;
                doc.setFont('helvetica', 'normal');
            } else if (line.startsWith('- ')) {
                const text = line.replace(/\*\*/g, '').substring(2);
                const wrapped = doc.splitTextToSize('• ' + text, 180);
                doc.text(wrapped, 18, y); y += 5 * wrapped.length;
            } else if (line.trim()) {
                const text = line.replace(/\*\*/g, '');
                const wrapped = doc.splitTextToSize(text, 180);
                doc.text(wrapped, 14, y); y += 5 * wrapped.length;
            } else {
                y += 3;
            }
        });

        doc.setFontSize(8); doc.setTextColor(148, 148, 148);
        doc.text(`Gegenereerd door BBQ Architect AI · ${new Date().toLocaleString('nl-NL')}`, 14, 287);

        doc.save(`ai-voorraad-advies-${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('Advies-PDF gedownload', 'success');
    }

    /* ═══════════════════════════════════════════════════════════════════
       RENDER
       ═══════════════════════════════════════════════════════════════════ */

    // Edit modal takes over
    if (editing !== null && editForm) {
        return <EditItemView
            editForm={editForm} setEditForm={setEditForm}
            editing={editing}
            recepten={recepten}
            onSave={saveItem} onDelete={deleteItem}
            onClose={() => { setEditing(null); setEditForm(null); }}
        />;
    }

    // Count mode
    if (view === 'tellen') {
        return <CountMode
            inventory={inventory}
            byCategory={byCategory}
            onSetStock={setStock}
            onClose={() => setView('overzicht')}
        />;
    }

    // Inkooplijst
    if (view === 'inkooplijst') {
        return <InkooplijstView
            lowStock={lowStock}
            onClose={() => setView('overzicht')}
            onExport={exportPDF}
        />;
    }

    return (
        <RequireTier feature="voorraad">
        <div style={{ padding: '24px 32px 100px', maxWidth: 1440, margin: '0 auto' }}>

            {/* HERO */}
            <HeroHeader
                totalItems={totalItems}
                lowStockCount={lowStock.length}
                totalValue={totalValue}
                tekortCost={tekortCost}
                categoryCount={byCategory.length}
                onTell={() => setView('tellen')}
                onInkooplijst={() => setView('inkooplijst')}
                onPDF={exportPDF}
                onAI={generateAIReport}
                onAdd={openNewItem}
                onScan={() => setScannerOpen(true)}
            />

            {totalItems === 0 ? (
                <>
                    <div style={{ height: 20 }} />
                    <EmptyState page="/voorraad" onAction={openNewItem} />
                </>
            ) : (
                <>
                    <div style={{ height: 16 }} />
                    <SectionExplain>
                        <strong style={{ color: 'var(--text)' }}>Welkom bij je voorraad.</strong> Hieronder zie je in één oogopslag wat er is, wat je te weinig hebt en wat het waard is. Klik een product aan voor meer details. Rechtsboven staan de belangrijkste knoppen.
                    </SectionExplain>

                    <ActionPanel
                        lowStock={lowStock}
                        outOfStock={outOfStock}
                        tekortCost={tekortCost}
                        topByValue={[...inventory].sort((a, b) => stockValue(b) - stockValue(a)).slice(0, 5)}
                        onOpenItem={setSelectedId}
                        onOpenBuyList={() => setView('inkooplijst')}
                        onAIReport={generateAIReport}
                    />

                    {byCategory.length > 1 && (
                        <>
                            <div style={{ height: 20 }} />
                            <SectionExplain>
                                <strong style={{ color: 'var(--text)' }}>Verdeling per categorie.</strong> De donut laat zien waar je meeste voorraadwaarde zit. Zo weet je of je bijvoorbeeld veel vlees en weinig groenten hebt.
                            </SectionExplain>
                            <CategoryChart categories={byCategory} />
                        </>
                    )}

                    <div style={{ height: 20 }} />
                    <SectionExplain>
                        <strong style={{ color: 'var(--text)' }}>Alle producten.</strong> Zoek bovenin, of filter op categorie. Klik een rij aan om de details te zien. Gebruik <strong style={{ color: 'var(--text)' }}>−</strong> en <strong style={{ color: 'var(--text)' }}>+</strong> rechts om snel bij te werken zonder te openen.
                    </SectionExplain>
                    <FilterBar
                        search={search} setSearch={setSearch}
                        filter={filter} setFilter={setFilter}
                        counts={{
                            all: totalItems,
                            kritiek: lowStock.length,
                            peil: totalItems - lowStock.length,
                        }}
                    />

                    <div style={{ height: 14 }} />
                    <ProductTable
                        items={filtered}
                        onOpenItem={setSelectedId}
                        onAdjust={quickAdjust}
                    />

                    <div style={{ height: 20 }} />
                    <ZoWerktDit />
                </>
            )}

            {selectedId !== null && (
                <ItemDetailDrawer
                    item={inventory.find(i => i.id === selectedId)!}
                    supplierPrices={supplierPrices || []}
                    recepten={recepten || []}
                    onClose={() => setSelectedId(null)}
                    onAdjust={quickAdjust}
                    onEdit={() => {
                        const it = inventory.find(i => i.id === selectedId);
                        if (it) { setSelectedId(null); openEditItem(it); }
                    }}
                />
            )}

            {aiDrawerOpen && (
                <AIReportDrawer
                    loading={aiLoading}
                    report={aiReport}
                    onClose={() => setAiDrawerOpen(false)}
                    onDownload={downloadAIReport}
                    onRegenerate={generateAIReport}
                />
            )}

            <BarcodeScanner isOpen={scannerOpen} onScan={handleBarcodeScan} onClose={() => setScannerOpen(false)} />
        </div>
        </RequireTier>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   HERO
   ═══════════════════════════════════════════════════════════════════ */
function HeroHeader({ totalItems, lowStockCount, totalValue, tekortCost, categoryCount, onTell, onInkooplijst, onPDF, onAI, onAdd, onScan }: any) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <h1 style={{ fontFamily: 'Outfit, DM Sans, sans-serif', fontWeight: 200, fontSize: 34, letterSpacing: '-.015em', margin: 0 }}>Voorraad</h1>
                        <span style={{ padding: '2px 8px', borderRadius: 6, background: `${GOLD}20`, border: `1px solid ${GOLD}4D`, fontSize: 10, letterSpacing: '.2em', color: GOLD, fontWeight: 700 }}>SMART INVENTORY</span>
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                        {totalItems} producten · {categoryCount} categorieën · altijd zicht op wat je nodig hebt
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <div title="Open de telling-modus — makkelijk op je telefoon of tablet tijdens het tellen">
                        <BtnGhost icon={ClipboardCheck} onClick={onTell}>Tellen</BtnGhost>
                    </div>
                    <div title="Scan een barcode om snel een product te vinden">
                        <BtnGhost icon={Barcode} onClick={onScan}>Scan</BtnGhost>
                    </div>
                    <div title="Download een voorraadlijst als PDF — handig om op te hangen of mee te nemen">
                        <BtnGhost icon={Printer} onClick={onPDF}>Voorraadlijst PDF</BtnGhost>
                    </div>
                    <div title="Laat de AI een compleet advies-rapport maken over je voorraad">
                        <BtnGhost icon={Sparkles} right={ArrowUpRight} onClick={onAI} style={{ borderColor: `${GOLD}66`, color: GOLD }}>AI Advies</BtnGhost>
                    </div>
                    <div title="Voeg een nieuw product toe aan je voorraad">
                        <BtnPrimary icon={Plus} onClick={onAdd}>Item toevoegen</BtnPrimary>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
                <StatTile
                    label="Voorraadwaarde"
                    value={fmt(totalValue)}
                    sub={`${totalItems} producten`}
                    icon={Euro}
                />
                <StatTile
                    label={<Hint tip="Producten waar je minder van hebt dan je 'minimum'-instelling. Onder dit getal is het tijd om bij te bestellen.">Onder minimum</Hint>}
                    value={lowStockCount}
                    sub={lowStockCount > 0 ? 'bestellen' : 'alles op peil'}
                    tone={lowStockCount > 3 ? 'bad' : lowStockCount > 0 ? 'warn' : 'ok'}
                    icon={AlertTriangle}
                />
                <StatTile
                    label={<Hint tip="Geschat bedrag om alle items weer op minimum te krijgen. Excl. BTW, excl. bezorgkosten.">Nog te bestellen</Hint>}
                    value={fmt(tekortCost)}
                    sub="om bij te vullen"
                    tone={tekortCost > 0 ? 'warn' : undefined}
                    icon={ShoppingCart}
                />
                <StatTile
                    label="Categorieën"
                    value={categoryCount}
                    sub="in gebruik"
                    icon={PieChart}
                />
                <StatTile
                    label="Laatste update"
                    value={<span style={{ fontSize: 18 }}>live</span>}
                    sub="gesynct met Supabase"
                    tone="ok"
                    icon={Clock}
                />
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   ACTION PANEL
   ═══════════════════════════════════════════════════════════════════ */
function ActionPanel({ lowStock, outOfStock, tekortCost, topByValue, onOpenItem, onOpenBuyList, onAIReport }: any) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {/* Card 1 — onder minimum */}
            <MetalCard style={{ borderColor: lowStock.length > 0 ? 'rgba(239,68,68,.3)' : undefined }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: lowStock.length > 0 ? 'rgba(239,68,68,.04)' : 'transparent' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: lowStock.length > 0 ? 'rgba(239,68,68,.15)' : 'rgba(34,197,94,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${lowStock.length > 0 ? 'rgba(239,68,68,.3)' : 'rgba(34,197,94,.25)'}` }}>
                        {lowStock.length > 0 ? <AlertTriangle size={15} style={{ color: 'var(--red)' }} /> : <CheckCircle size={15} style={{ color: 'var(--green)' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                            <Hint tip="Producten waar de huidige voorraad onder het 'minimum' staat dat jij hebt ingesteld. Tijd om bij te bestellen.">Onder minimum</Hint>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{lowStock.length} items · ± {fmt(tekortCost)} nodig</div>
                    </div>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300, color: lowStock.length > 0 ? 'var(--red)' : 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>{lowStock.length}</div>
                </div>
                <div style={{ padding: 10, maxHeight: 240, overflow: 'auto' }}>
                    {lowStock.length === 0 ? (
                        <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                            <CheckCircle size={24} style={{ color: 'var(--green)', marginBottom: 8 }} />
                            <div>Alles op peil. Goed bezig! 👍</div>
                        </div>
                    ) : lowStock.slice(0, 5).map((i: InventoryItem) => {
                        const s = stockStatus(i);
                        const meta = CAT_META[i.categorie] || CAT_META.Overig;
                        return (
                            <div key={i.id} onClick={() => onOpenItem(i.id)} style={{
                                display: 'grid', gridTemplateColumns: '3px 1fr auto', gap: 10, alignItems: 'center',
                                padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                            }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <div style={{ width: 3, height: 24, background: meta.color, borderRadius: 2 }} />
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.naam}</div>
                                    <div style={{ fontSize: 10, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{i.current_stock} / {i.min_stock} {i.unit}</div>
                                </div>
                                <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', background: s.bg, color: s.color, border: `1px solid ${s.br}` }}>{s.label}</span>
                            </div>
                        );
                    })}
                    {lowStock.length > 5 && (
                        <div style={{ textAlign: 'center', padding: 8, fontSize: 11, color: 'var(--muted)' }}>
                            + {lowStock.length - 5} meer
                        </div>
                    )}
                </div>
                {lowStock.length > 0 && (
                    <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
                        <BtnPrimary icon={ShoppingCart} onClick={onOpenBuyList} style={{ width: '100%', justifyContent: 'center' }}>Open inkooplijst</BtnPrimary>
                    </div>
                )}
            </MetalCard>

            {/* Card 2 — top waarde */}
            <MetalCard>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `${GOLD}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${GOLD}4D` }}>
                        <Euro size={15} style={{ color: GOLD }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Grootste waarde</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>Top 5 dure items in voorraad</div>
                    </div>
                </div>
                <div style={{ padding: 10, maxHeight: 290, overflow: 'auto' }}>
                    {topByValue.length === 0 ? (
                        <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                            Nog geen producten in voorraad
                        </div>
                    ) : topByValue.map((i: InventoryItem) => {
                        const meta = CAT_META[i.categorie] || CAT_META.Overig;
                        return (
                            <div key={i.id} onClick={() => onOpenItem(i.id)} style={{
                                display: 'grid', gridTemplateColumns: '3px 1fr auto', gap: 10, alignItems: 'center',
                                padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                            }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <div style={{ width: 3, height: 24, background: meta.color, borderRadius: 2 }} />
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 500 }}>{i.naam}</div>
                                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{i.current_stock} {i.unit} · {i.categorie}</div>
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 600, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt(stockValue(i))}</span>
                            </div>
                        );
                    })}
                </div>
            </MetalCard>

            {/* Card 3 — AI */}
            <MetalCard style={{ borderColor: `${GOLD}4D`, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: `${GOLD}10` }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `${GOLD}26`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${GOLD}4D` }}>
                        <Sparkles size={15} style={{ color: GOLD }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>AI advies-rapport</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>Volledig rapport in 1 klik</div>
                    </div>
                    <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', background: `${GOLD}26`, color: GOLD, border: `1px solid ${GOLD}4D` }}>NIEUW</span>
                </div>
                <div style={{ padding: 14 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 14 }}>
                        Laat de AI je voorraad analyseren. Je krijgt een leesbaar rapport met:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                        {[
                            { icon: AlertTriangle, text: 'Wat urgent bijbesteld moet' },
                            { icon: ShoppingCart, text: 'Bestel-voorstel per leverancier' },
                            { icon: Euro, text: 'Grootste voorraadwaarde' },
                            { icon: Sparkles, text: 'Concrete aanbevelingen' },
                        ].map((it, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)' }}>
                                <it.icon size={12} style={{ color: GOLD }} />
                                {it.text}
                            </div>
                        ))}
                    </div>
                    <BtnPrimary icon={Sparkles} right={ArrowUpRight} onClick={onAIReport} style={{ width: '100%', justifyContent: 'center' }}>
                        Genereer advies
                    </BtnPrimary>
                </div>
            </MetalCard>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   CATEGORY CHART
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
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Waarde per categorie</span>
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
                            <circle key={s.name}
                                cx={CX} cy={CY} r={R}
                                fill="none" stroke={s.color}
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
                        <AlertTriangle size={10} /> Onder minimum · {counts.kritiek}
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
   PRODUCT TABLE
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
                    <Hint tip="De balk laat zien hoeveel je hebt t.o.v. je minimum-instelling. Rood = onder minimum, groen = voldoende.">Voorraad t.o.v. minimum</Hint>
                </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: 'rgba(130,130,130,.04)', borderBottom: '1px solid var(--border)' }}>
                            {['Item', 'Voorraad', 'Minimum', 'Prijs', 'Waarde', 'Leverancier', 'Status', ''].map(h => (
                                <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Waarde' || h === 'Prijs' ? 'right' : 'left', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(i => {
                            const s = stockStatus(i);
                            const meta = CAT_META[i.categorie] || CAT_META.Overig;
                            return (
                                <tr key={i.id}
                                    onClick={() => onOpenItem(i.id)}
                                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .12s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.02)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ padding: '10px 12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{ width: 3, height: 28, background: meta.color, borderRadius: 2 }} />
                                            <div>
                                                <div style={{ fontWeight: 500, fontSize: 12.5 }}>{i.naam}</div>
                                                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{i.categorie}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px 12px', minWidth: 140 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{ flex: 1, minWidth: 70, position: 'relative', height: 6, background: 'rgba(130,130,130,.12)', borderRadius: 3, overflow: 'visible' }}>
                                                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, s.pct)}%`, background: s.color, borderRadius: 3, transition: 'width .3s' }} />
                                            </div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: s.color, minWidth: 50, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                {i.current_stock} {i.unit}
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{i.min_stock} {i.unit}</td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(i.purchase_price || 0)}</td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt(stockValue(i))}</td>
                                    <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--muted)' }}>{i.supplier || '—'}</td>
                                    <td style={{ padding: '10px 12px' }}>
                                        <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', background: s.bg, color: s.color, border: `1px solid ${s.br}` }}>{s.label}</span>
                                    </td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                        <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                                            <button onClick={() => onAdjust(i, -1)} title="Eén eraf halen" style={{ width: 26, height: 26, borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>−</button>
                                            <button onClick={() => onAdjust(i, +1)} title="Eén erbij doen" style={{ width: 26, height: 26, borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>+</button>
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
   ITEM DETAIL DRAWER
   ═══════════════════════════════════════════════════════════════════ */
function ItemDetailDrawer({ item, supplierPrices, recepten, onClose, onAdjust, onEdit }: {
    item: InventoryItem; supplierPrices: any[]; recepten: Recept[]; onClose: () => void; onAdjust: (i: InventoryItem, a: number) => void; onEdit: () => void;
}) {
    const [tab, setTab] = useState<'overzicht' | 'prijs' | 'recepten'>('overzicht');
    const s = stockStatus(item);
    const meta = CAT_META[item.categorie] || CAT_META.Overig;

    const priceHistory = useMemo(() => {
        return (supplierPrices || [])
            .filter((p: any) => p.product_naam && p.product_naam.toLowerCase().includes(item.naam.toLowerCase()))
            .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }, [supplierPrices, item.naam]);

    const recipesUsing = useMemo(() => {
        return (recepten || []).filter((r: any) =>
            (r.ingredienten || []).some((ing: any) => ing.naam && ing.naam.toLowerCase().includes(item.naam.toLowerCase()))
        );
    }, [recepten, item.naam]);

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', zIndex: 9998 }} />
            <aside style={{ position: 'fixed', right: 0, top: 0, height: '100vh', width: 620, maxWidth: '100vw', background: 'var(--color-bg-elevated)', borderLeft: '1px solid var(--border)', zIndex: 9999, boxShadow: '-20px 0 40px rgba(0,0,0,.4)', display: 'flex', flexDirection: 'column' }}>

                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: `linear-gradient(180deg, ${meta.color}15, transparent)`, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${meta.color}, transparent)` }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}40` }}>{item.categorie.toUpperCase()}</span>
                                <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', background: s.bg, color: s.color, border: `1px solid ${s.br}` }}>{s.label}</span>
                            </div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 300, letterSpacing: '-.01em' }}>{item.naam}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>per {item.unit} · leverancier: {item.supplier || '—'}</div>
                        </div>
                        <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={16} />
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 20 }}>
                        <div>
                            <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--muted-light)', fontWeight: 700, textTransform: 'uppercase' }}>Huidige voorraad</div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 30, fontWeight: 300, color: s.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{item.current_stock}</div>
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>/ {item.min_stock} {item.unit}</div>
                            </div>
                            <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
                                <button onClick={() => onAdjust(item, -1)} style={{ padding: '4px 10px', minWidth: 32, borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>−1</button>
                                <button onClick={() => onAdjust(item, +1)} style={{ padding: '4px 10px', minWidth: 32, borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>+1</button>
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--muted-light)', fontWeight: 700, textTransform: 'uppercase' }}>Inkoopprijs</div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 300, marginTop: 4, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                                {fmt(item.purchase_price || 0)}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>per {item.unit}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--muted-light)', fontWeight: 700, textTransform: 'uppercase' }}>Voorraadwaarde</div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 300, color: GOLD, marginTop: 4, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fmt(stockValue(item))}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>totaal in voorraad</div>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 4, padding: '10px 18px 0', borderBottom: '1px solid var(--border)' }}>
                    {([
                        { id: 'overzicht' as const, label: 'Overzicht', Icon: Info },
                        { id: 'prijs' as const, label: 'Prijshistorie', Icon: History },
                        { id: 'recepten' as const, label: `Recepten (${recipesUsing.length})`, Icon: ChefHat },
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
                    {tab === 'overzicht' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <Eyebrow>Details</Eyebrow>
                                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <DetailRow label="Categorie" value={item.categorie} />
                                    <DetailRow label="Eenheid" value={item.unit} />
                                    <DetailRow label="Minimum-voorraad" value={`${item.min_stock} ${item.unit}`} />
                                    <DetailRow label="Huidige voorraad" value={`${item.current_stock} ${item.unit}`} />
                                    <DetailRow label="Inkoopprijs" value={fmt(item.purchase_price || 0)} />
                                    <DetailRow label="Leverancier" value={item.supplier || '—'} />
                                    <DetailRow label={<Hint tip="Yield factor = hoeveel er overblijft na bereiden. Bijv. 0.85 betekent dat je 15% kwijtraakt door schoonmaken/koken.">Yield factor</Hint>} value={`${item.yield_factor ?? 1.0}`} />
                                </div>
                            </div>
                            <div style={{ padding: 12, borderRadius: 10, background: `${GOLD}10`, border: `1px solid ${GOLD}33`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                <Sparkles size={14} style={{ color: GOLD, flexShrink: 0, marginTop: 1 }} />
                                <div style={{ fontSize: 12, lineHeight: 1.55 }}>
                                    <strong>Tip:</strong> Klik <em>Bewerken</em> onderaan om de prijs, minimum-voorraad of leverancier aan te passen. De +/- knoppen boven zijn voor het snel bijwerken van hoeveel je hebt liggen.
                                </div>
                            </div>
                        </div>
                    )}

                    {tab === 'prijs' && (
                        <div>
                            <Eyebrow>Prijshistorie uit Price Intelligence</Eyebrow>
                            {priceHistory.length === 0 ? (
                                <div style={{ marginTop: 16, padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12, border: '1px dashed var(--border)', borderRadius: 10 }}>
                                    <Info size={20} style={{ color: 'var(--muted-light)', marginBottom: 6 }} />
                                    <div>Nog geen prijsdata voor dit product.</div>
                                    <div style={{ fontSize: 11, marginTop: 6 }}>Importeer CSV&apos;s in <a href="/price-intelligence" style={{ color: GOLD, textDecoration: 'underline' }}>Price Intelligence</a> om trends te zien.</div>
                                </div>
                            ) : (
                                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {priceHistory.map((p: any, i: number) => (
                                        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
                                            <div style={{ width: 6, height: 6, borderRadius: 1, background: GOLD }} />
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 500 }}>{p.leverancier}</div>
                                                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.datum}</div>
                                            </div>
                                            <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(p.prijs)} <span style={{ fontSize: 10, color: 'var(--muted)' }}>/ {p.eenheid}</span></div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {tab === 'recepten' && (
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
                </div>

                <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', background: 'var(--color-bg-deep)' }}>
                    <BtnGhost icon={LinkIcon} onClick={onEdit}>Bewerken</BtnGhost>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {item.current_stock < item.min_stock && (
                            <Pill variant="danger">Onder minimum · bestel bij</Pill>
                        )}
                    </div>
                </div>
            </aside>
        </>
    );
}

function DetailRow({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
    return (
        <div style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>{value}</div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   EDIT ITEM VIEW
   ═══════════════════════════════════════════════════════════════════ */
function EditItemView({ editForm, setEditForm, editing, recepten, onSave, onDelete, onClose }: any) {
    function setField(k: string, v: any) { setEditForm({ ...editForm, [k]: v }); }
    const stockVal = (editForm.current_stock || 0) * (editForm.purchase_price || 0);
    const isLow = editForm.current_stock < editForm.min_stock;
    const usedIn = editing !== 'new' ? (recepten || []).filter((r: any) =>
        (r.ingredienten || []).some((ing: any) => ing.naam && ing.naam.toLowerCase().includes((editForm.naam || '').toLowerCase()))
    ) : [];

    return (
        <div style={{ padding: '24px 32px 100px', maxWidth: 900, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
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
                <strong style={{ color: 'var(--text)' }}>Hoe werkt dit?</strong> Geef je product een duidelijke naam, kies een categorie, en vul je <em>minimum-voorraad</em> in. Dat is het aantal waaronder we je gaan waarschuwen om bij te bestellen.
            </SectionExplain>

            <MetalCard>
                <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <Eyebrow>Naam *</Eyebrow>
                        <input value={editForm.naam} onChange={e => setField('naam', e.target.value)} placeholder="bijv. Pulled Pork, BBQ Saus..."
                            style={{ width: '100%', marginTop: 6, padding: '9px 12px', background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }} />
                    </div>
                    <div>
                        <Eyebrow>Categorie</Eyebrow>
                        <select value={editForm.categorie} onChange={e => setField('categorie', e.target.value)}
                            style={{ width: '100%', marginTop: 6, padding: '9px 12px', background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}>
                            {CATEGORIEEN.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <Eyebrow>Eenheid</Eyebrow>
                        <select value={editForm.unit} onChange={e => setField('unit', e.target.value)}
                            style={{ width: '100%', marginTop: 6, padding: '9px 12px', background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}>
                            {EENHEDEN.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                    </div>
                    <div>
                        <Eyebrow>Huidige voorraad</Eyebrow>
                        <input type="number" step="0.1" value={editForm.current_stock} onChange={e => setField('current_stock', parseFloat(e.target.value) || 0)}
                            style={{ width: '100%', marginTop: 6, padding: '9px 12px', background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }} />
                    </div>
                    <div>
                        <Eyebrow><Hint tip="Minimum = het aantal waaronder je wil worden gewaarschuwd dat je moet bestellen. Bijv. als je minimaal altijd 5 kg ribs wil hebben, zet 5 in.">Minimum-voorraad</Hint></Eyebrow>
                        <input type="number" step="0.1" value={editForm.min_stock} onChange={e => setField('min_stock', parseFloat(e.target.value) || 0)}
                            style={{ width: '100%', marginTop: 6, padding: '9px 12px', background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }} />
                    </div>
                    <div>
                        <Eyebrow>Inkoopprijs per {editForm.unit}</Eyebrow>
                        <input type="number" step="0.01" value={editForm.purchase_price} onChange={e => setField('purchase_price', parseFloat(e.target.value) || 0)}
                            style={{ width: '100%', marginTop: 6, padding: '9px 12px', background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }} />
                    </div>
                    <div>
                        <Eyebrow><Hint tip="Hoeveel % blijft over na bereiden. 1.0 = niets kwijt. 0.85 = je raakt 15% kwijt bij schoonmaken/koken. Helpt bij kostprijs-berekening.">Yield factor</Hint></Eyebrow>
                        <input type="number" step="0.05" min="0.1" max="1" value={editForm.yield_factor ?? 1.0} onChange={e => setField('yield_factor', parseFloat(e.target.value) || 1.0)}
                            style={{ width: '100%', marginTop: 6, padding: '9px 12px', background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <Eyebrow>Leverancier</Eyebrow>
                        <input value={editForm.supplier || ''} onChange={e => setField('supplier', e.target.value)} placeholder="bijv. Sligro, Hanos, Makro..."
                            style={{ width: '100%', marginTop: 6, padding: '9px 12px', background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }} />
                    </div>
                </div>

                <div style={{ padding: '0 24px 20px' }}>
                    <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: isLow ? 'rgba(239,68,68,.06)' : 'rgba(196,163,90,.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '.15em', textTransform: 'uppercase', fontWeight: 700 }}>Voorraadwaarde</div>
                            <div style={{ fontSize: 24, fontWeight: 500, color: GOLD, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{fmt(stockVal)}</div>
                        </div>
                        {isLow && <Pill variant="danger">⚠ Onder minimum</Pill>}
                    </div>
                </div>

                {usedIn.length > 0 && (
                    <div style={{ padding: '0 24px 20px' }}>
                        <Eyebrow>Gebruikt in {usedIn.length} recept(en)</Eyebrow>
                        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {usedIn.map((r: any) => (
                                <Pill key={r.id} variant="brand"><ChefHat size={10} /> {r.naam}</Pill>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', background: 'var(--color-bg-deep)' }}>
                    <div>
                        {editing !== 'new' && (
                            <button onClick={onDelete} style={{ padding: '9px 14px', borderRadius: 10, background: 'transparent', color: 'var(--red)', fontWeight: 600, fontSize: 13, border: '1px solid rgba(239,68,68,.4)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <Trash2 size={14} /> Verwijderen
                            </button>
                        )}
                    </div>
                    <BtnPrimary icon={Save} onClick={onSave}>Opslaan</BtnPrimary>
                </div>
            </MetalCard>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   COUNT MODE (mobile-first)
   ═══════════════════════════════════════════════════════════════════ */
function CountMode({ inventory, byCategory, onSetStock, onClose }: { inventory: InventoryItem[]; byCategory: any[]; onSetStock: (i: InventoryItem, n: number) => void; onClose: () => void }) {
    const [catIdx, setCatIdx] = useState(0);
    const [itemIdx, setItemIdx] = useState(0);
    const [tmpValue, setTmpValue] = useState<string>('');
    const inputRef = useRef<HTMLInputElement>(null);

    const cats = byCategory.map(c => c.name);
    if (cats.length === 0) {
        return (
            <div style={{ padding: 40, textAlign: 'center' }}>
                <BtnGhost icon={ArrowLeft} onClick={onClose}>Terug</BtnGhost>
                <div style={{ marginTop: 20, color: 'var(--muted)' }}>Geen producten om te tellen.</div>
            </div>
        );
    }

    const currentCat = cats[catIdx];
    const itemsInCat = inventory.filter(i => i.categorie === currentCat);
    const currentItem = itemsInCat[itemIdx];
    const totalDone = catIdx * 100 + itemIdx;
    const totalItems = inventory.length;

    function next() {
        if (tmpValue !== '' && currentItem) {
            onSetStock(currentItem, parseFloat(tmpValue) || 0);
        }
        setTmpValue('');
        if (itemIdx < itemsInCat.length - 1) {
            setItemIdx(itemIdx + 1);
        } else if (catIdx < cats.length - 1) {
            setCatIdx(catIdx + 1);
            setItemIdx(0);
        } else {
            onClose();
        }
    }

    function skip() { setTmpValue(''); next(); }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 100, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <BtnGhost icon={X} onClick={onClose}>Sluiten</BtnGhost>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                    <ClipboardCheck size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                    Telling-modus
                </div>
            </div>

            <div style={{ padding: 16 }}>
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(130,130,130,.15)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(totalDone / totalItems) * 100}%`, background: GOLD, transition: 'width .3s' }} />
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
                    Categorie {catIdx + 1} van {cats.length} · <strong style={{ color: 'var(--text)' }}>{currentCat}</strong> · item {itemIdx + 1} van {itemsInCat.length}
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                {currentItem && (
                    <MetalCard style={{ maxWidth: 500, width: '100%' }}>
                        <div style={{ padding: 32, textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.2em', textTransform: 'uppercase', fontWeight: 700 }}>
                                {currentItem.categorie}
                            </div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 32, fontWeight: 300, marginTop: 12 }}>{currentItem.naam}</div>
                            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                                nu bekend: <strong style={{ color: 'var(--text)' }}>{currentItem.current_stock} {currentItem.unit}</strong>
                            </div>

                            <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
                                <button onClick={() => setTmpValue(String(Math.max(0, (parseFloat(tmpValue) || currentItem.current_stock || 0) - 1)))}
                                    style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--color-bg-deep)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 28, cursor: 'pointer' }}>
                                    <Minus size={24} />
                                </button>
                                <input
                                    ref={inputRef}
                                    type="number"
                                    step="0.1"
                                    value={tmpValue}
                                    onChange={e => setTmpValue(e.target.value)}
                                    placeholder={String(currentItem.current_stock)}
                                    style={{
                                        width: 140, height: 80, textAlign: 'center',
                                        fontSize: 36, fontWeight: 300, fontFamily: 'Outfit, sans-serif',
                                        background: 'var(--color-bg-deep)', border: `2px solid ${GOLD}`, borderRadius: 14,
                                        color: 'var(--text)', outline: 'none', fontVariantNumeric: 'tabular-nums',
                                    }}
                                    autoFocus
                                />
                                <button onClick={() => setTmpValue(String((parseFloat(tmpValue) || currentItem.current_stock || 0) + 1))}
                                    style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--color-bg-deep)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 28, cursor: 'pointer' }}>
                                    <Plus size={24} />
                                </button>
                            </div>
                            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>in {currentItem.unit}</div>
                        </div>

                        <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
                            <BtnGhost onClick={skip} style={{ flex: 1, justifyContent: 'center' }}>Overslaan</BtnGhost>
                            <BtnPrimary right={ChevronRight} onClick={next} style={{ flex: 2, justifyContent: 'center' }}>Volgende</BtnPrimary>
                        </div>
                    </MetalCard>
                )}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   INKOOPLIJST VIEW
   ═══════════════════════════════════════════════════════════════════ */
function InkooplijstView({ lowStock, onClose, onExport }: { lowStock: InventoryItem[]; onClose: () => void; onExport: () => void }) {
    const bySupplier = useMemo(() => {
        const m: Record<string, { items: InventoryItem[]; total: number }> = {};
        lowStock.forEach(i => {
            const sup = i.supplier || 'Geen leverancier';
            if (!m[sup]) m[sup] = { items: [], total: 0 };
            const tekort = Math.max(0, (i.min_stock || 0) - (i.current_stock || 0));
            m[sup].items.push(i);
            m[sup].total += tekort * (i.purchase_price || 0);
        });
        return Object.entries(m).sort((a, b) => b[1].total - a[1].total);
    }, [lowStock]);

    const grandTotal = bySupplier.reduce((s, [, v]) => s + v.total, 0);

    return (
        <div style={{ padding: '24px 32px 100px', maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <ArrowLeft size={14} /> Terug
                </button>
                <div style={{ flex: 1 }}>
                    <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 200, fontSize: 28, margin: 0 }}>Inkooplijst</h1>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{lowStock.length} items bestellen · totaal {fmt(grandTotal)}</div>
                </div>
                <BtnGhost icon={Printer} onClick={onExport}>Download PDF</BtnGhost>
            </div>

            <SectionExplain>
                <strong style={{ color: 'var(--text)' }}>Wat zie je hier?</strong> Alle items die onder je minimum staan, automatisch gegroepeerd per leverancier. Zo kan je alles bij één partij bestellen. De prijs is gebaseerd op wat je in de kaart van het product hebt ingevuld.
            </SectionExplain>

            {bySupplier.length === 0 ? (
                <MetalCard>
                    <div style={{ padding: 60, textAlign: 'center' }}>
                        <CheckCircle size={40} style={{ color: 'var(--green)' }} />
                        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 12 }}>Alles op peil!</div>
                        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Je hoeft nu niks te bestellen. 🎉</div>
                    </div>
                </MetalCard>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {bySupplier.map(([sup, { items, total }]) => (
                        <MetalCard key={sup}>
                            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${GOLD}22`, border: `1px solid ${GOLD}4D`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <ShoppingCart size={16} style={{ color: GOLD }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 14, fontWeight: 600 }}>{sup}</div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{items.length} item(s)</div>
                                </div>
                                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 20, fontWeight: 500, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</div>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                    <tr style={{ background: 'rgba(130,130,130,.04)', borderBottom: '1px solid var(--border)' }}>
                                        {['Item', 'Voorraad', 'Min', 'Tekort', 'Prijs', 'Subtotaal'].map(h => (
                                            <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Prijs' || h === 'Subtotaal' ? 'right' : 'left', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(i => {
                                        const tekort = Math.max(0, (i.min_stock || 0) - (i.current_stock || 0));
                                        const subtotal = tekort * (i.purchase_price || 0);
                                        return (
                                            <tr key={i.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '10px 12px', fontWeight: 500 }}>{i.naam}</td>
                                                <td style={{ padding: '10px 12px', color: 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>{i.current_stock} {i.unit}</td>
                                                <td style={{ padding: '10px 12px', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{i.min_stock} {i.unit}</td>
                                                <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--amber)', fontVariantNumeric: 'tabular-nums' }}>+{tekort.toFixed(1)} {i.unit}</td>
                                                <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(i.purchase_price || 0)}</td>
                                                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt(subtotal)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </MetalCard>
                    ))}
                    <div style={{ padding: 16, borderRadius: 10, background: `${GOLD}10`, border: `1px solid ${GOLD}40`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>Totaal inkoopbedrag</div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 500, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt(grandTotal)}</div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   AI REPORT DRAWER
   ═══════════════════════════════════════════════════════════════════ */
function AIReportDrawer({ loading, report, onClose, onDownload, onRegenerate }: { loading: boolean; report: string | null; onClose: () => void; onDownload: () => void; onRegenerate: () => void }) {
    function renderReport(md: string) {
        return md.split('\n').map((line, i) => {
            if (line.startsWith('## ')) return <h3 key={i} style={{ fontFamily: 'Outfit, sans-serif', fontSize: 18, fontWeight: 400, color: GOLD, margin: '20px 0 8px' }}>{line.replace('## ', '')}</h3>;
            if (line.startsWith('**') && line.endsWith('**')) return <div key={i} style={{ fontWeight: 600, marginTop: 10, marginBottom: 6 }}>{line.replace(/\*\*/g, '')}</div>;
            if (line.startsWith('- ')) {
                const text = line.substring(2).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                return <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 13 }}>
                    <span style={{ color: GOLD, flexShrink: 0 }}>•</span>
                    <span dangerouslySetInnerHTML={{ __html: text }} />
                </div>;
            }
            if (line.trim()) {
                const text = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                return <p key={i} style={{ fontSize: 13, lineHeight: 1.6, margin: '6px 0' }} dangerouslySetInnerHTML={{ __html: text }} />;
            }
            return <div key={i} style={{ height: 4 }} />;
        });
    }

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', zIndex: 9998 }} />
            <aside style={{ position: 'fixed', right: 0, top: 0, height: '100vh', width: 680, maxWidth: '100vw', background: 'var(--color-bg-elevated)', borderLeft: '1px solid var(--border)', zIndex: 9999, boxShadow: '-20px 0 40px rgba(0,0,0,.4)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: `linear-gradient(180deg, ${GOLD}15, transparent)`, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <Sparkles size={14} style={{ color: GOLD }} />
                                <span style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '.15em', textTransform: 'uppercase' }}>AI Voorraad-advies</span>
                            </div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 300 }}>Jouw rapport</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Automatisch gegenereerd op basis van je live voorraad</div>
                        </div>
                        <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
                    {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                            <Sparkles size={36} style={{ color: GOLD, animation: 'pulse 1.5s ease-in-out infinite' }} />
                            <div style={{ fontSize: 14, color: 'var(--muted)' }}>AI analyseert je voorraad…</div>
                        </div>
                    ) : report ? (
                        <div>{renderReport(report)}</div>
                    ) : (
                        <div style={{ textAlign: 'center', color: 'var(--muted)' }}>Geen rapport beschikbaar.</div>
                    )}
                </div>

                {report && !loading && (
                    <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'space-between', background: 'var(--color-bg-deep)' }}>
                        <BtnGhost icon={Sparkles} onClick={onRegenerate}>Opnieuw genereren</BtnGhost>
                        <BtnPrimary icon={FileText} onClick={onDownload}>Download als PDF</BtnPrimary>
                    </div>
                )}
            </aside>
        </>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   ZO WERKT DIT (footer)
   ═══════════════════════════════════════════════════════════════════ */
function ZoWerktDit() {
    return (
        <div style={{ padding: 16, borderRadius: 10, background: `${GOLD}0A`, border: `1px solid ${GOLD}26`, display: 'flex', gap: 12, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            <BookOpen size={16} style={{ color: GOLD, flexShrink: 0, marginTop: 1 }} />
            <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: 6 }}>Zo werkt voorraad</div>
                <div style={{ marginBottom: 6 }}>
                    <strong style={{ color: 'var(--text)' }}>1. Items toevoegen</strong> — klik <em>Item toevoegen</em> en vul naam, categorie, eenheid en <Hint tip="Minimum = onder dit aantal krijg je een waarschuwing om bij te bestellen. Stel dit zorgvuldig in per product.">minimum-voorraad</Hint> in.
                </div>
                <div style={{ marginBottom: 6 }}>
                    <strong style={{ color: 'var(--text)' }}>2. Voorraad bijhouden</strong> — gebruik <strong>−</strong> en <strong>+</strong> in de tabel, of open een product voor meer opties. Voor een volledige telling: klik <em>Tellen</em> — werkt prima op je telefoon in de koeling.
                </div>
                <div style={{ marginBottom: 6 }}>
                    <strong style={{ color: 'var(--text)' }}>3. Bestellen</strong> — als iets onder minimum komt, verschijnt het bovenaan. Klik <em>Open inkooplijst</em> voor een overzicht per leverancier. Exporteer als PDF om mee te nemen.
                </div>
                <div>
                    <strong style={{ color: 'var(--text)' }}>4. AI advies</strong> — klik <em>AI Advies</em> rechtsboven voor een compleet rapport met urgenties, bestel-voorstel en aanbevelingen. Download als PDF voor je team.
                </div>
            </div>
        </div>
    );
}
