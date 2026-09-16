import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { validatePrinter } from '@/lib/labelprinter/validators';
import { PRINTER_KOLOMMEN } from '@/lib/labelprinter/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Alle printers van deze organisatie (ook inactieve; de UI filtert). */
export const GET = withTenantAuth(async (_req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    const { data, error } = await supabase
        .from('label_printers')
        .select(PRINTER_KOLOMMEN)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ printers: data ?? [] });
});

/** Printer koppelen. organization_id altijd expliciet (RLS WITH CHECK). */
export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 }); }
    const v = validatePrinter(body, false);
    if (v.ok === false) return NextResponse.json({ error: v.error }, { status: 400 });
    /* De mock-printer is er om zonder Zebra te bouwen; in productie bestaat hij niet. */
    if (v.data.transport === 'mock' && process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Mock-printer is alleen beschikbaar in ontwikkeling' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('label_printers')
        .insert({ organization_id: orgId, ...v.data })
        .select(PRINTER_KOLOMMEN)
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ printer: data }, { status: 201 });
});
