'use client';
/**
 * OntvangstSectie — "Onderweg"-lijst + ontvangst-drawer op /inkoop.
 * ────────────────────────────────────────────────────────────────
 * Sluit de ontvangst-loop (GP-3): een verzonden order → "Ontvangst boeken" →
 * per regel bevestigen wat er werkelijk kwam → voorraad gaat automatisch omhoog
 * (receiveOrderAction → increment_inventory_stock → stock_movements 'receive').
 * Zolang niet alles binnen is blijft de order 'sent' voor het openstaande deel.
 *
 * Rechter-drawer conform projectconventie (add/bevestig hoort niet in een
 * gecentreerde modal). Zelfstandige component zodat InkoopLijst ongemoeid blijft.
 */
import { useState, useTransition } from 'react';
import { Truck, PackageCheck, X, Loader2, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { receiveOrderAction } from '../actions';

import { formatEur } from '@/lib/format';

export interface SentOrderLine {
    id: string;
    inventory_id: number | null;
    naam: string;
    qty_ordered: number;
    qty_received: number | null;
    unit: string;
    unit_price_eur: number | null;
}

export interface SentOrder {
    id: string;
    leverancier_naam: string;
    sent_at: string | null;
    window_end: string | null;
    total_eur: number | null;
    lines: SentOrderLine[];
}

function fmtDate(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

export default function OntvangstSectie({ orders }: { orders: SentOrder[] }) {
    const [openOrder, setOpenOrder] = useState<SentOrder | null>(null);
    if (!orders || orders.length === 0) return null;

    return (
        <section id="onderweg" style={{ marginTop: 28, scrollMarginTop: 80 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Truck size={18} style={{ color: 'var(--muted)' }} />
                <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Onderweg</h2>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>· wacht op ontvangst</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {orders.map((o) => {
                    const open = o.lines.filter((l) => (l.qty_received ?? 0) < l.qty_ordered).length;
                    /* Leverwindow t.o.v. vandaag: verstreken = 'te laat' (rood), nog
                       0-2 dagen = 'nog niet binnen' (amber). Zo roept de badge niet
                       vals 'te laat' terwijl de order nog op tijd is (alarm-moeheid). */
                    const daysToWindow = o.window_end
                        ? Math.ceil((new Date(o.window_end + 'T00:00:00').getTime() - Date.now()) / 86400000)
                        : null;
                    const late = daysToWindow != null && daysToWindow < 0;
                    const dueSoon = daysToWindow != null && daysToWindow >= 0 && daysToWindow <= 2;
                    const accent = late ? 'rgba(239,68,68,.35)' : dueSoon ? 'rgba(245,158,11,.35)' : 'var(--border)';
                    return (
                        <div
                            key={o.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 12,
                                background: 'var(--card)',
                                border: `1px solid ${accent}`,
                                borderRadius: 12,
                                padding: '12px 16px',
                            }}
                        >
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    {o.leverancier_naam}
                                    {late && (
                                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,.12)', color: 'var(--red, #ef4444)', border: '1px solid rgba(239,68,68,.3)' }}>
                                            te laat
                                        </span>
                                    )}
                                    {dueSoon && (
                                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,.12)', color: 'var(--amber, #f59e0b)', border: '1px solid rgba(245,158,11,.3)' }}>
                                            nog niet binnen
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                    {o.sent_at ? `verstuurd ${fmtDate(o.sent_at)} · ` : ''}
                                    {o.lines.length} regel{o.lines.length === 1 ? '' : 's'}
                                    {open < o.lines.length ? ` · ${o.lines.length - open} al geboekt` : ''}
                                    {o.total_eur != null ? ` · ${formatEur(o.total_eur)}` : ''}
                                </div>
                            </div>
                            <button
                                type="button"
                                className="btn btn-brand btn-sm"
                                onClick={() => setOpenOrder(o)}
                                style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            >
                                <PackageCheck size={15} /> Ontvangst boeken
                            </button>
                        </div>
                    );
                })}
            </div>

            {openOrder && <OntvangstDrawer order={openOrder} onClose={() => setOpenOrder(null)} />}
        </section>
    );
}

interface DrawerRow extends SentOrderLine {
    geleverd: number;
    reason: string;
}

function OntvangstDrawer({ order, onClose }: { order: SentOrder; onClose: () => void }) {
    const showToast = useToast();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [rows, setRows] = useState<DrawerRow[]>(
        order.lines.map((l) => ({ ...l, geleverd: l.qty_received ?? l.qty_ordered, reason: '' })),
    );

    function setGeleverd(id: string, val: number) {
        setRows((rs) => rs.map((r) => (r.id === id ? { ...r, geleverd: val } : r)));
    }
    function allesKlopt() {
        setRows((rs) => rs.map((r) => ({ ...r, geleverd: r.qty_ordered, reason: '' })));
    }

    function boeken() {
        startTransition(async () => {
            const res = await receiveOrderAction({
                concept_order_id: order.id,
                lines: rows.map((r) => ({
                    line_id: r.id,
                    qty_received: Number(r.geleverd) || 0,
                    unit_price_eur: r.unit_price_eur,
                    reason: Number(r.geleverd) !== r.qty_ordered ? (r.reason.trim() || 'wijkt af — geen reden opgegeven') : null,
                })),
            });
            if (res.ok) {
                showToast('Ontvangst geboekt — voorraad bijgewerkt', 'success');
                router.refresh();
                onClose();
            } else {
                showToast(res.error || 'Ontvangst boeken mislukt', 'error');
            }
        });
    }

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Ontvangst boeken"
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,.55)',
                backdropFilter: 'blur(4px)',
                zIndex: 1000,
                display: 'flex',
                justifyContent: 'flex-end',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: 'min(520px, 100%)',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--card-solid, #1e1e22)',
                    borderLeft: '1px solid var(--border)',
                    boxShadow: '-24px 0 64px rgba(0,0,0,.5)',
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
                        <div style={{ fontSize: 10, color: 'var(--brand-gold, #c4a35a)', letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                            Ontvangst boeken
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>{order.leverancier_naam}</div>
                    </div>
                    <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Sluiten">
                        <X size={18} />
                    </button>
                </header>

                <div style={{ padding: '10px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Vink af wat er werkelijk geleverd is. Standaard = besteld.</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={allesKlopt}>Alles klopt</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 22px' }}>
                    {rows.map((r) => {
                        const afwijkt = Number(r.geleverd) !== r.qty_ordered;
                        return (
                            <div key={r.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                                    <span style={{ fontWeight: 600, fontSize: 14 }}>{r.naam}</span>
                                    <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                                        besteld {r.qty_ordered} {r.unit}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                                    <label style={{ fontSize: 12, color: 'var(--muted)' }}>geleverd</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step="any"
                                        value={r.geleverd}
                                        onChange={(e) => setGeleverd(r.id, Number(e.target.value))}
                                        style={{
                                            width: 90,
                                            padding: '6px 8px',
                                            borderRadius: 8,
                                            border: `1px solid ${afwijkt ? 'var(--warning, #d08700)' : 'var(--border)'}`,
                                            background: 'var(--input-bg, #16161a)',
                                            color: 'var(--text)',
                                            fontVariantNumeric: 'tabular-nums',
                                        }}
                                    />
                                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.unit}</span>
                                    {afwijkt ? (
                                        <span style={{ fontSize: 11, color: 'var(--warning, #d08700)', fontWeight: 600 }}>wijkt af</span>
                                    ) : (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--positive, #4a9e5c)' }}>
                                            <Check size={12} /> klopt
                                        </span>
                                    )}
                                </div>
                                {afwijkt && (
                                    <input
                                        type="text"
                                        placeholder="Reden (bv. minder geleverd, beschadigd)…"
                                        value={r.reason}
                                        onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, reason: e.target.value } : x)))}
                                        style={{
                                            width: '100%',
                                            marginTop: 8,
                                            padding: '6px 10px',
                                            borderRadius: 8,
                                            border: '1px solid var(--border)',
                                            background: 'var(--input-bg, #16161a)',
                                            color: 'var(--text)',
                                            fontSize: 12,
                                        }}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>

                <footer style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isPending}>Annuleer</button>
                    <button type="button" className="btn btn-brand" onClick={boeken} disabled={isPending} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {isPending ? <><Loader2 size={15} className="spin" /> Boeken…</> : <><PackageCheck size={15} /> Ontvangst boeken</>}
                    </button>
                </footer>
            </div>
        </div>
    );
}
