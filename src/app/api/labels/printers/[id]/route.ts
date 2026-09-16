import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { isUuid, validatePrinter } from '@/lib/labelprinter/validators';
import { PRINTER_KOLOMMEN } from '@/lib/labelprinter/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function idUitUrl(req: NextRequest): string | null {
    const delen = new URL(req.url).pathname.split('/').filter(Boolean);
    const id = delen[delen.lastIndexOf('printers') + 1];
    return isUuid(id) ? id : null;
}

export const PATCH = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    const id = idUitUrl(req);
    if (!id) return NextResponse.json({ error: 'Ongeldig id' }, { status: 400 });
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 }); }

    /* Statusvelden mogen los van de validator mee: de UI schrijft de laatst
       geziene printerstatus weg, puur informatief. */
    const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
    const v = validatePrinter(b, true);
    if (v.ok === false) return NextResponse.json({ error: v.error }, { status: 400 });
    const update: Record<string, unknown> = { ...v.data };
    if (typeof b.laatste_status === 'object' && b.laatste_status !== null) {
        update.laatste_status = b.laatste_status;
        update.laatst_gezien_at = new Date().toISOString();
    }
    if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Niets om bij te werken' }, { status: 400 });

    const { data, error } = await supabase
        .from('label_printers')
        .update(update)
        .eq('id', id)
        .eq('organization_id', orgId)
        .select(PRINTER_KOLOMMEN)
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Printer niet gevonden' }, { status: 404 });
    return NextResponse.json({ printer: data });
});

export const DELETE = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    const id = idUitUrl(req);
    if (!id) return NextResponse.json({ error: 'Ongeldig id' }, { status: 400 });
    /* Printjobs houden hun geschiedenis: printer_id wordt null (on delete set null). */
    const { error, count } = await supabase
        .from('label_printers')
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('organization_id', orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!count) return NextResponse.json({ error: 'Printer niet gevonden' }, { status: 404 });
    return NextResponse.json({ ok: true });
});
