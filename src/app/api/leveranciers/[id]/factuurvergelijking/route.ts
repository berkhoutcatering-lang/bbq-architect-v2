/**
 * GET /api/leveranciers/[id]/factuurvergelijking
 *
 * Legt de regels van de gescande facturen van één leverancier naast diens
 * prijslijst. Beantwoordt de vraag die een prijslijst zelf niet kan
 * beantwoorden: klopt wat er in de lijst staat met wat er op de rekening kwam?
 *
 * De aanleiding is Beef Club. Een deel van hun prijzen komt uit de catalogus
 * van de Belgische groothandel waar zij zelf inkopen, en daar leggen ze een
 * marge op. Hoeveel staat nergens — maar de facturen weten het.
 *
 * Deze route rekent niets uit dat niet uit de twee bronnen volgt en verandert
 * geen enkele prijs. Hij vergelijkt en rapporteert; wat er met een afwijking
 * moet gebeuren is een beslissing van de kok, niet van de code.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { vergelijkBon, type BonRegel, type LijstRegel } from '@/lib/bonPrijsvergelijking';

export const runtime = 'nodejs';

/* Een leverancier kan honderden prijsregels hebben; alles ophalen in één slag
   loopt tegen de rij-limiet van PostgREST aan. Die limiet heeft eerder een
   telling stilletjes op duizend afgekapt, dus hier pagineren we expliciet. */
async function alleLijstregels(
    supabase: Awaited<ReturnType<typeof createServerSupabase>>,
    orgId: string,
    leverancierNaam: string,
): Promise<LijstRegel[]> {
    const uit: LijstRegel[] = [];
    const stap = 1000;
    for (let van = 0; ; van += stap) {
        const { data, error } = await supabase
            .from('supplier_prices')
            .select('product_naam, eenheid, prijs, prijs_per_kg')
            .eq('organization_id', orgId)
            .eq('leverancier', leverancierNaam)
            .eq('actief', true)
            .order('id')
            .range(van, van + stap - 1);
        if (error || !data) break;
        uit.push(...(data as LijstRegel[]));
        if (data.length < stap) break;
    }
    return uit;
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    const leverancierId = Number(id);
    if (!Number.isInteger(leverancierId)) {
        return NextResponse.json({ error: 'ongeldige id' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: mem } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    const orgId = mem?.organization_id as string | undefined;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 400 });

    const { data: lev } = await supabase
        .from('leveranciers').select('id, naam')
        .eq('id', leverancierId).eq('organization_id', orgId).maybeSingle();
    if (!lev) return NextResponse.json({ error: 'leverancier niet gevonden' }, { status: 404 });

    const [lijst, bonnenRes] = await Promise.all([
        alleLijstregels(supabase, orgId, lev.naam as string),
        supabase
            .from('bonnen')
            .select('id, datum, winkel, totaal_bedrag, bon_items')
            .eq('organization_id', orgId)
            .eq('leverancier_id', leverancierId)
            .order('datum', { ascending: false })
            .limit(50),
    ]);

    if (bonnenRes.error) {
        return NextResponse.json({ error: bonnenRes.error.message }, { status: 500 });
    }

    const facturen = (bonnenRes.data ?? []).map((b) => {
        const regels: BonRegel[] = Array.isArray(b.bon_items)
            ? (b.bon_items as unknown[])
                .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
                .map((x) => ({
                    naam: String(x.naam ?? ''),
                    aantal: typeof x.aantal === 'number' ? x.aantal : null,
                    unit: typeof x.unit === 'string' ? x.unit : null,
                    prijs: Number(x.prijs ?? 0),
                    totaal: typeof x.totaal === 'number' ? x.totaal : null,
                }))
                .filter((r) => r.naam && Number.isFinite(r.prijs) && r.prijs > 0)
            : [];
        return {
            bon_id: b.id,
            datum: b.datum,
            totaal_bedrag: b.totaal_bedrag,
            ...vergelijkBon(regels, lijst),
        };
    });

    /* Eén samenvatting over alle facturen samen. Alleen over regels die echt
       vergeleken konden worden — een regel zonder match als nul meetellen zou
       een afwijking wegpoetsen die er wel degelijk is. */
    const alleMeetbaar = facturen.flatMap((f) => f.regels).filter((v) => v.verschilPct != null);
    const gemiddeld = alleMeetbaar.length > 0
        ? Math.round((alleMeetbaar.reduce((s, v) => s + (v.verschilPct ?? 0), 0) / alleMeetbaar.length) * 10) / 10
        : null;

    return NextResponse.json({
        leverancier: lev,
        lijstregels: lijst.length,
        facturen,
        samenvatting: {
            facturen: facturen.length,
            vergeleken: alleMeetbaar.length,
            afwijkend: alleMeetbaar.filter((v) => v.stand !== 'gelijk').length,
            gemiddeldPct: gemiddeld,
        },
    });
}
