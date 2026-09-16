import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { isUuid, validatePrintJobUpdate } from '@/lib/labelprinter/validators';
import { JOB_KOLOMMEN } from '@/lib/labelprinter/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function idUitUrl(req: NextRequest): string | null {
    const delen = new URL(req.url).pathname.split('/').filter(Boolean);
    const id = delen[delen.lastIndexOf('jobs') + 1];
    return isUuid(id) ? id : null;
}

/** Eén job, mét ZPL (voor de dev-pagina en "bekijk wat er verstuurd is"). */
export const GET = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    const id = idUitUrl(req);
    if (!id) return NextResponse.json({ error: 'Ongeldig id' }, { status: 400 });
    const { data, error } = await supabase
        .from('print_jobs')
        .select(`${JOB_KOLOMMEN}, zpl`)
        .eq('id', id)
        .eq('organization_id', orgId)
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Job niet gevonden' }, { status: 404 });
    return NextResponse.json({ job: data });
});

/**
 * PATCH /api/labels/jobs/[id] — de client meldt hoe het afliep.
 *
 * Een job die al klaar is (success/failed/cancelled) wordt niet meer
 * overschreven: een tweede melding (pagina herladen, dubbele callback) kan de
 * eerste waarheid niet veranderen. Wil je opnieuw printen, dan is dat een
 * nieuwe job.
 *
 * Het bijwerken van voorraad_eenheden (label_geprint_at) komt in fase 2; hier
 * alleen de job zelf.
 */
export const PATCH = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    const id = idUitUrl(req);
    if (!id) return NextResponse.json({ error: 'Ongeldig id' }, { status: 400 });
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 }); }
    const v = validatePrintJobUpdate(body);
    if (v.ok === false) return NextResponse.json({ error: v.error }, { status: 400 });
    const u = v.data;

    const nu = new Date().toISOString();
    const eind = u.status === 'success' || u.status === 'failed' || u.status === 'cancelled';
    const update: Record<string, unknown> = {
        status: u.status,
        geprint_eenheid_ids: u.geprintEenheidIds,
        onzeker_eenheid_ids: u.onzekerEenheidIds,
        foutmelding: u.foutmelding,
        printer_status: u.printerStatus,
    };
    if (u.geprintAantal != null) update.geprint_aantal = u.geprintAantal;
    if (u.deviceNaam) update.device_naam = u.deviceNaam;
    if (u.status === 'sent' || u.status === 'success') update.sent_at = nu;
    if (eind) update.finished_at = nu;

    const { data, error } = await supabase
        .from('print_jobs')
        .update(update)
        .eq('id', id)
        .eq('organization_id', orgId)
        .in('status', ['pending', 'preparing', 'connecting', 'sent'])
        .select(JOB_KOLOMMEN)
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) {
        /* Bestaat wel maar was al afgerond → geef de bestaande waarheid terug. */
        const { data: bestaand } = await supabase
            .from('print_jobs').select(JOB_KOLOMMEN).eq('id', id).eq('organization_id', orgId).maybeSingle();
        if (!bestaand) return NextResponse.json({ error: 'Job niet gevonden' }, { status: 404 });
        return NextResponse.json({ job: bestaand, alAfgerond: true });
    }
    return NextResponse.json({ job: data });
});
