/* POST /api/recipe/alternatives — bij twijfel: drie gerichte alternatieven
 * uit de kostprijs-catalogus, plus een oordeel over de huidige koppeling.
 *
 * Golf 2 van docs/leveranciersvoorkeur-plan.md. Het werk zit in
 * lib/ingredientAlternatieven.ts (gedeeld met de matcher, die dezelfde stap
 * sinds golf 4 automatisch draait als er niets gevonden is). Hier alleen:
 * invoer controleren, kostenplafond, en de uitkomst teruggeven.
 *
 * Er wordt niets opgeslagen: de kok kiest, of laat de regel leeg.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { enforceAiCap } from '@/lib/aiCostCap';
import { kostprijsLeverancier, leveranciersOpId } from '@/lib/ingredientMatchDb';
import { zoekAlternatieven, AiFout } from '@/lib/ingredientAlternatieven';
import { toBaseUnit } from '@/lib/recipeMatch';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface Body {
    naam?: unknown;
    qty_pp?: unknown;
    eenheid?: unknown;
    /** De koppeling die er nu staat, als die er is. */
    huidige?: { name?: unknown; source?: unknown; ref_id?: unknown } | null;
}

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId, userId }: TenantAuthCtx) => {
    let body: Body;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
    }
    const naam = typeof body.naam === 'string' ? body.naam.trim().slice(0, 200) : '';
    const qty = Number(body.qty_pp) || 0;
    const eenheid = typeof body.eenheid === 'string' ? body.eenheid.trim().slice(0, 20) : '';
    if (!naam) return NextResponse.json({ error: 'Geen ingrediënt' }, { status: 400 });
    const huidigeNaam = typeof body.huidige?.name === 'string' ? body.huidige.name : null;

    const cap = await enforceAiCap(orgId, 0.03);
    if (cap) return cap;

    const lev = await kostprijsLeverancier(supabase, orgId);
    const levById = await leveranciersOpId(supabase, orgId);

    try {
        const uit = await zoekAlternatieven({ sb: supabase, orgId, userId, lev, levById }, { naam, qty, eenheid, huidigeNaam });
        return NextResponse.json({
            success: true,
            data: {
                ...uit,
                kostprijs_leverancier: lev?.naam ?? null,
                recept_eenheid: toBaseUnit(eenheid)?.base ?? null,
            },
        });
    } catch (e) {
        if (e instanceof AiFout) return NextResponse.json({ error: e.message }, { status: e.status });
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Onbekende fout' }, { status: 500 });
    }
});
