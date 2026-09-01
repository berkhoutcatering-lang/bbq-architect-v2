/**
 * GET /api/leveranciers/scan-status
 *
 * Per leverancier: is zijn assortiment opgehaald met de nieuwe scanner of nog
 * met de oude?
 *
 * Dat is geen instelling die iemand heeft ingevuld, het is af te lezen. De
 * nieuwe runner schrijft naar `supplier_products` (catalogus B) met
 * `source = 'extension'`; de oude schreef naar `supplier_prices` (catalogus A).
 * Staat er van een leverancier wel iets in A en niets in B, dan is dat
 * assortiment nog met de oude scanner binnengehaald.
 *
 * Waarom dit los staat van ouderdom: een lijst kan van vorige week zijn en
 * tóch met de oude scanner opgehaald, en dan is hij niet alleen ouder maar ook
 * dunner. Mathijs, 2026-09-01: Vuur & Rook, Makro en Sligro moeten sowieso
 * opnieuw, ongeacht de datum. Bidfood en Baktotaal zijn al door de nieuwe.
 *
 * Leveranciers zonder extensie-koppeling (Beef Club loopt via PDF-uploads)
 * krijgen geen oordeel — daar is geen scanner in het spel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

type Sb = Awaited<ReturnType<typeof createServerSupabase>>;

/* PostgREST geeft standaard hooguit duizend rijen terug. Catalogus B heeft er
   ruim zevenduizend, dus zonder pagineren telt dit stilletjes verkeerd — die
   fout is vandaag al een keer gemaakt. */
async function allePaginas<T>(
    supabase: Sb, tabel: string, kolommen: string, orgId: string,
): Promise<T[]> {
    const uit: T[] = [];
    const stap = 1000;
    for (let van = 0; ; van += stap) {
        const { data, error } = await supabase
            .from(tabel).select(kolommen)
            .eq('organization_id', orgId)
            .order('id').range(van, van + stap - 1);
        if (error || !data) break;
        uit.push(...(data as T[]));
        if (data.length < stap) break;
    }
    return uit;
}

export async function GET(_req: NextRequest) {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: mem } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    const orgId = mem?.organization_id as string | undefined;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 400 });

    const [lev, catB, catA] = await Promise.all([
        supabase.from('leveranciers')
            .select('id, naam, import_method')
            .eq('organization_id', orgId)
            .is('archived_at', null),
        allePaginas<{ supplier_id: number | null; source: string | null }>(
            supabase, 'supplier_products', 'id, supplier_id, source', orgId),
        allePaginas<{ leverancier: string | null; actief: boolean | null }>(
            supabase, 'supplier_prices', 'id, leverancier, actief', orgId),
    ]);

    const nieuwPerLev = new Map<number, number>();
    for (const r of catB) {
        if (r.source !== 'extension' || r.supplier_id == null) continue;
        nieuwPerLev.set(r.supplier_id, (nieuwPerLev.get(r.supplier_id) ?? 0) + 1);
    }
    const oudPerNaam = new Map<string, number>();
    for (const r of catA) {
        if (r.actief === false || !r.leverancier) continue;
        oudPerNaam.set(r.leverancier, (oudPerNaam.get(r.leverancier) ?? 0) + 1);
    }

    const status = (lev.data ?? []).map((l) => {
        const nieuw = nieuwPerLev.get(l.id as number) ?? 0;
        const oud = oudPerNaam.get(l.naam as string) ?? 0;
        /* Zonder extensie-koppeling is er geen scanner en dus geen oordeel. */
        const scanner: 'nieuw' | 'oud' | 'geen' =
            l.import_method !== 'extension' ? 'geen'
                : nieuw > 0 ? 'nieuw'
                    : oud > 0 ? 'oud'
                        : 'geen';
        return {
            id: l.id,
            naam: l.naam,
            scanner,
            nieuweProducten: nieuw,
            oudeProducten: oud,
        };
    });

    return NextResponse.json({
        leveranciers: status,
        metOudeScanner: status.filter((s) => s.scanner === 'oud').length,
    });
}
