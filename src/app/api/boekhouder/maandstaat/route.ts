/* /api/boekhouder/maandstaat — winkelomzet van één maand.
 *
 * GET ?jaar=2026&maand=11          → de maandstaat als JSON
 * GET ?jaar=2026&maand=11&pdf=1    → dezelfde cijfers als PDF
 *
 * Rekent met dezelfde laadfunctie als de btw-aangifte. */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { laadAangifteBronnen } from '@/lib/btwAangifteBronnen';
import { maakMaandstaat, maandGrenzen, type DagstaatMin } from '@/lib/omzetMaandstaat';
import { maandstaatPdf } from '@/lib/omzetMaandstaatPdf';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    const jaar = Number(req.nextUrl.searchParams.get('jaar'));
    const maand = Number(req.nextUrl.searchParams.get('maand'));
    if (!Number.isInteger(jaar) || jaar < 2020 || jaar > 2100 || !Number.isInteger(maand) || maand < 1 || maand > 12) {
        return NextResponse.json({ error: 'Kies een geldige maand' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: lid } = await supabase.from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!lid) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });
    const orgId = lid.organization_id as string;

    const { start, eind } = maandGrenzen(jaar, maand);
    const [bronnen, dagstaten, settings, uitsluitingen] = await Promise.all([
        laadAangifteBronnen(supabase, orgId, start, eind),
        supabase.from('toonbank_dagstaten')
            .select('bedrijfsdag,status,pin_toonbank_cents,contant_geteld_cents,contant_verschil_cents,pin_verschil_cents,goedgekeurd_at')
            .eq('organization_id', orgId).gte('bedrijfsdag', start).lte('bedrijfsdag', eind),
        supabase.from('settings').select('bedrijfsnaam').eq('organization_id', orgId).maybeSingle(),
        supabase.from('btw_kassa_uitsluitingen').select('datum').eq('organization_id', orgId).gte('datum', start).lte('datum', eind),
    ]);
    if (bronnen.kassa_fout) return NextResponse.json({ error: bronnen.kassa_fout }, { status: 502 });
    if (dagstaten.error) return NextResponse.json({ error: dagstaten.error.message }, { status: 502 });

    const staat = maakMaandstaat(jaar, maand, bronnen.kassa, (dagstaten.data ?? []) as DagstaatMin[],
        new Set((uitsluitingen.data ?? []).map((u) => String(u.datum))));

    if (req.nextUrl.searchParams.get('pdf')) {
        const { base64, filename } = maandstaatPdf(staat, (settings.data as { bedrijfsnaam?: string } | null)?.bedrijfsnaam ?? '');
        return new NextResponse(Buffer.from(base64, 'base64'), {
            headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` },
        });
    }
    return NextResponse.json(staat);
}
