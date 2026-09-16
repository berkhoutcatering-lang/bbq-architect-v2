import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { laadPartijDetail } from '@/lib/productie/detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function idUitUrl(req: NextRequest): string | null {
    const delen = new URL(req.url).pathname.split('/').filter(Boolean);
    const id = delen[delen.lastIndexOf('partij') + 1];
    return /^[0-9a-f-]{36}$/i.test(id ?? '') ? id : null;
}

/** Eén partij: eenheden, printjobs, component. Fase 4 voegt HACCP en herkomst toe. */
export const GET = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    const id = idUitUrl(req);
    if (!id) return NextResponse.json({ error: 'Ongeldig id' }, { status: 400 });
    const d = await laadPartijDetail(supabase, orgId, { partijId: id });
    if (d.ok === false) return NextResponse.json({ error: d.error }, { status: d.status });
    return NextResponse.json(d.data);
});
