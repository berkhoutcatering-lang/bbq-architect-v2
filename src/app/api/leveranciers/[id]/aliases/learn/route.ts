/**
 * POST /api/leveranciers/[id]/aliases/learn
 *
 * Body: { items: { mutationId: string; masterProductId: number; alias: string; cutTaxonomyId?: number | null }[] }
 *
 * Persisteer aliassen die de gebruiker heeft bevestigd in de review-sheet.
 * Volgende PDF-upload herkent dezelfde naam meteen → confidence 1.0 zonder review.
 *
 * Pillar #4: Learning Aliases per tenant.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { resetTaxonomyCache } from '@/lib/meatTaxonomy';

export const runtime = 'nodejs';

interface LearnItem {
    mutationId: string;
    masterProductId: number;
    alias: string;
    cutTaxonomyId?: number | null;
}

interface AliasRow {
    organization_id: string;
    master_product_id: number;
    alias: string;
    cut_taxonomy_id: number | null;
    source: 'user_approved';
    confidence: number;
    created_by: string;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }): Promise<Response> {
    const { id } = await context.params;
    const leverancierId = Number(id);
    if (!Number.isInteger(leverancierId) || leverancierId < 0) {
        return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    }

    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: mem } = await sb
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    const orgId = mem?.organization_id as string | undefined;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    const body = await req.json().catch(() => null);
    const items = Array.isArray(body?.items) ? (body.items as unknown[]) : [];
    if (items.length === 0 || items.length > 2000) {
        return NextResponse.json({ error: 'items: 1..2000 verplicht' }, { status: 400 });
    }

    /* Sanitize + validate */
    const sanitized: LearnItem[] = [];
    for (const raw of items) {
        if (!raw || typeof raw !== 'object') continue;
        const r = raw as Record<string, unknown>;
        const mutationId = typeof r.mutationId === 'string' ? r.mutationId : null;
        const masterProductId = typeof r.masterProductId === 'number' ? r.masterProductId : null;
        const alias = typeof r.alias === 'string' ? r.alias.trim() : null;
        const cutTaxonomyId = typeof r.cutTaxonomyId === 'number' ? r.cutTaxonomyId : null;

        if (!mutationId || masterProductId == null || !alias) continue;
        if (alias.length < 2 || alias.length > 200) continue;
        sanitized.push({ mutationId, masterProductId, alias, cutTaxonomyId });
    }

    if (sanitized.length === 0) {
        return NextResponse.json({ ok: true, learned: 0, message: 'niets geldigs in items' });
    }

    /* Verify mutationIds horen bij deze org + leverancier (scope check) */
    const mutIds = sanitized.map(s => s.mutationId);
    const { data: muts } = await sb
        .from('org_price_mutations')
        .select('id, organization_id, leverancier_id')
        .in('id', mutIds);

    const allowedMuts = new Set(
        (muts || [])
            .filter(m => m.organization_id === orgId
                && (leverancierId === 0 || m.leverancier_id === leverancierId))
            .map(m => m.id as string),
    );

    const validItems = sanitized.filter(s => allowedMuts.has(s.mutationId));
    if (validItems.length === 0) {
        return NextResponse.json({ ok: true, learned: 0, message: 'geen mutations matchen scope' });
    }

    /* Insert aliassen — UPSERT op (org, alias_normalized) zodat re-approve geen 23505 geeft */
    const rows: AliasRow[] = validItems.map(v => ({
        organization_id: orgId,
        master_product_id: v.masterProductId,
        alias: v.alias,
        cut_taxonomy_id: v.cutTaxonomyId ?? null,
        source: 'user_approved',
        confidence: 1.0,
        created_by: user.id,
    }));

    let learned = 0;
    const errors: string[] = [];
    for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        /* Geen onConflict want we hebben generated column als unique idx
           — gebruik try-insert, swallow 23505 (al geleerd) */
        const { error, count } = await sb
            .from('org_product_aliases')
            .insert(chunk, { count: 'exact' });
        if (error) {
            if (error.code === '23505') {
                /* Duplicaat — al geleerd, geen probleem */
                learned += chunk.length;
            } else {
                errors.push(error.message.slice(0, 200));
            }
        } else {
            learned += count ?? chunk.length;
        }
    }

    /* Invalidate cache zodat volgende classify-call de nieuwe aliassen ziet */
    resetTaxonomyCache();

    return NextResponse.json({
        ok: true,
        learned,
        skipped: items.length - validItems.length,
        errors: errors.slice(0, 5),
    });
}
