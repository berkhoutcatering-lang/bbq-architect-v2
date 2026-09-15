/* /api/recipe/aliases — wat de kok bevestigt, onthoudt de app.
 *
 * Golf 4 van docs/leveranciersvoorkeur-plan.md. Een alias is één regel:
 * ingrediëntnaam → product (bron + id + productnaam). De matcher kijkt hier
 * eerst; een bekend ingrediënt is daarna direct goed, zonder AI.
 *
 * POST   { aliases: [{ naam, match: { source, ref_id, name, supplier } }] }
 *        Upsert op (organisatie, genormaliseerde naam). Alleen regels met een
 *        échte koppeling; een lege regel is geen alias.
 * DELETE { naam }  — vergeet een koppeling.
 * GET    → alle aliassen van de organisatie (voor de koppelronde).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { aliasSleutel } from '@/lib/recipeMatch';

export const runtime = 'nodejs';

const BRONNEN = new Set(['component', 'inventory', 'supplier', 'supplier_product']);

interface AliasIn {
    naam?: unknown;
    match?: { source?: unknown; ref_id?: unknown; name?: unknown; supplier?: unknown } | null;
}

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId, userId }: TenantAuthCtx) => {
    let body: { aliases?: unknown };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
    }
    const invoer: AliasIn[] = Array.isArray(body.aliases) ? body.aliases.slice(0, 200) : [];
    const rijen = invoer.flatMap((a) => {
        const naam = typeof a.naam === 'string' ? a.naam.trim().slice(0, 200) : '';
        const m = a.match;
        const source = typeof m?.source === 'string' ? m.source : '';
        const refId = Number(m?.ref_id);
        const productName = typeof m?.name === 'string' ? m.name.trim().slice(0, 300) : '';
        if (!naam || !BRONNEN.has(source) || !Number.isInteger(refId) || !productName) return [];
        const genormaliseerd = aliasSleutel(naam);
        if (!genormaliseerd) return [];
        return [{
            organization_id: orgId,
            alias: naam,
            alias_normalized: genormaliseerd,
            source,
            ref_id: refId,
            product_name: productName,
            supplier_name: typeof m?.supplier === 'string' ? m.supplier.slice(0, 120) : null,
            created_by: userId,
            updated_at: new Date().toISOString(),
        }];
    });
    /* Twee regels met dezelfde naam in één batch: de laatste wint. */
    const uniek = [...new Map(rijen.map((r) => [r.alias_normalized, r])).values()];
    if (uniek.length === 0) return NextResponse.json({ success: true, opgeslagen: 0 });

    const { error } = await supabase
        .from('ingredient_aliases')
        .upsert(uniek, { onConflict: 'organization_id,alias_normalized' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, opgeslagen: uniek.length });
});

export const DELETE = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    let body: { naam?: unknown };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
    }
    const genormaliseerd = aliasSleutel(typeof body.naam === 'string' ? body.naam : '');
    if (!genormaliseerd) return NextResponse.json({ error: 'Geen naam' }, { status: 400 });
    const { error } = await supabase
        .from('ingredient_aliases')
        .delete()
        .eq('organization_id', orgId)
        .eq('alias_normalized', genormaliseerd);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
});

export const GET = withTenantAuth(async (_req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    const { data, error } = await supabase
        .from('ingredient_aliases')
        .select('alias, alias_normalized, source, ref_id, product_name, supplier_name, updated_at')
        .eq('organization_id', orgId)
        .order('alias', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: data ?? [] });
});
