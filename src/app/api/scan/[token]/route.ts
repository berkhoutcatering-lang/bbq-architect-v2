import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { laadPartijDetail } from '@/lib/productie/detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/scan/[token] — de QR op een label lost hier op naar de eenheid,
 * de partij, HACCP en herkomst. Ingelogd en binnen de eigen organisatie
 * (RLS); het token is een lookup-sleutel, geen toegangsbewijs.
 */
export const GET = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    const delen = new URL(req.url).pathname.split('/').filter(Boolean);
    const token = delen[delen.lastIndexOf('scan') + 1] ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: 'Ongeldige code' }, { status: 400 });
    const d = await laadPartijDetail(supabase, orgId, { scanToken: token });
    if (d.ok === false) return NextResponse.json({ error: d.error }, { status: d.status });
    return NextResponse.json(d.data);
});
