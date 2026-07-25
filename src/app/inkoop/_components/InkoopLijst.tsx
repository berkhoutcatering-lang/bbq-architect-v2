/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
/**
 * InkoopLijst — hoofd-component van /inkoop (bucket D · P0-2)
 * ───────────────────────────────────────────────────────────
 * Vervangt het oude tab-systeem (leveranciers/bonnen/archief) door één
 * focus: "Wat moet ik bestellen voor de events komende 14 dagen, per leverancier?".
 *
 * Per leverancier-card:
 *   - header: naam · type · items-count · €totaal · deadline-pill · bel-link
 *   - rij per ingredient: naam · inline qty-edit (debounce 500ms → updateOverride)
 *     · prijs · totaal · "x" om te verwijderen · "shuffle" om ander leverancier te kiezen
 *   - footer: [Edit lijst] [PDF preview] [Verstuur naar X] of [Print + Bel]
 *
 * Optimistic UI via useOptimistic: qty-edit verschijnt direct in het scherm
 * en wordt geldig zodra de server bevestigt; bij error revert + toast.
 */
import {
    useCallback,
    useEffect,
    useMemo,
    useOptimistic,
    useRef,
    useState,
    useTransition,
} from 'react';
import {
    ShoppingCart,
    Truck,
    Store,
    Clock,
    Phone,
    FileText,
    Send,
    X,
    AlertTriangle,
    Loader2,
    Pencil,
    Printer,
    Repeat2,
    ChevronDown,
    ChevronRight,
    ExternalLink,
    Search,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import InkoopEmpty from './InkoopEmpty';
import MissingSupplierBanner from './MissingSupplierBanner';
import {
    updateOverrideAction,
    sendOrderToSupplierAction,
} from '../actions';
import type {
    BestelvoorstelSummary,
    BestelvoorstelLeverancier,
    BestelvoorstelItem,
} from '@/lib/dal/bestelvoorstel';

interface InkoopLijstProps {
    initialSummary: BestelvoorstelSummary;
    leveranciers: Array<{ id: number; naam: string; type: string; email: string | null; tel: string | null }>;
    events_count: number;
    has_menu_items: boolean;
}

export default function InkoopLijst(props: InkoopLijstProps) {
    const router = useRouter();
    const showToast = useToast();
    const [summary, setSummary] = useState<BestelvoorstelSummary>(props.initialSummary);
    const [pdfPreviewFor, setPdfPreviewFor] = useState<BestelvoorstelLeverancier | null>(null);

    // Optimistic state — voor inline qty-edit/remove flow.
    type Patch =
        | { kind: 'qty'; inventory_id: number; qty: number }
        | { kind: 'remove'; inventory_id: number }
        | { kind: 'move'; inventory_id: number; to_leverancier_id: number }
        | { kind: 'reset_qty'; inventory_id: number };
    const [optimisticSummary, applyPatch] = useOptimistic<BestelvoorstelSummary, Patch>(
        summary,
        function (state, patch) {
            const next: BestelvoorstelSummary = {
                ...state,
                per_leverancier: state.per_leverancier.map(function (lev) {
                    return { ...lev, items: lev.items.map(function (it) { return { ...it }; }) };
                }),
            };
            if (patch.kind === 'qty') {
                next.per_leverancier.forEach(function (lev) {
                    lev.items.forEach(function (it) {
                        if (it.inventory_id === patch.inventory_id) {
                            it.qty = patch.qty;
                            if (it.unit_price_eur != null) {
                                it.est_total_eur = Math.round(patch.qty * it.unit_price_eur * 100) / 100;
                            }
                            it.override_applied = true;
                        }
                    });
                    lev.subtotal_eur = Math.round(
                        lev.items.reduce((s, it) => s + it.est_total_eur, 0) * 100,
                    ) / 100;
                });
            } else if (patch.kind === 'remove') {
                next.per_leverancier.forEach(function (lev) {
                    lev.items = lev.items.filter(function (it) { return it.inventory_id !== patch.inventory_id; });
                    lev.subtotal_eur = Math.round(
                        lev.items.reduce((s, it) => s + it.est_total_eur, 0) * 100,
                    ) / 100;
                });
                next.per_leverancier = next.per_leverancier.filter(function (l) { return l.items.length > 0; });
            } else if (patch.kind === 'reset_qty') {
                next.per_leverancier.forEach(function (lev) {
                    lev.items.forEach(function (it) {
                        if (it.inventory_id === patch.inventory_id) {
                            it.qty = it.original_qty;
                            if (it.unit_price_eur != null) {
                                it.est_total_eur = Math.round(it.original_qty * it.unit_price_eur * 100) / 100;
                            }
                            it.override_applied = false;
                        }
                    });
                });
            }
            const totalItems = next.per_leverancier.reduce((s, l) => s + l.items.length, 0);
            const totalEur = next.per_leverancier.reduce((s, l) => s + l.subtotal_eur, 0);
            next.totals = { ...state.totals, items_total: totalItems, estimated_total_eur: Math.round(totalEur * 100) / 100 };
            return next;
        },
    );

    // Sync wanneer parent een nieuwe summary doorgeeft (revalidatePath).
    useEffect(function () { setSummary(props.initialSummary); }, [props.initialSummary]);

    // Banner data berekenen.
    const unboundItems = useMemo(function () {
        const unknown = optimisticSummary.per_leverancier.find(function (l) { return l.leverancier_id == null; });
        return unknown
            ? unknown.items.map(function (it) { return { ...it, _orig_leverancier_id: null as null | number }; })
            : [];
    }, [optimisticSummary.per_leverancier]);

    const knownBuckets = optimisticSummary.per_leverancier.filter(function (l) { return l.leverancier_id != null; });

    // Lege-state pad.
    if (
        optimisticSummary.per_leverancier.length === 0
        && optimisticSummary.unmatched_ingredients.length === 0
    ) {
        return (
            <InkoopEmpty
                eventsInWindow={props.events_count}
                hasMenuItems={props.has_menu_items}
            />
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Header summary={optimisticSummary} />

            <MissingSupplierBanner
                unboundItems={unboundItems}
                unmatchedIngredients={optimisticSummary.unmatched_ingredients}
                leveranciers={props.leveranciers}
                onAssigned={() => router.refresh()}
            />

            {knownBuckets.length === 0 && unboundItems.length === 0
                ? (
                    <InkoopEmpty
                        eventsInWindow={props.events_count}
                        hasMenuItems={props.has_menu_items}
                    />
                )
                : null}

            {knownBuckets.map(function (bucket) {
                return (
                    <SupplierCard
                        key={String(bucket.leverancier_id)}
                        bucket={bucket}
                        leveranciers={props.leveranciers}
                        applyPatch={applyPatch}
                        onPDF={() => setPdfPreviewFor(bucket)}
                        onAfterSend={() => router.refresh()}
                    />
                );
            })}

            {pdfPreviewFor && (
                <PdfPreviewModal
                    bucket={pdfPreviewFor}
                    onClose={() => setPdfPreviewFor(null)}
                    onAfterSend={function () {
                        setPdfPreviewFor(null);
                        router.refresh();
                    }}
                    showToast={showToast}
                />
            )}
        </div>
    );
}

function Header({ summary }: { summary: BestelvoorstelSummary }) {
    return (
        <div
            style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
            }}
        >
            <KpiTile icon={<ShoppingCart size={17} />} value={summary.totals.items_total} sub="items te bestellen" />
            <KpiTile icon={<Truck size={17} />} value={summary.totals.leveranciers_count} sub="leveranciers" />
            <KpiTile
                icon={<span style={{ fontSize: 16, fontWeight: 700 }}>€</span>}
                value={summary.totals.estimated_total_eur.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })}
                sub={`geschat · volgende ${summary.totals.window_days}d`}
            />
        </div>
    );
}

