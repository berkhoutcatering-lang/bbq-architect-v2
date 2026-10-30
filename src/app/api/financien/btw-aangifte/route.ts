/* /api/financien/btw-aangifte — vastzetten + historie van kwartaalaangiftes
 *
 * GET    → lijst vastgezette aangiftes (historie), nieuwste eerst.
 * POST   → { year, quarter, accepteer_open_punten? } : bereken rubrieken
 *          server-side en zet vast (onveranderlijke snapshot). Weigert als het
 *          kwartaal al vaststaat. Weigert óók (409, `open_punten`) zolang er
 *          bonnen op voorbelasting-bevestiging wachten of de kassa niet te
 *          lezen was — tenzij de gebruiker dat expliciet accepteert.
 * DELETE → { id } : ontgrendel (verwijder snapshot) zodat opnieuw kan.
 *
 * Geen AI in de loop — bedragen komen uit financeAnalytics.computeBtwAangifte().
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { quarterPeriod, computeBtwAangifte, computeBoekhoudChecks } from '@/lib/financeAnalytics';
import { laadAangifteBronnen } from '@/lib/btwAangifteBronnen';
import { formatEur } from '@/lib/format';

export const runtime = 'nodejs';

async function resolveOrg(supabase: Awaited<ReturnType<typeof createServerSupabase>>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd', status: 401 as const };
    const { data: membership } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!membership) return { error: 'Geen organisatie', status: 403 as const };
    return { user, orgId: membership.organization_id as string };
}

export async function GET() {
    const supabase = await createServerSupabase();
    const org = await resolveOrg(supabase);
    if ('error' in org) return NextResponse.json({ error: org.error }, { status: org.status });

    const { data, error } = await supabase
        .from('btw_aangiftes')
        .select('id, jaar, kwartaal, periode_start, periode_eind, rubrieken, saldo, meta, vastgezet_at')
        .eq('organization_id', org.orgId)
        .order('jaar', { ascending: false })
        .order('kwartaal', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ aangiftes: data || [] });
}

export async function POST(req: NextRequest) {
    const supabase = await createServerSupabase();
    const org = await resolveOrg(supabase);
    if ('error' in org) return NextResponse.json({ error: org.error }, { status: org.status });

    const body = await req.json().catch(() => null) as { year?: number; quarter?: number; accepteer_open_punten?: boolean } | null;
    const year = body?.year;
    const quarter = body?.quarter;
    if (typeof year !== 'number' || year < 2020 || year > 2099) {
        return NextResponse.json({ error: 'year moet tussen 2020 en 2099 liggen' }, { status: 400 });
    }
    if (typeof quarter !== 'number' || ![1, 2, 3, 4].includes(quarter)) {
        return NextResponse.json({ error: 'quarter moet 1|2|3|4 zijn' }, { status: 400 });
    }

    const period = quarterPeriod(year, quarter as 1 | 2 | 3 | 4);

    /* Bestaat al? Vastgezette aangifte is onveranderlijk — eerst ontgrendelen. */
    const { data: existing } = await supabase
        .from('btw_aangiftes').select('id')
        .eq('organization_id', org.orgId).eq('jaar', year).eq('kwartaal', quarter).maybeSingle();
    if (existing) {
        return NextResponse.json({ error: 'Dit kwartaal is al vastgezet. Ontgrendel eerst om opnieuw vast te zetten.' }, { status: 409 });
    }

    /* Verse berekening uit facturen + bonnen + kassa. Zelfde bron als het scherm. */
    const bronnen = await laadAangifteBronnen(supabase, org.orgId, period.start_date, period.end_date);
    if (bronnen.fout) {
        return NextResponse.json({ error: 'Data-fetch faalde', detail: bronnen.fout }, { status: 500 });
    }

    const { facturen, bonnen, kassa } = bronnen;
    const rubrieken = computeBtwAangifte(facturen, bonnen, period, kassa);
    const checks = computeBoekhoudChecks(facturen, bonnen, period);
    const openIssues = checks.filter(c => c.severity === 'error').length;

    /* Een vastgezette aangifte met BTW die nog wacht, mist die aftrek voorgoed.
       Eerst zeggen hoeveel het is; alleen doorgaan als de gebruiker dat weet. */
    const openPunten: string[] = [];
    if (rubrieken.voorbelasting_onbevestigd > 0) {
        const n = rubrieken.voorbelasting_onbevestigd_count;
        openPunten.push(`${formatEur(rubrieken.voorbelasting_onbevestigd)} BTW op ${n} ${n === 1 ? 'bon' : 'bonnen'} wacht nog op bevestiging en telt niet mee in 5b.`);
    }
    if (bronnen.kassa_fout) {
        openPunten.push(`${bronnen.kassa_fout} Kassaomzet ontbreekt in 1a/1b.`);
    }
    if (openPunten.length > 0 && body?.accepteer_open_punten !== true) {
        return NextResponse.json({
            error: 'Nog niet alles is verwerkt.',
            open_punten: openPunten,
            voorbelasting_onbevestigd: rubrieken.voorbelasting_onbevestigd,
            voorbelasting_onbevestigd_count: rubrieken.voorbelasting_onbevestigd_count,
        }, { status: 409 });
    }

    /* organization_id ALTIJD expliciet meesturen (RLS insert-klasse). */
    const { data: inserted, error: insertErr } = await supabase
        .from('btw_aangiftes')
        .insert({
            organization_id: org.orgId,
            jaar: year,
            kwartaal: quarter,
            periode_start: period.start_date,
            periode_eind: period.end_date,
            rubrieken,
            saldo: rubrieken.saldo,
            meta: {
                facturen_count: facturen.length,
                bonnen_count: bonnen.length,
                kassa_regels: rubrieken.kassa.regels,
                open_issues: openIssues,
                /* Wat de gebruiker bewust accepteerde bij het vastzetten. */
                open_punten_geaccepteerd: openPunten,
                vastgezet_at: new Date().toISOString(),
            },
            vastgezet_by: org.user.id,
        })
        .select('id, jaar, kwartaal, periode_start, periode_eind, rubrieken, saldo, meta, vastgezet_at')
        .single();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    return NextResponse.json({ aangifte: inserted });
}

export async function DELETE(req: NextRequest) {
    const supabase = await createServerSupabase();
    const org = await resolveOrg(supabase);
    if ('error' in org) return NextResponse.json({ error: org.error }, { status: org.status });

    const body = await req.json().catch(() => null) as { id?: string } | null;
    if (!body?.id) return NextResponse.json({ error: 'id verplicht' }, { status: 400 });

    const { error } = await supabase
        .from('btw_aangiftes').delete()
        .eq('id', body.id).eq('organization_id', org.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
