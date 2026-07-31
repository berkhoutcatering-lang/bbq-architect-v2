/* Prijs-verversing voor BOUGHT-IN componenten uit Catalogus B (supplier_products).
 *
 * Aanvulling op refreshRecipePrices (dat alleen PREPARED componenten uit
 * Catalogus A ververst). Een bought_in component heeft een directe
 * `supplier_product_id`-koppeling, maar z'n base_cost_cents was een momentopname
 * bij import en werd nooit ververst. Deze functie herrekent die uit de HUIDIGE
 * leveranciersprijs (deterministisch, via de geteste supplierProductBaseCost) en
 * schrijft base_cost_cents terug. De bestaande DB-triggers cascaden dat naar
 * gerecht_components.cost_at_use_cents en gerechten.total_cost_cents → marge.
 *
 * Vergelijkt NOOIT Catalogus A- en B-id's: de koppeling is de expliciete
 * components.supplier_product_id → supplier_products.id (zelfde id-ruimte).
 *
 * LET OP — deze verversing heeft geen eigen ritme. Ze draait alleen wanneer
 * iemand haar aanroept (menukaart doorrekenen, afronden van een extensie-sync).
 * Zolang er geen dagelijkse ronde is, beweegt een prijsverhoging bij de
 * leverancier dus pas mee zodra de gebruiker die bouwsteen zelf langsgaat.
 * Beloof in de UI niet meer dan dat, of gebruik `dryRun` om het verschil te
 * tónen ("opgeslagen €x,xx → nu €y,yy") in plaats van stil te overschrijven.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supplierProductBaseCost, type SupplierProductCostRow } from '@/lib/supplierSync/recipeCost';
import { costForBasisCents } from '@/lib/unitPrice';

/** Eén component waarvan de leveranciersprijs afwijkt van wat er is opgeslagen. */
export interface BoughtInPriceChange {
    componentId: number;
    oudCents: number;
    nieuwCents: number;
}

export interface BoughtInRefreshReport {
    bekeken: number;        // bought_in componenten met een supplier_product-koppeling
    bijgewerkt: number;
    ongewijzigd: number;
    ongekoppeld: number;    // supplier_product verdwenen of zonder bruikbare prijs
    /** Wegschrijven mislukte (rechten, tijdelijke fout). Apart geteld, want een
     *  automatische ronde die stilletjes 0 bijwerkt terwijl er van alles
     *  misgaat is erger dan een ronde die faalt. */
    mislukt: number;
    totaalOudCents: number;
    totaalNieuwCents: number;
    /** Per component het oude en het nieuwe bedrag, zodat een scherm
     *  "opgeslagen €x,xx → nu bij leverancier €y,yy" kan tonen in plaats van
     *  de nieuwe prijs stil in een veld te zetten. */
    wijzigingen: BoughtInPriceChange[];
}

function empty(): BoughtInRefreshReport {
    return { bekeken: 0, bijgewerkt: 0, ongewijzigd: 0, ongekoppeld: 0, mislukt: 0, totaalOudCents: 0, totaalNieuwCents: 0, wijzigingen: [] };
}

/** @param opts.menuTemplateId  alleen de componenten van één menukaart.
 *  @param opts.dryRun          alléén kijken, niets wegschrijven. `bijgewerkt`
 *    en `wijzigingen` vertellen dan wat er ZOU veranderen — bedoeld voor een
 *    scherm dat de gebruiker eerst laat kiezen ("Neem over"), zodat een
 *    prijswijziging bij de leverancier nooit ongemerkt in een kostprijs rolt. */