function KpiTile({ icon, value, sub }: { icon: React.ReactNode; value: React.ReactNode; sub: string }) {
    return (
        <div
            style={{
                flex: 1,
                minWidth: 180,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 18px',
                borderRadius: 'var(--radius-md, 12px)',
                background: 'var(--card)',
                border: '1px solid var(--border)',
            }}
        >
            <div
                style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: 'var(--brand-tint-subtle, rgba(196,163,90,.08))',
                    border: '1px solid var(--brand-tint-border, rgba(196,163,90,.2))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--brand-gold, #c4a35a)',
                    flexShrink: 0,
                }}
            >
                {icon}
            </div>
            <div>
                <div style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{sub}</div>
            </div>
        </div>
    );
}

interface SupplierCardProps {
    bucket: BestelvoorstelLeverancier;
    leveranciers: Array<{ id: number; naam: string; type: string; email: string | null; tel: string | null }>;
    applyPatch: (patch: any) => void;
    onPDF: () => void;
    onAfterSend: () => void;
}

function SupplierCard({ bucket, leveranciers, applyPatch, onPDF, onAfterSend }: SupplierCardProps) {
    const isManual = !bucket.leverancier_email;
    const earliestEventDate = useMemo(function () {
        const dates = bucket.items.flatMap(function (it) { return it.events.map(function (e) { return e.event_date; }); });
        if (dates.length === 0) return null;
        return dates.sort()[0];
    }, [bucket.items]);

    /* Bestel-vóór-deadline = eerste event − levertijd van DEZE leverancier
       (fix #3: per-leverancier i.p.v. een globale 8). Val terug op 8 dagen als
       de leverancier geen lead_time_days heeft. */
    const DEFAULT_LEAD_DAYS = 8;
    const deadlinePill = useMemo(function () {
        if (!earliestEventDate) return null;
        const lead = bucket.lead_time_days ?? DEFAULT_LEAD_DAYS;
        const orderBy = new Date(earliestEventDate + 'T00:00:00');
        orderBy.setDate(orderBy.getDate() - lead);
        const diff = Math.ceil((orderBy.getTime() - Date.now()) / 86400000);
        if (diff <= 0) return { text: 'nu bestellen', urgent: true };
        if (diff <= 2) return { text: `over ${diff}d`, urgent: true };
        if (diff <= 7) return { text: `over ${diff}d`, urgent: false };
        return { text: orderBy.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }), urgent: false };
    }, [earliestEventDate, bucket.lead_time_days]);

    return (
        <article
            style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg, 14px)',
                overflow: 'hidden',
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    borderBottom: '1px solid var(--border)',
                }}
            >
                <div
                    style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: isManual ? 'rgba(239,68,68,.08)' : 'rgba(255,191,0,.10)',
                        border: isManual ? '1px solid rgba(239,68,68,.22)' : '1px solid rgba(255,191,0,.22)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isManual ? 'var(--red, #ef4444)' : 'var(--brand, #FFBF00)',
                        flexShrink: 0,
                    }}
                >
                    {isManual ? <Store size={18} /> : <ShoppingCart size={18} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{bucket.leverancier_naam}</div>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginTop: 3,
                            fontSize: 12,
                            color: 'var(--muted)',
                            flexWrap: 'wrap',
                        }}
                    >
                        <span>{bucket.items.length} item{bucket.items.length === 1 ? '' : 's'}</span>
                        <span>·</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>
                            {bucket.subtotal_eur.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })}
                        </span>
                        {deadlinePill && (
                            <>
                                <span>·</span>
                                <span
                                    style={{
                                        color: deadlinePill.urgent ? 'var(--amber, #f59e0b)' : 'var(--muted)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                    }}
                                >
                                    <Clock size={11} /> bestel vóór {deadlinePill.text}
                                </span>
                            </>
                        )}
                        {bucket.leverancier_phone && (
                            <>
                                <span>·</span>
                                <a
                                    href={`tel:${bucket.leverancier_phone.replace(/[^+\d]/g, '')}`}
                                    style={{
                                        color: 'var(--cyan, #06b6d4)',
                                        textDecoration: 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                    }}
                                >
                                    <Phone size={11} /> {bucket.leverancier_phone}
                                </a>
                            </>
                        )}
                    </div>
                </div>
                {isManual && (
                    <span
                        style={{
                            fontSize: 10,
                            padding: '4px 10px',
                            borderRadius: 999,
                            background: 'rgba(239,68,68,.12)',
                            color: 'var(--red, #ef4444)',
                            fontWeight: 700,
                            letterSpacing: 0.4,
                            textTransform: 'uppercase',
                        }}
                    >
                        Handmatig
                    </span>
                )}
            </div>

            {/* Items */}
            <div>
                {bucket.items.map(function (item, idx) {
                    return (
                        <ItemRow
                            key={item.inventory_id}
                            item={item}
                            bucket={bucket}
                            otherSuppliers={leveranciers.filter(function (l) { return l.id !== bucket.leverancier_id; })}
                            isLast={idx === bucket.items.length - 1}
                            applyPatch={applyPatch}
                        />
                    );
                })}
            </div>

            {/* Footer */}
            <div
                style={{
                    padding: '12px 18px',
                    borderTop: '1px solid var(--border)',
                    background: 'rgba(255,255,255,.02)',
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                }}
            >
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={onPDF}
                    aria-label="Open PDF-preview"
                >
                    <FileText size={14} /> PDF preview
                </button>
                {isManual ? (
                    <>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={onPDF}>
                            <Printer size={14} /> Print
                        </button>
                        {bucket.leverancier_phone && (
                            <a
                                href={`tel:${bucket.leverancier_phone.replace(/[^+\d]/g, '')}`}
                                className="btn btn-brand btn-sm"
                                style={{ marginLeft: 'auto', textDecoration: 'none' }}
                            >
                                <Phone size={14} /> Bel met lijst
                            </a>
                        )}
                    </>
                ) : (
                    <button
                        type="button"
                        className="btn btn-brand btn-sm"
                        onClick={onPDF}
                        style={{ marginLeft: 'auto' }}
                        disabled={!bucket.concept_order_id}
                    >
                        <Send size={14} /> Verstuur naar {firstWord(bucket.leverancier_naam)}
                    </button>
                )}
            </div>
        </article>
    );
}

