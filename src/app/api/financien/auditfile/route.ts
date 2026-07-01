/* /api/financien/auditfile?year=YYYY — download XAF 4.0 (Auditfile Financieel)
 *
 * Genereert het bestand dat NL-boekhoudsoftware kan importeren, uit de
 * facturen + bonnen van het boekjaar. Dubbel-boekhouden, sluitend per post.
 * Geen AI in de loop.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { buildXafAuditfile } from '@/lib/xafAuditfile';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: membership } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!membership) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });
    const orgId = membership.organization_id as string;

    const yearParam = Number(req.nextUrl.searchParams.get('year'));
    const year = Number.isInteger(yearParam) && yearParam >= 2020 && yearParam <= 2099
        ? yearParam
        : new Date().getFullYear();

    const start = `${year}-01-01`, end = `${year}-12-31`;
    const [orgResp, factResp, bonnenResp] = await Promise.all([
        supabase.from('organizations').select('name, kvk_number, btw_number').eq('id', orgId).maybeSingle(),
        supabase.from('facturen')
            .select('nummer,client_naam,datum,status,items')
            .eq('organization_id', orgId).gte('datum', start).lte('datum', end),
        supabase.from('bonnen')
            .select('id,datum,winkel,netto_bedrag,totaal_bedrag,btw_laag_bedrag,btw_hoog_bedrag,rgs_code,rgs_category_label,categorie')
            .eq('organization_id', orgId).gte('datum', start).lte('datum', end),
    ]);

    if (factResp.error || bonnenResp.error) {
        return NextResponse.json({ error: 'Data-fetch faalde', detail: factResp.error?.message || bonnenResp.error?.message }, { status: 500 });
    }

    const xml = buildXafAuditfile({
        company: {
            name: orgResp.data?.name || 'Onbekend',
            kvk: orgResp.data?.kvk_number,
            btw: orgResp.data?.btw_number,
        },
        facturen: factResp.data || [],
        bonnen: bonnenResp.data || [],
        year,
        createdDate: new Date().toISOString().slice(0, 10),
    });

    return new NextResponse(xml, {
        status: 200,
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Content-Disposition': `attachment; filename="auditfile-${year}.xaf"`,
            'Cache-Control': 'no-store',
        },
    });
}
