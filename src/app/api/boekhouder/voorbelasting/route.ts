/* /api/boekhouder/voorbelasting — bonnen van één kwartaal die nog op
 * voorbelasting-bevestiging wachten (en de bonnen zonder BTW, voor het
 * markeren van verlegde BTW).
 *
 * GET ?year=YYYY&quarter=1..4
 *
 * Bestaat omdat de bevestiging onderaan elke losse bon zat: met vijftig bonnen
 * per kwartaal deed niemand dat, en telde 5b stil €0.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { quarterPeriod, bonBtwBedrag, bonWachtOpVoorbelasting } from '@/lib/financeAnalytics';
import { laadBonnen, type AangifteBon } from '@/lib/btwAangifteBronnen';

export const runtime = 'nodejs';

function rij(b: AangifteBon) {
    return {
        id: b.id,
        datum: b.datum ?? null,
        naam: b.leverancier_naam || b.winkel || null,
        totaal: Number(b.totaal_bedrag) || 0,
        btw: bonBtwBedrag(b),
        btw_verlegd: b.btw_verlegd ?? null,
        zakelijk_pct: b.zakelijk_pct == null ? 100 : Number(b.zakelijk_pct),
        vergrendeld: !!b.locked_at,
    };
}

export async function GET(req: NextRequest) {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    const { data: m } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!m) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    const year = Number(req.nextUrl.searchParams.get('year'));
    const quarter = Number(req.nextUrl.searchParams.get('quarter'));
    if (!Number.isInteger(year) || year < 2020 || year > 2099 || ![1, 2, 3, 4].includes(quarter)) {
        return NextResponse.json({ error: 'year + quarter (1-4) verplicht' }, { status: 400 });
    }
    const period = quarterPeriod(year, quarter as 1 | 2 | 3 | 4);

    const res = await laadBonnen(supabase, m.organization_id as string, period.start_date, period.end_date);
    if (res.fout) return NextResponse.json({ error: res.fout }, { status: 500 });

    const opDatum = (a: AangifteBon, b: AangifteBon) => String(a.datum).localeCompare(String(b.datum));
    const wachtend = res.bonnen.filter(bonWachtOpVoorbelasting).sort(opDatum).map(rij);
    /* Bonnen zonder BTW: hier kan een buitenlandse dienst tussen zitten
       waarvan de BTW verlegd is (bv. een Amerikaans software-abonnement). */
    const zonderBtw = res.bonnen
        .filter((b) => bonBtwBedrag(b) === 0 && !b.btw_verlegd)
        .sort(opDatum).map(rij);

    return NextResponse.json({
        wachtend,
        zonder_btw: zonderBtw,
        verlegd_beschikbaar: res.verlegd_beschikbaar,
    });
}
