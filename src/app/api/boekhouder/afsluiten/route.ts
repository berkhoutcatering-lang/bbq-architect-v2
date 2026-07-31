/* /api/boekhouder/afsluiten — maand afsluiten + kwartaal-aangiftecijfers
 *
 * GET ?year=YYYY  → per maand: heeft-data + afgesloten; per kwartaal: de
 *                   BTW-rubrieken (live berekend) + of het al vastgezet is.
 * POST { jaar, maand, action:'sluit'|'heropen' }
 *        sluit   → registreer afsluiting + vergrendel bonnen/facturen van de maand
 *        heropen → alleen als het kwartaal nog niet is vastgezet
 *
 * Geen AI in de loop — cijfers uit financeAnalytics.computeBtwAangifte().
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { quarterPeriod, computeBtwAangifte } from '@/lib/financeAnalytics';

export const runtime = 'nodejs';

async function resolveOrg(supabase: Awaited<ReturnType<typeof createServerSupabase>>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd', status: 401 as const };
    const { data: m } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!m) return { error: 'Geen organisatie', status: 403 as const };
    return { user, orgId: m.organization_id as string };
}

const monthRange = (jaar: number, maand: number) => {
    const start = `${jaar}-${String(maand).padStart(2, '0')}-01`;
    const nextY = maand === 12 ? jaar + 1 : jaar;
    const nextM = maand === 12 ? 1 : maand + 1;
    const eind = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
    return { start, eind };
};

export async function GET(req: NextRequest) {
    const supabase = await createServerSupabase();
    const org = await resolveOrg(supabase);
    if ('error' in org) return NextResponse.json({ error: org.error }, { status: org.status });

    const year = Number(req.nextUrl.searchParams.get('year')) || new Date().getFullYear();

    const [factResp, bonnenResp, afsluitResp, vastResp] = await Promise.all([
        supabase.from('facturen').select('id,nummer,client_naam,datum,status,items')
            .eq('organization_id', org.orgId).gte('datum', `${year}-01-01`).lte('datum', `${year}-12-31`),
        supabase.from('bonnen').select('datum,totaal_bedrag,btw_laag_bedrag,btw_hoog_bedrag,rgs_code,ai_classify_status,voorbelasting_bevestigd,zakelijk_pct')
            .eq('organization_id', org.orgId).gte('datum', `${year}-01-01`).lte('datum', `${year}-12-31`),
        supabase.from('maand_afsluitingen').select('maand').eq('organization_id', org.orgId).eq('jaar', year),
        supabase.from('btw_aangiftes').select('kwartaal, saldo').eq('organization_id', org.orgId).eq('jaar', year),
    ]);

    const facturen = factResp.data || [];
    const bonnen = bonnenResp.data || [];
    const afgesloten = new Set((afsluitResp.data || []).map(r => r.maand));
    const vastgezet = new Map((vastResp.data || []).map(r => [r.kwartaal, Number(r.saldo)]));

    const heeftData = (mnd: number) => {
        const mm = String(mnd).padStart(2, '0');
        return facturen.some(f => (f.datum || '').slice(5, 7) === mm)
            || bonnen.some(b => String(b.datum || '').slice(5, 7) === mm);
    };
    const maanden = Array.from({ length: 12 }, (_, i) => ({
        maand: i + 1,
        heeft_data: heeftData(i + 1),
        afgesloten: afgesloten.has(i + 1),
    }));

    const kwartalen = [1, 2, 3, 4].map(q => {
        const period = quarterPeriod(year, q as 1 | 2 | 3 | 4);
        const r = computeBtwAangifte(facturen, bonnen, period);
        const maandenInQ = [(q - 1) * 3 + 1, (q - 1) * 3 + 2, (q - 1) * 3 + 3];
        return {
            kwartaal: q,
            rubrieken: r,
            vastgezet: vastgezet.has(q),
            alle_maanden_afgesloten: maandenInQ.every(m => afgesloten.has(m) || !heeftData(m)),
        };
    });

    return NextResponse.json({ year, maanden, kwartalen });
}

export async function POST(req: NextRequest) {
    const supabase = await createServerSupabase();
    const org = await resolveOrg(supabase);
    if ('error' in org) return NextResponse.json({ error: org.error }, { status: org.status });

    const body = await req.json().catch(() => null) as { jaar?: number; maand?: number; action?: string } | null;
    const jaar = body?.jaar, maand = body?.maand, action = body?.action;
    if (typeof jaar !== 'number' || typeof maand !== 'number' || maand < 1 || maand > 12) {
        return NextResponse.json({ error: 'jaar + maand (1-12) verplicht' }, { status: 400 });
    }
    const { start, eind } = monthRange(jaar, maand);

    if (action === 'sluit') {
        const { error: insErr } = await supabase.from('maand_afsluitingen')
            .insert({ organization_id: org.orgId, jaar, maand, afgesloten_by: org.user.id });
        if (insErr && !insErr.message.includes('duplicate')) {
            return NextResponse.json({ error: insErr.message }, { status: 500 });
        }
        /* Vergrendel de bonnen + facturen van de maand (alleen nog-open records). */
        await supabase.from('bonnen').update({ locked_at: new Date().toISOString() })
            .eq('organization_id', org.orgId).gte('datum', start).lt('datum', eind).is('locked_at', null);
        await supabase.from('facturen').update({ locked_at: new Date().toISOString() })
            .eq('organization_id', org.orgId).gte('datum', start).lt('datum', eind).is('locked_at', null);
        return NextResponse.json({ ok: true });
    }

    if (action === 'heropen') {
        /* Niet heropenen als het kwartaal al is vastgezet. */
        const kwartaal = Math.ceil(maand / 3);
        const { data: vast } = await supabase.from('btw_aangiftes').select('id')
            .eq('organization_id', org.orgId).eq('jaar', jaar).eq('kwartaal', kwartaal).maybeSingle();
        if (vast) {
            return NextResponse.json({ error: `Kwartaal Q${kwartaal} is al vastgezet — ontgrendel eerst de aangifte.` }, { status: 409 });
        }
        await supabase.from('maand_afsluitingen').delete()
            .eq('organization_id', org.orgId).eq('jaar', jaar).eq('maand', maand);
        await supabase.from('bonnen').update({ locked_at: null })
            .eq('organization_id', org.orgId).gte('datum', start).lt('datum', eind);
        await supabase.from('facturen').update({ locked_at: null })
            .eq('organization_id', org.orgId).gte('datum', start).lt('datum', eind);
        return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Onbekende actie' }, { status: 400 });
}