function firstWord(s: string): string {
    return (s || '').split(/\s+/)[0] || s;
}

interface ItemRowProps {
    item: BestelvoorstelItem;
    bucket: BestelvoorstelLeverancier;
    otherSuppliers: Array<{ id: number; naam: string }>;
    isLast: boolean;
    applyPatch: (patch: any) => void;
}

function ItemRow({ item, bucket, otherSuppliers, isLast, applyPatch }: ItemRowProps) {
    const showToast = useToast();
    const [editing, setEditing] = useState(false);
    const [qtyDraft, setQtyDraft] = useState(item.qty);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isPending, startTransition] = useTransition();
    const [showAlt, setShowAlt] = useState(false);
    const [showWhy, setShowWhy] = useState(false);

    useEffect(function () { setQtyDraft(item.qty); }, [item.qty]);

    function persistQty(nextQty: number) {
        if (!bucket.concept_order_id) {
            showToast('Order kon niet opgeslagen worden — herlaad pagina', 'error');
            return;
        }
        if (nextQty === item.original_qty) {
            // Reset terug naar berekende waarde.
            applyPatch({ kind: 'reset_qty', inventory_id: item.inventory_id });
            startTransition(async function () {
                await updateOverrideAction({
                    concept_order_id: bucket.concept_order_id!,
                    inventory_id: item.inventory_id,
                    override_qty: null,
                });
            });
            return;
        }
        applyPatch({ kind: 'qty', inventory_id: item.inventory_id, qty: nextQty });
        startTransition(async function () {
            const res = await updateOverrideAction({
                concept_order_id: bucket.concept_order_id!,
                inventory_id: item.inventory_id,
                override_qty: nextQty,
            });
            if (!res.ok) {
                showToast(res.error || 'Opslaan mislukt', 'error');
            }
        });
    }

    function onQtyChange(v: number) {
        setQtyDraft(v);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(function () { persistQty(v); }, 500);
    }

    function commitNow() {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setEditing(false);
        if (qtyDraft !== item.qty) persistQty(qtyDraft);
    }

    function handleRemove() {
        if (!bucket.concept_order_id) return;
        applyPatch({ kind: 'remove', inventory_id: item.inventory_id });
        startTransition(async function () {
            const res = await updateOverrideAction({
                concept_order_id: bucket.concept_order_id!,
                inventory_id: item.inventory_id,
                removed: true,
            });
            if (!res.ok) showToast(res.error || 'Verwijderen mislukt', 'error');
        });
    }

    function handleMove(toLevId: number) {
        if (!bucket.concept_order_id) return;
        // We hebben de NIEUWE leverancier-order_id nodig zodra de override
        // door bestelvoorstel.ts in een andere bucket terechtkomt. Voor nu
        // updaten we op de huidige order — refresh() haalt de nieuwe state.
        startTransition(async function () {
            const res = await updateOverrideAction({
                concept_order_id: bucket.concept_order_id!,
                inventory_id: item.inventory_id,
                override_leverancier_id: toLevId,
            });
            if (!res.ok) showToast(res.error || 'Verplaatsen mislukt', 'error');
            else showToast('Verplaatst — pagina ververst', 'success');
            // We laten de optimistic state staan; router.refresh in parent regelt sync.
            setShowAlt(false);
        });
    }

    return (
        <div
            style={{
                padding: '12px 18px',
                borderBottom: isLast ? 'none' : '1px solid var(--border)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                opacity: isPending ? 0.7 : 1,
                transition: 'opacity .15s',
            }}
        >
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {item.naam}
                    {item.override_applied && (
                        <span
                            title={`Berekend: ${item.original_qty} ${item.unit}`}
                            style={{
                                fontSize: 9,
                                padding: '2px 6px',
                                borderRadius: 999,
                                background: 'rgba(255,191,0,.12)',
                                color: 'var(--brand, #FFBF00)',
                                fontWeight: 700,
                                letterSpacing: 0.4,
                                textTransform: 'uppercase',
                            }}
                        >
                            aangepast
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {editing ? (
                        <input
                            type="number"
                            step={0.1}
                            min={0}
                            value={qtyDraft}
                            autoFocus
                            onChange={(e) => onQtyChange(Number(e.target.value))}
                            onBlur={commitNow}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitNow(); }}
                            aria-label={`Aantal ${item.naam}`}
                            style={{
                                width: 80,
                                padding: '4px 8px',
                                borderRadius: 6,
                                border: '1px solid var(--brand)',
                                background: 'var(--bg-subtle, var(--card-solid))',
                                color: 'var(--text)',
                                fontSize: 13,
                                fontVariantNumeric: 'tabular-nums',
                            }}
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={() => setEditing(true)}
                            aria-label={`Wijzig aantal ${item.naam}`}
                            style={{
                                fontSize: 13,
                                fontWeight: 600,
                                fontVariantNumeric: 'tabular-nums',
                                padding: '3px 10px',
                                borderRadius: 6,
                                background: item.override_applied ? 'rgba(255,191,0,.10)' : 'rgba(255,255,255,.04)',
                                border: item.override_applied
                                    ? '1px solid rgba(255,191,0,.3)'
                                    : '1px solid var(--border)',
                                cursor: 'text',
                                color: 'var(--text)',
                            }}
                        >
                            {fmtQty(qtyDraft, item.unit)}
                            <Pencil size={10} style={{ marginLeft: 6, opacity: 0.6 }} />
                        </button>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>×</span>
                    <span style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {item.unit_price_eur != null
                            ? `${fmtEur(item.unit_price_eur)}/${item.unit}`
                            : 'prijs onbekend'}
                    </span>
                    <span
                        style={{
                            fontSize: 14,
                            fontWeight: 600,
                            fontVariantNumeric: 'tabular-nums',
                            marginLeft: 'auto',
                            color: item.price_unknown ? 'var(--muted)' : undefined,
                        }}
                    >
                        {item.price_unknown ? 'n.t.b.' : fmtEur(item.est_total_eur)}
                    </span>
                </div>
                {item.pack_label && (
                    <div style={{ marginTop: 5, fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span>nodig {fmtQty(item.qty_needed, item.unit)}</span>
                        <span style={{ color: 'var(--border)' }}>→</span>
                        <span
                            style={{
                                padding: '1px 7px',
                                borderRadius: 999,
                                background: 'rgba(255,255,255,.05)',
                                border: '1px solid var(--border)',
                                fontWeight: 600,
                                color: 'var(--text)',
                            }}
                        >
                            {item.pack_label}
                        </span>
                    </div>
                )}
                {item.events.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
                        ↳ {item.events.map(function (e) {
                            return `${shortDate(e.event_date)} · ${e.event_name}`;
                        }).join('  ·  ')}
                    </div>
                )}
                {/* Bestel-in-1-klik. Exact gekoppeld product → open de productpagina bij
                    de leverancier (boem, bestellen maar). Nog niet gekoppeld → zoek 'm in je
                    gesynchroniseerde catalogus (daar staat de prijs + een link naar de
                    leverancier, en je kunt 'm meteen koppelen). */}
                {item.product_url ? (
                    <a
                        href={item.product_url}
                        target="_blank"
                        rel="noreferrer"
                        title={`Opent de productpagina bij ${bucket.leverancier_naam} — leg daar ${item.packs ?? Math.max(1, Math.ceil(item.qty))}× in je mandje.`}
                        style={{
                            marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 7,
                            fontSize: 12.5, fontWeight: 700, padding: '7px 13px', borderRadius: 9,
                            background: 'var(--brand-tint-subtle, rgba(255,191,0,.08))',
                            border: '1px solid var(--brand-tint-border, rgba(255,191,0,.3))',
                            color: 'var(--brand, #FFBF00)', textDecoration: 'none', width: 'fit-content',
                        }}
                    >
                        <ShoppingCart size={13} /> Bestel {item.packs ?? Math.max(1, Math.ceil(item.qty))}× op {firstWord(bucket.leverancier_naam)}
                        <ExternalLink size={11} style={{ opacity: 0.7 }} />
                    </a>
                ) : bucket.leverancier_id != null ? (
                    <Link
                        href={`/leveranciers/${bucket.leverancier_id}/producten?q=${encodeURIComponent(item.naam)}`}
                        title={`Zoek "${item.naam}" in je gesynchroniseerde ${bucket.leverancier_naam}-catalogus`}
                        style={{
                            marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 7,
                            fontSize: 12.5, fontWeight: 600, padding: '7px 13px', borderRadius: 9,
                            background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)',
                            color: 'var(--text)', textDecoration: 'none', width: 'fit-content',
                        }}
                    >
                        <Search size={13} style={{ opacity: 0.8 }} /> Zoek op {firstWord(bucket.leverancier_naam)}
                        <ChevronRight size={12} style={{ opacity: 0.6 }} />
                    </Link>
                ) : null}
                {/* Waarom dit aantal — volledige opbouw zodat een sceptische operator
                    het kan narekenen (fix #4). Alle data zit al in de regel. */}
                <button
                    type="button"
                    onClick={() => setShowWhy(function (v) { return !v; })}
                    style={{ marginTop: 6, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--muted)', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                    {showWhy ? <ChevronDown size={12} /> : <ChevronRight size={12} />} waarom dit aantal?
                </button>
                {showWhy && (
                    <div style={{ marginTop: 6, padding: '10px 12px', background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11.5, color: 'var(--muted)' }}>
                        {item.events.map(function (e) {
                            return (
                                <div key={e.event_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0' }}>
                                    <span>{shortDate(e.event_date)} · {e.event_name}</span>
                                    <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{fmtQty(e.qty, item.unit)}</span>
                                </div>
                            );
                        })}
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                            <span>events samen</span>
                            <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{fmtQty(item.reserved_qty, item.unit)}</span>
                        </div>
                        {item.derving_pct > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0' }}>
                                <span>+ {item.derving_pct}% marge (derving)</span>
                                <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{fmtQty(item.target_qty, item.unit)}</span>
                            </div>
                        )}
                        {item.current_stock > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0' }}>
                                <span>− al op voorraad</span>
                                <span style={{ fontVariantNumeric: 'tabular-nums' }}>−{fmtQty(item.current_stock, item.unit)}</span>
                            </div>
                        )}
                        {item.in_flight_qty > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0' }}>
                                <span>− al onderweg</span>
                                <span style={{ fontVariantNumeric: 'tabular-nums' }}>−{fmtQty(item.in_flight_qty, item.unit)}</span>
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0', borderTop: '1px solid var(--border)', marginTop: 4, fontWeight: 600, color: 'var(--text)' }}>
                            <span>= tekort</span>
                            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtQty(item.original_qty, item.unit)}</span>
                        </div>
                        {/* Bij een handmatige qty-override wijkt het bestelde aantal af van
                            de berekende tekort — toon dat als aparte regel zodat de optelsom
                            blijft kloppen (i.p.v. '= tekort' met de override te vervuilen). */}
                        {Math.abs((item.original_qty ?? 0) - item.qty_needed) > 0.001 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0', fontStyle: 'italic' }}>
                                <span>→ handmatig gezet op</span>
                                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtQty(item.qty_needed, item.unit)}</span>
                            </div>
                        )}
                        {item.pack_label && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0', color: 'var(--brand, #FFBF00)' }}>
                                <span>→ afgerond op pak</span>
                                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{item.pack_label}</span>
                            </div>
                        )}
                    </div>
                )}
                {showAlt && otherSuppliers.length > 0 && (
                    <div style={{ marginTop: 8, padding: 10, background: 'rgba(255,255,255,.03)', borderRadius: 8 }}>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Verplaats naar:</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {otherSuppliers.slice(0, 5).map(function (s) {
                                return (
                                    <button
                                        key={s.id}
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => handleMove(s.id)}
                                        style={{ fontSize: 11 }}
                                    >
                                        {s.naam}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginTop: 2 }}>
                {otherSuppliers.length > 0 && (
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        title="Verplaats naar andere leverancier"
                        aria-label="Verplaats naar andere leverancier"
                        onClick={() => setShowAlt((v) => !v)}
                        style={{ width: 30, height: 30 }}
                    >
                        <Repeat2 size={14} />
                    </button>
                )}
                <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    title="Verwijder uit lijst"
                    aria-label="Verwijder uit lijst"
                    onClick={handleRemove}
                    style={{ width: 30, height: 30 }}
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
}

// ── PDF preview modal ─────────────────────────────────────────────────
function PdfPreviewModal({
    bucket,
    onClose,
    onAfterSend,
    showToast,
}: {
    bucket: BestelvoorstelLeverancier;
    onClose: () => void;
    onAfterSend: () => void;
    showToast: (msg: any, type?: any) => void;
}) {
    const [note, setNote] = useState('');
    const [isPending, startTransition] = useTransition();

    const subtotaal = bucket.subtotal_eur;
    // Voor preview-tegel: BTW raming via 9% default — definitieve waarden komen uit server (zie actions.ts).
    const btwLaag = Math.round(subtotaal * 0.09 * 100) / 100;
    const totaal = Math.round((subtotaal + btwLaag) * 100) / 100;

    function handleSend() {
        if (!bucket.concept_order_id) {
            showToast('Geen order_id — herlaad de pagina', 'error');
            return;
        }
        startTransition(async function () {
            const res = await sendOrderToSupplierAction({
                concept_order_id: bucket.concept_order_id!,
                note: note || undefined,
            });
            if (!res.ok) {
                showToast(res.error || 'Versturen mislukt', 'error');
                return;
            }
            if (res.email_delivered) {
                showToast(`Verstuurd naar ${bucket.leverancier_naam} (${res.ordernummer})`, 'success');
            } else {
                showToast(`PDF gegenereerd (${res.ordernummer}) — e-mail: ${res.email_error || 'niet verstuurd'}`, 'warning');
            }
            onAfterSend();
        });
    }

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="PDF preview"
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,.6)',
                backdropFilter: 'blur(4px)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: 'min(900px, 100%)',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--card-solid, #1e1e22)',
                    border: '1px solid var(--border)',
                    borderRadius: 16,
                    overflow: 'hidden',
                    boxShadow: '0 24px 64px rgba(0,0,0,.5)',
                }}
            >
                <header
                    style={{
                        padding: '16px 22px',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <div>
                        <div
                            style={{
                                fontSize: 10,
                                color: 'var(--brand-gold, #c4a35a)',
                                letterSpacing: 1.4,
                                textTransform: 'uppercase',
                                fontWeight: 700,
                                marginBottom: 4,
                            }}
                        >
                            PDF preview
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 600 }}>Bestelling {bucket.leverancier_naam}</div>
                    </div>
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        onClick={onClose}
                        aria-label="Sluiten"
                    >
                        <X size={16} />
                    </button>
                </header>

                <div style={{ flex: 1, overflow: 'auto', padding: 24, background: '#0d0d10' }}>
                    <div
                        style={{
                            maxWidth: 640,
                            margin: '0 auto',
                            background: '#fff',
                            color: '#111',
                            borderRadius: 4,
                            padding: '40px 36px',
                            fontFamily: 'Helvetica, Arial, sans-serif',
                            fontSize: 13,
                        }}
                    >
                        <div style={{ marginBottom: 24 }}>
                            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1, color: '#c4a35a' }}>
                                BBQ ARCHITECT
                            </div>
                            <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                                Bestelling — preview
                            </div>
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#333', marginBottom: 4 }}>
                            Aan: {bucket.leverancier_naam}
                        </div>
                        {bucket.leverancier_email && (
                            <div style={{ fontSize: 10, color: '#666' }}>{bucket.leverancier_email}</div>
                        )}
                        <div style={{ height: 1, background: '#e5e5e5', margin: '14px 0' }} />

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                            <thead>
                                <tr style={{ borderBottom: '1.5px solid #222', textAlign: 'left' }}>
                                    <th style={{ padding: '6px 0', fontWeight: 600 }}>Product</th>
                                    <th style={{ padding: '6px 0', fontWeight: 600, textAlign: 'right' }}>Hoeveelheid</th>
                                    <th style={{ padding: '6px 0', fontWeight: 600, textAlign: 'right' }}>Prijs/eenheid</th>
                                    <th style={{ padding: '6px 0', fontWeight: 600, textAlign: 'right' }}>Totaal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bucket.items.map(function (it) {
                                    return (
                                        <tr key={it.inventory_id} style={{ borderBottom: '1px solid #eee' }}>
                                            <td style={{ padding: '8px 0' }}>
                                                <div style={{ fontWeight: 500 }}>{it.naam}</div>
                                                {it.events.length > 0 && (
                                                    <div style={{ fontSize: 9, color: '#999', marginTop: 2 }}>
                                                        {it.events.map(function (e) { return e.event_name; }).slice(0, 3).join(' · ')}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '8px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                {fmtQty(it.qty, it.unit)}
                                            </td>
                                            <td style={{ padding: '8px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                {it.unit_price_eur != null ? fmtEur(it.unit_price_eur) : '—'}
                                            </td>
                                            <td style={{ padding: '8px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                                                {fmtEur(it.est_total_eur)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        <div style={{ height: 1, background: '#222', margin: '14px 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 28, fontSize: 11 }}>
                            <div>
                                <div style={{ color: '#888' }}>Subtotaal excl. BTW</div>
                                <div style={{ color: '#888', marginTop: 3 }}>BTW (raming)</div>
                                <div style={{ fontWeight: 700, marginTop: 8, fontSize: 13, color: '#111' }}>Totaal incl. BTW</div>
                            </div>
                            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                <div>{fmtEur(subtotaal)}</div>
                                <div style={{ marginTop: 3 }}>{fmtEur(btwLaag)}</div>
                                <div style={{ fontWeight: 700, marginTop: 8, fontSize: 13 }}>{fmtEur(totaal)}</div>
                            </div>
                        </div>
                        <div style={{ fontSize: 9, color: '#aaa', marginTop: 18 }}>
                            BTW-split per item (9% / 21%) wordt definitief berekend bij verzenden.
                        </div>
                    </div>
                </div>

                <footer
                    style={{
                        padding: '14px 22px',
                        borderTop: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: 14,
                        background: 'rgba(255,255,255,.02)',
                    }}
                >
                    <div style={{ flex: 1 }}>
                        <label htmlFor="send-note" style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                            Notitie (optioneel)
                        </label>
                        <textarea
                            id="send-note"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Bijv. 'Levering vóór 08:00 graag'"
                            rows={2}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: 'var(--bg-subtle, var(--card-solid))',
                                color: 'var(--text)',
                                fontSize: 12,
                                fontFamily: 'inherit',
                                resize: 'vertical',
                            }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={isPending}>
                            Annuleer
                        </button>
                        <button
                            type="button"
                            className="btn btn-brand btn-sm"
                            onClick={handleSend}
                            disabled={isPending || !bucket.concept_order_id}
                        >
                            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            {isPending ? 'Versturen…' : 'Verstuur'}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}

// ── Formatters ───────────────────────────────────────────────────────
function fmtEur(n: number): string {
    return (Number(n) || 0).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
}
function fmtQty(n: number, unit: string): string {
    const v = Number(n) || 0;
    if (v >= 100) return Math.round(v) + ' ' + unit;
    if (v >= 10) return v.toFixed(1) + ' ' + unit;
    return v.toFixed(2) + ' ' + unit;
}
function shortDate(iso: string): string {
    try {
        const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
        return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
    } catch { return iso; }
}
