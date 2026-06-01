/**
 * IngredientCostBreakdown — Server component.
 *
 * Toont ingredient-regels voor een gerecht via:
 *   gerecht_components → components → master_products → supplier_prices
 *
 * Per regel: naam, qty, unit, kostprijs, leverancier + datum, en een
 * <SubstitutionTrigger> knop voor Pillar #3.
 */

import { createServerSupabase } from '@/lib/supabase-server';
import SubstitutionTrigger from './SubstitutionTrigger';

interface Props {
    gerechtId: string;
    organizationId: string;
}

interface IngredientRow {
    key: string;
    naam: string;
    qty_used: number;
    base_qty: number;
    unit: string;
    base_cost_cents: number;
    cost_at_use_cents: number;
    master_product_id: number | null;
    leverancier: string | null;
    prijs_per_kg: number | null;
    last_price_at: string | null;
}

export default async function IngredientCostBreakdown({ gerechtId, organizationId }: Props) {
    const sb = await createServerSupabase();

    /* Fetch gerecht_components met joined components-data */
    const { data: gc, error } = await sb
        .from('gerecht_components')
        .select(
            `component_id,
             quantity_used,
             unit,
             cost_at_use_cents,
             components ( id, name, base_quantity, base_unit, base_cost_cents, supplier_product_id )`
        )
        .eq('gerecht_id', gerechtId)
        .eq('organization_id', organizationId);

    if (error) {
        return (
            <div style={{ color: '#dc2626', fontSize: 13, padding: 12 }}>
                Ingrediënten konden niet worden geladen ({error.message})
            </div>
        );
    }

    if (!gc || gc.length === 0) {
        return (
            <div
                style={{
                    padding: 24,
                    textAlign: 'center',
                    color: 'var(--color-text-muted)',
                    fontSize: 13,
                    background: 'var(--color-bg-secondary, #1f2937)',
                    borderRadius: 8,
                }}
            >
                Nog geen componenten gekoppeld aan dit gerecht. Voeg ze toe via de Bouw-tab in het Menu-overzicht.
            </div>
        );
    }

    /* Per component: vind huidige supplier_price (latest, actief) per master_product_id */
    const supplierProductIds = gc
        .map((r: any) => r.components?.supplier_product_id)
        .filter((v: any) => v !== null && v !== undefined);

    let supplierPriceMap = new Map<number, { leverancier: string | null; prijs_per_kg: number | null; created_at: string | null }>();
    if (supplierProductIds.length > 0) {
        const { data: sp } = await sb
            .from('supplier_prices')
            .select('master_product_id, leverancier, prijs_per_kg, prijs, created_at')
            .in('master_product_id', supplierProductIds)
            .eq('organization_id', organizationId)
            .eq('actief', true)
            .order('created_at', { ascending: false });

        for (const row of sp ?? []) {
            const id = (row as any).master_product_id as number;
            if (!supplierPriceMap.has(id)) {
                supplierPriceMap.set(id, {
                    leverancier: (row as any).leverancier ?? null,
                    prijs_per_kg: (row as any).prijs_per_kg ?? (row as any).prijs ?? null,
                    created_at: (row as any).created_at ?? null,
                });
            }
        }
    }

    const rows: IngredientRow[] = gc.map((r: any) => {
        const comp = r.components || {};
        const supplierProductId = comp.supplier_product_id as number | null;
        const sp = supplierProductId ? supplierPriceMap.get(supplierProductId) : undefined;
        return {
            key: String(r.component_id),
            naam: comp.name ?? 'Onbekend',
            qty_used: Number(r.quantity_used ?? 0),
            base_qty: Number(comp.base_quantity ?? 0),
            unit: r.unit || comp.base_unit || '-',
            base_cost_cents: Number(comp.base_cost_cents ?? 0),
            cost_at_use_cents: Number(r.cost_at_use_cents ?? 0),
            master_product_id: supplierProductId,
            leverancier: sp?.leverancier ?? null,
            prijs_per_kg: sp?.prijs_per_kg ?? null,
            last_price_at: sp?.created_at ?? null,
        };
    });

    return (
        <div
            style={{
                background: 'var(--color-bg-secondary, #1f2937)',
                border: '1px solid var(--color-border, #374151)',
                borderRadius: 12,
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--color-border, #374151)',
                    fontSize: 13,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                }}
            >
                Ingrediënten ({rows.length})
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {rows.map((r) => (
                    <li
                        key={r.key}
                        style={{
                            padding: '12px 16px',
                            borderBottom: '1px solid var(--color-border-soft, rgba(255,255,255,0.04))',
                            display: 'grid',
                            gridTemplateColumns: '1fr 80px 100px 80px 100px',
                            gap: 12,
                            alignItems: 'center',
                        }}
                    >
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{r.naam}</div>
                            {r.leverancier ? (
                                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                                    {r.leverancier}
                                    {r.last_price_at && (
                                        <span> · prijs van {formatRelativeDate(r.last_price_at)}</span>
                                    )}
                                </div>
                            ) : (
                                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                                    Nog geen leveranciers-prijs gekoppeld
                                </div>
                            )}
                        </div>
                        <div style={{ fontSize: 13, textAlign: 'right' }}>
                            {r.qty_used.toFixed(2)} {r.unit}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'right' }}>
                            {r.prijs_per_kg !== null ? `€ ${r.prijs_per_kg.toFixed(2)} / kg` : '—'}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, textAlign: 'right' }}>
                            € {(r.cost_at_use_cents / 100).toFixed(2)}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <SubstitutionTrigger
                                masterProductId={r.master_product_id}
                                ingredientName={r.naam}
                                currentSupplier={r.leverancier}
                                currentPrice={r.prijs_per_kg}
                            />
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function formatRelativeDate(iso: string): string {
    const d = new Date(iso);
    const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (days === 0) return 'vandaag';
    if (days === 1) return 'gisteren';
    if (days < 7) return `${days}d geleden`;
    return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' });
}
