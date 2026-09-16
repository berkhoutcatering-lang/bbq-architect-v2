import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { validatePartijAfronden } from '@/lib/productie/validators';
import { bepaalBron, naarAfrondenInput } from '@/lib/productie/bron';
import { rondPartijAf } from '@/lib/productie/afronden';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/productie/partij-afronden — "Afmaken met sticker" vanaf het
 * kookbord (mep_item), een al klaar gemelde taak (prep_task) of los.
 *
 * Idempotent: dezelfde idempotencyKey, taak of MEP-item geeft de bestaande
 * partij terug (bestond=true). Printen gebeurt hier niet — de client vraagt
 * daarna een printjob aan met partijId.
 */
export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId, userId }: TenantAuthCtx) => {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 }); }
    const v = validatePartijAfronden(body);
    if (v.ok === false) return NextResponse.json({ error: v.error }, { status: 400 });

    const bron = await bepaalBron(supabase, orgId, userId, v.data);
    if (bron.ok === false) return NextResponse.json({ error: bron.error }, { status: bron.status });

    const r = await rondPartijAf(supabase, { orgId, userId }, naarAfrondenInput(v.data, bron.ctx));
    if (r.ok === false) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });

    return NextResponse.json({ ok: true, bestond: r.bestond, partij: r.partij, eenheden: r.eenheden }, { status: r.bestond ? 200 : 201 });
});
