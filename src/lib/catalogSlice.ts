/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * catalogSlice — een hapklaar stuk van de leverancier-catalogus.
 *
 * Bestaat voor de receptuur-AI: die kan onmogelijk 7.700 producten in zijn
 * prompt krijgen, maar zonder échte producten verzint hij namen en klopt de
 * kostprijs achteraf niet. Dus zoeken we per ingrediënt-soort een handvol
 * echte regels op en geven we díé mee.
 *
 * Twee bronnen, allebei org-scoped, allebei met hun eigen id-ruimte:
 *   - supplier_prices   (Catalogus A — geïmporteerde prijslijsten)
 *   - supplier_products (Catalogus B — gescande bestel-catalogus)
 * Nooit op id joinen; ze worden alleen naast elkaar gezet.
 *
 * Prijs-regel is dezelfde als overal: alleen genormaliseerde velden. Een kale
 * `prijs` met een vrije `eenheid` ("doos", of een 'g' die uit de productnaam is
 * gevist) is geen eenheidsprijs — die het model laten zien levert een gerecht
 * op met een kostprijs die nergens op slaat.
 */

import { supplierProductBaseCost } from './supplierSync/recipeCost';

import { formatEur } from '@/lib/format';

export interface CatalogusRegel {
    bron: 'price_list' | 'supplier_product';
    naam: string;
    leverancier: string | null;
    /** Leesbaar prijslabel, of null als we de prijs niet betrouwbaar kennen. */
    prijs_label: string | null;
}

/* Per zoekterm hooguit dit aantal regels, zodat één breed woord ("kruiden")
   de hele lijst niet opslokt en de smallere termen wegdrukt. */
const PER_TERM = 6;

function euro(n: number): string {
    return `${formatEur(n)}`;
}

/** supplier_prices → label. Alleen prijs_per_kg / prijs_per_stuk zijn te vertrouwen. */
function labelUitPrijslijst(r: any): string | null {
    const perKg = Number(r.prijs_per_kg) || 0;
    if (perKg > 0) return `${euro(perKg)}/kg`;
    const perStuk = Number(r.prijs_per_stuk) || 0;
    if (perStuk > 0) return `${euro(perStuk)}/stuk`;
    return null;
}

/** supplier_products → label via de gedeelde deterministische pak-omrekening. */
function labelUitBestelcatalogus(r: any): string | null {
    const base = supplierProductBaseCost({
        price_cents: r.price_cents,
        unit: r.unit,
        package_size: r.package_size,
        package_unit: r.package_unit,
        total_base_quantity: r.total_base_quantity,
        base_unit: r.base_unit,
    });
    if (!base || base.base_cost_cents <= 0 || base.base_quantity <= 0) return null;
    return `${euro(base.base_cost_cents / 100)} per ${base.base_quantity} ${base.base_unit}`;
}

/**
 * Zoek `termen` op in beide catalogi en lever maximaal `max` unieke regels.
 *
 * Regels zonder betrouwbare prijs vallen af: het doel is dat de kostprijs
 * straks klopt, en een product zonder bruikbare prijs draagt daar niet aan bij.
 */
export async function zoekCatalogusSlice(
    sb: any,
    orgId: string,
    termen: string[],
    max = 120,
): Promise<CatalogusRegel[]> {
    const schoon = Array.from(new Set(
        (termen || [])
            .map((t) => String(t || '').trim().replace(/[%_,()*[\]]/g, ' ').trim())
            .filter((t) => t.length >= 2),
    )).slice(0, 14);
    if (schoon.length === 0) return [];

    const perTerm = await Promise.all(schoon.map(async (term) => {
        const [prijslijst, bestelcatalogus] = await Promise.all([
            sb.from('supplier_prices')
                .select('id, product_naam, leverancier, prijs_per_kg, prijs_per_stuk')
                .eq('organization_id', orgId)
                .eq('actief', true)
                .ilike('product_naam', `%${term}%`)
                .order('product_naam')
                .limit(PER_TERM * 3),
            sb.from('supplier_products')
                .select('id, name, supplier_id, price_cents, unit, package_size, package_unit, total_base_quantity, base_unit')
                .eq('organization_id', orgId)
                .eq('active', true)
                .ilike('name', `%${term}%`)
                .order('name')
                .limit(PER_TERM * 3),
        ]);

        const uitA: CatalogusRegel[] = (prijslijst.data || [])
            .map((r: any) => ({
                bron: 'price_list' as const,
                naam: String(r.product_naam ?? ''),
                leverancier: (r.leverancier as string | null) ?? null,
                prijs_label: labelUitPrijslijst(r),
            }))
            .filter((r: CatalogusRegel) => r.naam && r.prijs_label);

        const uitB: CatalogusRegel[] = (bestelcatalogus.data || [])
            .map((r: any) => ({
                bron: 'supplier_product' as const,
                naam: String(r.name ?? ''),
                supplier_id: r.supplier_id as number | null,
                leverancier: null,
                prijs_label: labelUitBestelcatalogus(r),
            }))
            .filter((r: any) => r.naam && r.prijs_label) as any;

        /* Om en om uit beide bronnen, zodat één catalogus de ander niet
           verdringt — dezelfde valkuil als bij de catalogus-zoek. */
        const gemengd: CatalogusRegel[] = [];
        for (let i = 0; i < PER_TERM; i++) {
            if (uitA[i]) gemengd.push(uitA[i]);
            if (uitB[i]) gemengd.push(uitB[i]);
            if (gemengd.length >= PER_TERM) break;
        }
        return gemengd.slice(0, PER_TERM);
    }));

    /* Leveranciersnamen in één keer erbij voor Catalogus B. */
    const alles = perTerm.flat();
    const supplierIds = Array.from(new Set(
        alles.map((r: any) => r.supplier_id).filter((v: any) => typeof v === 'number'),
    ));
    if (supplierIds.length > 0) {
        const { data: levs } = await sb
            .from('leveranciers').select('id, naam')
            .eq('organization_id', orgId).in('id', supplierIds);
        const perId = new Map<number, string>();
        for (const l of levs || []) perId.set(l.id as number, (l.naam as string) ?? '');
        for (const r of alles as any[]) {
            if (r.leverancier == null && typeof r.supplier_id === 'number') {
                r.leverancier = perId.get(r.supplier_id) ?? null;
            }
        }
    }

    /* Ontdubbelen op naam+leverancier: dezelfde kip komt bij meerdere termen
       boven en dat kost alleen maar plek in de prompt. */
    const gezien = new Set<string>();
    const uniek: CatalogusRegel[] = [];
    for (const r of alles) {
        const sleutel = `${r.naam.toLowerCase()}|${(r.leverancier ?? '').toLowerCase()}`;
        if (gezien.has(sleutel)) continue;
        gezien.add(sleutel);
        uniek.push({ bron: r.bron, naam: r.naam, leverancier: r.leverancier, prijs_label: r.prijs_label });
        if (uniek.length >= max) break;
    }
    return uniek;
}
