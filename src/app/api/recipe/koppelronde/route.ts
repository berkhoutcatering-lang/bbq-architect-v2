/* GET /api/recipe/koppelronde — alle ingrediëntnamen die al in de app staan.
 *
 * Golf 4 van docs/leveranciersvoorkeur-plan.md: de eenmalige koppelronde
 * werkt vanaf Mathijs' kant (de ~150 namen die hij gebruikt), niet vanaf de
 * 10.125 producten van Bidfood. Bron: de ingrediënten van de gerechten
 * (AI-receptuur mét hoeveelheid, en de losse tekst-ingrediënten). Bibliotheek
 * en voorraad doen niet mee: die zijn al geprijsd en zouden alleen aan zichzelf
 * koppelen. Ontdubbeld op alias-sleutel; per naam de eerste hoeveelheid/eenheid
 * en in welke gerechten hij zit, zodat de lijst leesbaar blijft.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { aliasSleutel } from '@/lib/recipeMatch';

export const runtime = 'nodejs';

export interface KoppelrondeRegel {
    naam: string;
    qty_pp: number;
    eenheid: string;
    bronnen: string[];
    /** Al door de kok bevestigd → hoeft niet opnieuw. */
    alias: { product_name: string; supplier_name: string | null } | null;
}

export const GET = withTenantAuth(async (_req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    const [gerechten, aliassen] = await Promise.all([
        supabase.from('gerechten').select('naam, ingredienten, ingredient_costs').eq('organization_id', orgId),
        supabase.from('ingredient_aliases').select('alias_normalized, product_name, supplier_name').eq('organization_id', orgId),
    ]);
    const fout = gerechten.error ?? aliassen.error;
    if (fout) return NextResponse.json({ error: fout.message }, { status: 500 });

    const aliasOpNaam = new Map<string, { product_name: string; supplier_name: string | null }>(
        (aliassen.data ?? []).map((a: any) => [a.alias_normalized, { product_name: a.product_name, supplier_name: a.supplier_name ?? null }]),
    );

    const regels = new Map<string, KoppelrondeRegel>();
    const voeg = (naam: unknown, qty: unknown, eenheid: unknown, bron: string) => {
        const n = String(naam ?? '').trim();
        const key = aliasSleutel(n);
        if (!key) return;
        const bestaand = regels.get(key);
        if (bestaand) {
            if (!bestaand.bronnen.includes(bron)) bestaand.bronnen.push(bron);
            if (!bestaand.qty_pp && Number(qty) > 0) { bestaand.qty_pp = Number(qty); bestaand.eenheid = String(eenheid ?? '') || bestaand.eenheid; }
            return;
        }
        regels.set(key, {
            naam: n,
            qty_pp: Number(qty) > 0 ? Number(qty) : 0,
            eenheid: String(eenheid ?? '').trim(),
            bronnen: [bron],
            alias: aliasOpNaam.get(key) ?? null,
        });
    };

    for (const g of gerechten.data ?? []) {
        const gerechtNaam = String((g as any).naam ?? 'gerecht');
        const costs = Array.isArray((g as any).ingredient_costs) ? (g as any).ingredient_costs : [];
        for (const c of costs) voeg(c?.naam, c?.qty_pp, c?.unit, gerechtNaam);
        const tekst = Array.isArray((g as any).ingredienten) ? (g as any).ingredienten : [];
        for (const t of tekst) voeg(t, 0, '', gerechtNaam);
    }

    const lijst = [...regels.values()].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
    return NextResponse.json({ success: true, data: lijst, bekend: lijst.filter((r) => r.alias).length });
});
