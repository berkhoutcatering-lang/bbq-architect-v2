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

import { formatEur, formatNumber } from '@/lib/format';

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
             components ( id, name, base_quantity, base_unit, base_cost_cents, supplier_product_id, type, ingredients )`
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

    /* Leverancier per component uit de JUISTE bron:
       - bought_in → Inkoop-catalogus supplier_products → leveranciers (Catalog B).
       - prepared  → de gekozen leverancier(s) uit de picker in components.ingredients (Catalog A JSONB).
       NIET via supplier_prices op supplier_product_id — dat zijn twee losse id-ruimtes
       (bekende cross-catalog mismatch) en gaf een verkeerde/lege leverancier. */
    const boughtInSpIds: number[] = gc
        .map((r: any) => (r.components?.type === 'bought_in' ? r.components?.supplier_product_id : null))
        .filter((v: any): v is number => typeof v === 'number');

    const supplierById = new Map<number, string | null>();
    if (boughtInSpIds.length > 0) {
        const { data: sps } = await sb
            .from('supplier_products')
            .select('id, supplier_id')
            .in('id', Array.from(new Set(boughtInSpIds)))
            .eq('organization_id', organizationId);
        const supplierIds = Array.from(new Set((sps ?? []).map((s: any) => s.supplier_id).filter((v: any): v is number => typeof v === 'number')));
        const levNameById = new Map<number, string>();
        if (supplierIds.length > 0) {
            const { data: levs } = await sb
                .from('leveranciers')
                .select('id, naam')
                .in('id', supplierIds)
                .eq('organization_id', organizationId);
            for (const l of levs ?? []) levNameById.set((l as any).id, (l as any).naam);
        }
        for (const s of sps ?? []) supplierById.set((s as any).id, levNameById.get((s as any).supplier_id) ?? null);
    }

    /* Picker-koppelingen uit de ingredients-JSONB (per zelf-bereid component). */
    function pickerLinks(ingredients: unknown): { leveranciers: string[]; masterIds: number[] } {
        const leveranciers: string[] = [];
        const masterIds: number[] = [];
        if (Array.isArray(ingredients)) {
            for (const it of ingredients) {
                if (!it || typeof it !== 'object') continue;
                const mp = (it as any).master_product_id;
                const lev = (it as any).leverancier;
                if (typeof mp === 'number' && !masterIds.includes(mp)) masterIds.push(mp);
                if (typeof lev === 'string' && lev.trim() && !leveranciers.includes(lev)) leveranciers.push(lev);
            }
        }
        return { leveranciers, masterIds };
    }

    const rows: IngredientRow[] = gc.map((r: any) => {
        const comp = r.components || {};
        let leverancier: string | null = null;
        let masterProductId: number | null = null;
        if (comp.type === 'bought_in' && typeof comp.supplier_product_id === 'number') {
            leverancier = supplierById.get(comp.supplier_product_id) ?? null;
        } else if (comp.type === 'prepared') {
            const { leveranciers, masterIds } = pickerLinks(comp.ingredients);
            leverancier = leveranciers.length === 0 ? null
                : leveranciers.length === 1 ? leveranciers[0]
                    : `${leveranciers[0]} +${leveranciers.length - 1}`;
            /* Alleen een écht Catalog-A master_product_id doorgeven aan de
               substitutie-knop; bij meerdere/geen → null (geen verkeerde match). */
            masterProductId = masterIds.length === 1 ? masterIds[0] : null;
        }
        return {
            key: String(r.component_id),
            naam: comp.name ?? 'Onbekend',
            qty_used: Number(r.quantity_used ?? 0),
            base_qty: Number(comp.base_quantity ?? 0),
            unit: r.unit || comp.base_unit || '-',
            base_cost_cents: Number(comp.base_cost_cents ?? 0),
            cost_at_use_cents: Number(r.cost_at_use_cents ?? 0),
            master_product_id: masterProductId,
            leverancier,
            prijs_per_kg: null,
            last_price_at: null,
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
                            {/* Was "180.00 g": punt-decimaal. */}
                            {formatNumber(r.qty_used, 2)} {r.unit}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'right' }}>
                            {r.prijs_per_kg !== null ? `${formatEur(r.prijs_per_kg)} / kg` : '—'}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, textAlign: 'right' }}>
                            {formatEur((r.cost_at_use_cents / 100))}
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
