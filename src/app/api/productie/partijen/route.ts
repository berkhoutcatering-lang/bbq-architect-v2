import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lijst van partijen, nieuwste eerst, met het aantal eenheden op voorraad en geprint. */
export const GET = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    const url = new URL(req.url);
    const limiet = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50));
    const { data, error } = await supabase
        .from('productie_partijen')
        .select('id, partijnummer, component_id, event_id, geproduceerde_hoeveelheid, eenheid, verpakking_grootte, verpakking_eenheid, aantal_eenheden, productiedatum, tht, bewaarmethode, status, created_at, components(name), voorraad_eenheden(status, label_geprint_at)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limiet);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const partijen = ((data ?? []) as Array<Record<string, unknown>>).map((p) => {
        const eenheden = (p.voorraad_eenheden ?? []) as Array<{ status: string; label_geprint_at: string | null }>;
        const comp = p.components as { name: string } | { name: string }[] | null;
        const naam = Array.isArray(comp) ? comp[0]?.name : comp?.name;
        const rest = { ...p };
        delete rest.voorraad_eenheden;
        delete rest.components;
        return {
            ...rest,
            component_naam: naam ?? null,
            op_voorraad: eenheden.filter((e) => e.status === 'op_voorraad').length,
            labels_geprint: eenheden.filter((e) => e.label_geprint_at != null).length,
        };
    });
    return NextResponse.json({ partijen });
});
