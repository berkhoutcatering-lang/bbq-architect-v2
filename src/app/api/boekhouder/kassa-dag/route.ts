/* /api/boekhouder/kassa-dag — een kassadag wel of niet meetellen in de aangifte.
 *
 * POST { datum: 'YYYY-MM-DD', telt_mee: boolean, reden?: string }
 *
 * Voor testbestellingen tussen de echte kassaverkoop. Er wordt nooit
 * automatisch iets uitgesloten; dit is altijd een keuze in het scherm.
 * Weigert als het kwartaal van die dag al is vastgezet.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    const { data: m } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!m) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });
    const orgId = m.organization_id as string;

    const body = await req.json().catch(() => null) as { datum?: string; telt_mee?: boolean; reden?: string } | null;
    const datum = body?.datum;
    if (!datum || !/^\d{4}-\d{2}-\d{2}$/.test(datum) || typeof body?.telt_mee !== 'boolean') {
        return NextResponse.json({ error: 'datum (YYYY-MM-DD) + telt_mee verplicht' }, { status: 400 });
    }

    const jaar = Number(datum.slice(0, 4));
    const kwartaal = Math.ceil(Number(datum.slice(5, 7)) / 3);
    const { data: vast } = await supabase.from('btw_aangiftes').select('id')
        .eq('organization_id', orgId).eq('jaar', jaar).eq('kwartaal', kwartaal).maybeSingle();
    if (vast) {
        return NextResponse.json({ error: `Q${kwartaal} ${jaar} is al vastgezet — ontgrendel eerst de aangifte.` }, { status: 409 });
    }

    const res = body.telt_mee
        ? await supabase.from('btw_kassa_uitsluitingen').delete()
            .eq('organization_id', orgId).eq('datum', datum)
        /* organization_id ALTIJD expliciet meesturen (RLS insert-klasse). */
        : await supabase.from('btw_kassa_uitsluitingen')
            .insert({ organization_id: orgId, datum, reden: body.reden ?? null });
    /* 23505 = stond al op "telt niet mee" — prima. */
    if (res.error && res.error.code !== '23505') {
        const ontbreekt = res.error.code === '42P01' || res.error.code === 'PGRST205';
        return NextResponse.json({
            error: ontbreekt
                ? 'De database kent "kassadag niet meetellen" nog niet — draai eerst migratie 20261026130000_btw_kassa_uitsluitingen.sql'
                : res.error.message,
        }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
