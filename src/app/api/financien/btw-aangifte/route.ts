/* /api/financien/btw-aangifte — vastzetten + historie van kwartaalaangiftes
 *
 * GET    → lijst vastgezette aangiftes (historie), nieuwste eerst.
 * POST   → { year, quarter } : bereken rubrieken server-side en zet vast
 *          (onveranderlijke snapshot). Weigert als het kwartaal al vaststaat.
 * DELETE → { id } : ontgrendel (verwijder snapshot) zodat opnieuw kan.
 *
 * Geen AI in de loop — bedragen komen uit financeAnalytics.computeBtwAangifte().
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { quarterPeriod, computeBtwAangifte, computeBoekhoudChecks } from '@/lib/financeAnalytics';

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

    const body = await req.json().catch(() => null) as { year?: number; quarter?: number } | null;
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

    /* Verse berekening uit facturen + bonnen. RLS isoleert op org. */
    const [factResp, bonnenResp] = await Promise.all([
        supabase.from('facturen')
            .select('id,nummer,client_naam,datum,status,items')
            .eq('organization_id', org.orgId)
            .gte('datum', period.start_date).lte('datum', period.end_date),
        supabase.from('bonnen')
            .select('datum,totaal_bedrag,btw_laag_bedrag,btw_hoog_bedrag,rgs_code,ai_classify_status')
            .eq('organization_id', org.orgId)
            .gte('datum', period.start_date).lte('datum', period.end_date),
    ]);
    if (factResp.error || bonnenResp.error) {
        return NextResponse.json({ error: 'Data-fetch faalde', detail: factResp.error?.message || bonnenResp.error?.message }, { status: 500 });
    }

    const facturen = factResp.data || [];
    const bonnen = bonnenResp.data || [];
    const rubrieken = computeBtwAangifte(facturen, bonnen, period);
    const checks = computeBoekhoudChecks(facturen, bonnen, period);
    const openIssues = checks.filter(c => c.severity === 'error').length;

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
                open_issues: openIssues,
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