export async function refreshBoughtInPrices(
    sb: SupabaseClient,
    orgId: string,
    opts: { menuTemplateId?: number; dryRun?: boolean } = {},
): Promise<BoughtInRefreshReport> {
    /* Optioneel: alleen componenten van één menukaart (zelfde scoping als
       refreshRecipePrices). */
    let componentIdFilter: number[] | null = null;
    if (opts.menuTemplateId != null) {
        const { data: items } = await sb
            .from('menu_template_items').select('gerecht_id').eq('menu_template_id', opts.menuTemplateId);
        const gerechtIds = Array.from(new Set((items ?? []).map((r: { gerecht_id?: number }) => r.gerecht_id).filter(Boolean)));
        if (gerechtIds.length === 0) return empty();
        const { data: gcs } = await sb
            .from('gerecht_components').select('component_id').eq('organization_id', orgId).in('gerecht_id', gerechtIds);
        componentIdFilter = Array.from(new Set((gcs ?? []).map((r: { component_id?: number }) => r.component_id).filter((v): v is number => typeof v === 'number')));
        if (componentIdFilter.length === 0) return empty();
    }

    /* ALLE gekoppelde inkoop-componenten, uit BEIDE catalogi.
     *
     * Stond hier eerder `.not('supplier_product_id', 'is', null)`, waardoor een
     * inkoop-component die aan de PRIJSLIJST hangt (master_product_id +
     * supplier_price_id) door niemand ververst werd: refreshRecipePrices pakt
     * alleen type='prepared', en deze functie sloeg 'm over. Het bewerk-scherm
     * belooft ondertussen wél "de kostprijs komt uit je prijslijst en beweegt mee
     * bij een prijswijziging". Dat was een gebroken belofte, en juist bij een
     * duur product (bv. tartaar à €32,90) loopt dat hard uit de pas. */
    let q = sb
        .from('components')
        .select('id, base_cost_cents, base_quantity, base_unit, supplier_product_id, master_product_id, supplier_price_id')
        .eq('organization_id', orgId)
        .eq('type', 'bought_in')
        .or('supplier_product_id.not.is.null,master_product_id.not.is.null');
    if (componentIdFilter) q = q.in('id', componentIdFilter);
    const { data: comps, error } = await q;
    if (error) throw new Error(`refreshBoughtInPrices: ${error.message}`);

    const report = empty();
    const rows = comps ?? [];
    report.bekeken = rows.length;
    if (rows.length === 0) return report;

    /* Actuele prijslijst-prijzen voor de Catalogus A-koppelingen.
     *
     * Bewust op master_product_id en niet op het opgeslagen supplier_price_id:
     * een prijswijziging zet de oude regel op actief=false en voegt een NIEUWE
     * toe (zie api/pricelist-sync). Wie het opgeslagen id blijft volgen, kijkt
     * dus per definitie naar een bevroren prijs en ziet nooit een wijziging.
     * Zelfde resolutie als refreshRecipePrices: nieuwste actieve per
     * (product × leverancier), met het opgeslagen id als vangnet. */
    const masterIds = Array.from(new Set(
        rows.filter(c => !c.supplier_product_id && typeof c.master_product_id === 'number')
            .map(c => c.master_product_id as number),
    ));
    const prijsByMaster = new Map<number, Record<string, unknown>>();
    const prijsById = new Map<number, Record<string, unknown>>();
    if (masterIds.length > 0) {
        const { data: prices } = await sb
            .from('supplier_prices')
            .select('id, master_product_id, leverancier, prijs, eenheid, prijs_per_kg, prijs_per_stuk, datum')
            .eq('organization_id', orgId)
            .in('master_product_id', masterIds)
            .eq('actief', true)
            .order('datum', { ascending: false, nullsFirst: false })
            .order('id', { ascending: false });
        for (const p of prices ?? []) {
            const mid = p.master_product_id as number;
            if (!prijsByMaster.has(mid)) prijsByMaster.set(mid, p);
            prijsById.set(p.id as number, p);
        }
    }

    /* Gekoppelde supplier_products in één query (indexed point lookup). */
    const spIds = Array.from(new Set(rows.map((c) => c.supplier_product_id).filter((v): v is number => typeof v === 'number')));
    const { data: sps } = await sb
        .from('supplier_products')
        .select('id, price_cents, unit, package_size, package_unit, total_base_quantity, base_unit, variable_weight')
        .eq('organization_id', orgId)
        .in('id', spIds);
    const spById = new Map<number, SupplierProductCostRow & { id: number }>();
    for (const s of sps ?? []) spById.set(s.id, s as SupplierProductCostRow & { id: number });

    for (const c of rows) {
        /* Welke catalogus levert de prijs? Nooit beide: is er een
           supplier_product_id, dan is dat de koppeling; anders de prijslijst. */
        let base: { base_cost_cents: number; base_quantity: number; base_unit: string } | null = null;

        if (c.supplier_product_id) {
            const sp = spById.get(c.supplier_product_id);
            if (!sp || sp.price_cents == null) { report.ongekoppeld++; continue; }
            base = supplierProductBaseCost(sp);
        } else if (typeof c.master_product_id === 'number') {
            const prijs = prijsByMaster.get(c.master_product_id)
                ?? (typeof c.supplier_price_id === 'number' ? prijsById.get(c.supplier_price_id) : undefined);
            if (!prijs) { report.ongekoppeld++; continue; }
            /* ALLEEN de genormaliseerde prijsvelden. Dit is een STILLE schrijver:
               hij werkt zonder dat iemand meekijkt de kostprijs van elke gekoppelde
               bouwsteen bij. Dan mag hij niet gokken.
               De algemene resolver valt bij ontbrekende prijs_per_kg/prijs_per_stuk
               terug op de kale `prijs` plus de vrije `eenheid`, en die is
               dubbelzinnig: een regel "prijs 123,48 / eenheid ST" is in de praktijk
               een doosprijs, maar wordt dan gelezen als €123,48 per stuk. Precies
               dat gebeurde live bij "Beef Club Burgers 80 gram": die ging van
               €1,35 naar €12.348 per 100 stuks. Geen genormaliseerde prijs = niet
               aanraken; de bouwsteen houdt gewoon zijn huidige kostprijs. */
            const perKg = Number((prijs as { prijs_per_kg?: unknown }).prijs_per_kg) || 0;
            const perStuk = Number((prijs as { prijs_per_stuk?: unknown }).prijs_per_stuk) || 0;
            if (perKg > 0) {
                base = { base_cost_cents: Math.round(perKg * 100), base_quantity: 1, base_unit: 'kg' };
            } else if (perStuk > 0) {
                base = { base_cost_cents: Math.round(perStuk * 100), base_quantity: 1, base_unit: 'stuk' };
            } else {
                report.ongekoppeld++;
                continue;
            }
        }
        if (!base) { report.ongekoppeld++; continue; }

        const oldBase = Number(c.base_cost_cents) || 0;

        /* Alleen de PRIJS ververst, niet de basis.
         *
         * Dit schreef eerder ook base_quantity en base_unit terug, en
         * supplierProductBaseCost normaliseert altijd naar 100 g / 100 ml /
         * 1 stuk. Zette een gebruiker zijn component bewust op 1 kg, dan draaide
         * de eerstvolgende prijs-verversing of leverancierssync dat stil terug
         * naar 100 g — precies de klacht die we in de drawer net verholpen,
         * binnengekomen via een andere deur.
         *
         * We rekenen de nieuwe leveranciersprijs dus om naar de basis die er al
         * staat. Zit die basis in een andere eenheid-familie dan de leverancier
         * (jouw basis in liter, hun prijs per kg), dan is er geen eerlijke
         * omrekening: overslaan en als ongekoppeld tellen, want dan bewéégt deze
         * prijs feitelijk niet mee. */
        const nieuwCents = costForBasisCents({
            srcCostCents: base.base_cost_cents,
            srcQuantity: base.base_quantity,
            srcUnit: base.base_unit,
            baseQuantity: Number(c.base_quantity),
            baseUnit: String(c.base_unit ?? ''),
        });
        if (nieuwCents === null) { report.ongekoppeld++; continue; }
        if (nieuwCents === oldBase) { report.ongewijzigd++; continue; }

        if (!opts.dryRun) {
            const { error: upErr } = await sb
                .from('components')
                /* updated_at expliciet meeschrijven: de bewerk-lade gebruikt die
                   tijdstempel om te zien of iemand anders (of dit proces) de
                   bouwsteen intussen heeft gewijzigd. Schrijven we hem niet, dan
                   ziet dat slot deze prijs-verversing niet en kan een lade die al
                   openstond de verse inkoopprijs stil terugdraaien — inclusief de
                   doorrekening naar alle gerechten. */
                .update({ base_cost_cents: nieuwCents, updated_at: new Date().toISOString() })
                .eq('id', c.id)
                .eq('organization_id', orgId);
            if (upErr) { report.mislukt++; continue; } // best-effort per component, maar wel geteld
        }
        report.bijgewerkt++;
        report.totaalOudCents += oldBase;
        report.totaalNieuwCents += nieuwCents;
        report.wijzigingen.push({ componentId: Number(c.id), oudCents: oldBase, nieuwCents });
    }

    return report;
}
