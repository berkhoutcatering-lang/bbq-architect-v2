/**
 * GET /api/gerechten/af-status
 *
 * Per gerecht: welke van de vijf eisen uit `src/lib/gerechtAf.ts` gehaald zijn.
 *
 * Bestaat als eigen route omdat het antwoord uit vier tabellen komt —
 * gerechten, gerecht_components, recipe_steps — en de gerechten-pagina die
 * laatste twee helemaal niet kende. Daardoor kon dat scherm wel vijftien
 * gerechten tonen maar niet zeggen dat er nul van af waren.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { beoordeelGerecht, afOverzicht, type GerechtGegevens } from '@/lib/gerechtAf';

export const runtime = 'nodejs';

type Sb = Awaited<ReturnType<typeof createServerSupabase>>;

/**
 * Alle rijen van een tabel, gepagineerd — PostgREST geeft er standaard hooguit
 * duizend, en dat heeft vandaag al twee keer een telling stilletjes afgekapt.
 *
 * De sorteerkolom is een parameter en geen aanname. `gerecht_components` heeft
 * namelijk géén `id`: het is een koppeltabel op (gerecht_id, component_id). Wie
 * daar toch op id sorteert krijgt van PostgREST een fout op de héle query.
 *
 * En die fout gooien we door in plaats van hem in te slikken. Eerst stond hier
 * `if (error) break`, waarmee een kapotte query zich voordeed als een lege
 * tabel: zestien gerechten leken toen geen enkel ingrediënt te hebben terwijl er
 * vijf gevuld waren. Een leeg antwoord dat op een fout rust is erger dan geen
 * antwoord, want het ziet er compleet uit.
 */
async function alles<T>(
    supabase: Sb, tabel: string, kolommen: string, orgId: string, sorteerOp = 'id',
): Promise<T[]> {
    const uit: T[] = [];
    for (let van = 0; ; van += 1000) {
        const { data, error } = await supabase
            .from(tabel).select(kolommen)
            .eq('organization_id', orgId)
            .order(sorteerOp).range(van, van + 999);
        if (error) throw new Error(`${tabel}: ${error.message}`);
        if (!data) break;
        uit.push(...(data as T[]));
        if (data.length < 1000) break;
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

    try {
        return await bouwAntwoord(supabase, orgId);
    } catch (e) {
        /* Liever een zichtbare fout dan een overzicht dat ten onrechte zegt dat
           er niets af is. */
        return NextResponse.json(
            { error: e instanceof Error ? e.message : 'Af-status kon niet worden bepaald' },
            { status: 500 },
        );
    }
}

async function bouwAntwoord(supabase: Sb, orgId: string) {
    const [gerechten, componenten, stappen] = await Promise.all([
        alles<{
            id: string; naam: string; allergenen: unknown;
            total_cost_cents: number | null; kostprijs_pp: number | null;
            ingredient_costs: unknown; actief: boolean | null;
        }>(supabase, 'gerechten', 'id, naam, allergenen, total_cost_cents, kostprijs_pp, ingredient_costs, actief', orgId),
        /* Koppeltabel zonder id — sorteren op de eigen sleutel. */
        alles<{ gerecht_id: string }>(supabase, 'gerecht_components', 'gerecht_id, component_id', orgId, 'gerecht_id'),
        alles<{ gerecht_id: string | null; duur_actief_min: number | null; duur_passief_min: number | null }>(
            supabase, 'recipe_steps', 'id, gerecht_id, duur_actief_min, duur_passief_min', orgId),
    ]);

    const compPerGerecht = new Map<string, number>();
    for (const c of componenten) {
        compPerGerecht.set(c.gerecht_id, (compPerGerecht.get(c.gerecht_id) ?? 0) + 1);
    }
    const stapPerGerecht = new Map<string, { totaal: number; metDuur: number }>();
    for (const s of stappen) {
        if (!s.gerecht_id) continue;
        const huidig = stapPerGerecht.get(s.gerecht_id) ?? { totaal: 0, metDuur: 0 };
        huidig.totaal++;
        if (s.duur_actief_min != null || s.duur_passief_min != null) huidig.metDuur++;
        stapPerGerecht.set(s.gerecht_id, huidig);
    }

    const oordelen = gerechten
        .filter((g) => g.actief !== false)
        .map((g) => {
            const stap = stapPerGerecht.get(g.id) ?? { totaal: 0, metDuur: 0 };
            /* Ingrediënten kunnen op twee manieren gekoppeld zijn: als
               component-rijen of als ingredient_costs uit de catalogus-route.
               Allebei tellen — het gaat erom dát de bestellijst weet wat erin zit. */
            const uitCosts = Array.isArray(g.ingredient_costs) ? g.ingredient_costs.length : 0;
            const gegevens: GerechtGegevens = {
                id: g.id,
                naam: g.naam,
                ingredienten: Math.max(compPerGerecht.get(g.id) ?? 0, uitCosts),
                kostprijsCent: g.total_cost_cents ?? (g.kostprijs_pp ? Math.round(g.kostprijs_pp * 100) : null),
                allergenen: g.allergenen,
                stappen: stap.totaal,
                stappenMetDuur: stap.metDuur,
            };
            return beoordeelGerecht(gegevens);
        });

    return NextResponse.json({
        gerechten: oordelen,
        overzicht: afOverzicht(oordelen),
    });
}
