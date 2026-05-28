/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
/**
 * MissingSupplierBanner — sticky banner voor items zonder leverancier (P0-8)
 * ──────────────────────────────────────────────────────────────────────────
 * Verschijnt boven /inkoop wanneer:
 *  - inventory-items in de bestellijst geen leverancier_id hebben, of
 *  - ingredient-namen géén match kregen in inventory (unmatched-array).
 *
 * Per regel: ingredient/inventory-naam links, qty middenin, dropdown rechts.
 * Bij selectie → assignSupplierAction (voor unbound inventory) of (voor pure
 * unmatched-ingredients, geen inventory-id) toon "voeg eerst toe aan voorraad".
 */
import { useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { assignSupplierAction } from '../actions';
import type { BestelvoorstelItem } from '@/lib/dal/bestelvoorstel';
import type { UnmatchedIngredient } from '@/lib/dal/inventoryDemand';

export interface MissingSupplierBannerProps {
    unboundItems: Array<BestelvoorstelItem & { _orig_leverancier_id: number | null }>;
    unmatchedIngredients: UnmatchedIngredient[];
    leveranciers: Array<{ id: number; naam: string; type: string }>;
    onAssigned?: () => void;
}

export default function MissingSupplierBanner({
    unboundItems,
    unmatchedIngredients,
    leveranciers,
    onAssigned,
}: MissingSupplierBannerProps) {
    const total = unboundItems.length + unmatchedIngredients.length;
    if (total === 0) return null;

    return (
        <div
            style={{
                position: 'sticky',
                top: 0,
                zIndex: 30,
                background: 'rgba(245,158,11,.06)',
                borderLeft: '3px solid var(--amber, #f59e0b)',
                border: '1px solid rgba(245,158,11,.2)',
                borderRadius: 'var(--radius-md, 10px)',
                marginBottom: 16,
                overflow: 'hidden',
            }}
        >
            <div style={{ padding: '14px 18px 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertTriangle size={18} color="var(--amber, #f59e0b)" />
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                        {total} item{total === 1 ? '' : 's'} zonder leverancier
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Wijs een leverancier toe zodat we de bestelling kunnen versturen.
                    </div>
                </div>
            </div>

            <div style={{ padding: '0 18px 12px' }}>
                {unboundItems.map(function (it) {
                    return (
                        <UnboundRow
                            key={'inv-' + it.inventory_id}
                            inventoryId={it.inventory_id}
                            naam={it.naam}
                            qty={it.qty}
                            unit={it.unit}
                            estTotal={it.est_total_eur}
                            leveranciers={leveranciers}
                            onAssigned={onAssigned}
                        />
                    );
                })}
                {unmatchedIngredients.map(function (u) {
                    return (
                        <UnmatchedRow
                            key={'unm-' + u.raw_name}
                            naam={u.raw_name}
                            qty={u.qty_total}
                            unit={u.unit}
                        />
                    );
                })}
            </div>
        </div>
    );
}

interface UnboundRowProps {
    inventoryId: number;
    naam: string;
    qty: number;
    unit: string;
    estTotal: number;
    leveranciers: Array<{ id: number; naam: string; type: string }>;
    onAssigned?: () => void;
}

function UnboundRow({ inventoryId, naam, qty, unit, estTotal, leveranciers, onAssigned }: UnboundRowProps) {
    const [picked, setPicked] = useState<number | null>(null);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    function handleChange(value: string) {
        const id = Number(value);
        if (!id) return;
        setPicked(id);
        setError(null);
        startTransition(async function () {
            const res = await assignSupplierAction({ inventory_id: inventoryId, leverancier_id: id });
            if (res.ok) {
                setDone(true);
                onAssigned?.();
                router.refresh();
            } else {
                setError(res.error || 'Toewijzen mislukt');
                setPicked(null);
            }
        });
    }

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderTop: '1px solid rgba(245,158,11,.12)',
            }}
        >
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{naam}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {fmtQty(qty, unit)} · {fmtEur(estTotal)}
                </div>
            </div>
            <div style={{ position: 'relative' }}>
                <select
                    value={picked ?? ''}
                    disabled={isPending || done}
                    onChange={(e) => handleChange(e.target.value)}
                    aria-label={`Kies leverancier voor ${naam}`}
                    style={{
                        appearance: 'none',
                        padding: '7px 28px 7px 12px',
                        borderRadius: 8,
                        border: done ? '1px solid var(--green, #22c55e)' : '1px solid var(--border)',
                        background: done ? 'rgba(34,197,94,.08)' : 'var(--card-solid, #1e1e22)',
                        color: picked ? 'var(--text)' : 'var(--muted)',
                        fontSize: 12,
                        fontFamily: 'inherit',
                        cursor: isPending || done ? 'default' : 'pointer',
                        minWidth: 160,
                    }}
                >
                    <option value="">Kies leverancier…</option>
                    {leveranciers.map(function (l) {
                        return <option key={l.id} value={l.id}>{l.naam}</option>;
                    })}
                </select>
                <ChevronDown
                    size={14}
                    style={{ position: 'absolute', right: 8, top: 9, color: 'var(--muted)', pointerEvents: 'none' }}
                />
            </div>
            {done && <CheckCircle2 size={16} color="var(--green, #22c55e)" />}
            {error && <span style={{ fontSize: 11, color: 'var(--red, #ef4444)' }}>{error}</span>}
        </div>
    );
}

function UnmatchedRow({ naam, qty, unit }: { naam: string; qty: number; unit: string | null }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderTop: '1px solid rgba(245,158,11,.12)',
            }}
        >
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{naam}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {fmtQty(qty, unit || 'stuks')} · niet gekoppeld aan voorraad
                </div>
            </div>
            <span style={{ fontSize: 11, color: 'var(--amber, #f59e0b)' }}>
                Voeg eerst toe aan voorraad
            </span>
        </div>
    );
}

function fmtQty(n: number, unit: string): string {
    const v = Number(n) || 0;
    if (v >= 100) return Math.round(v) + ' ' + unit;
    if (v >= 10) return v.toFixed(1) + ' ' + unit;
    return v.toFixed(2) + ' ' + unit;
}

function fmtEur(n: number): string {
    return (Number(n) || 0).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
}
