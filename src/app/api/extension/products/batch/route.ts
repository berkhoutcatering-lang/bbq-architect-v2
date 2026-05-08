/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/extension/products/batch
 *
 * De extensie POST't batches van 50-100 producten per call. Server fuzzy-matched
 * elke regel tegen master_products + huidige supplier_prices, schiet rijen
 * in `org_price_mutations` met source='extension', en update sync-run counters.
 *
 * Body:
 *   {
 *     syncRunId: uuid,
 *     leverancierId: number,
 *     pageUrl?: string,
 *     pagesScanned?: number,                  // delta voor pages_scanned
 *     producten: [{ naam, prijs, eenheid?, categorie?, sku?, productUrl?, confidence? }]
 *   }
 *
 * Header: x-extension-key
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionKey } from '@/lib/extensionAuth';
import { createServiceSupabase } from '@/lib/supabase-server';
import {
    matchAgainstMasters,
    dbNormalize,
    type ParsedProduct,
    type MasterRow,
    type SupplierPriceSnapshot,
} from '@/lib/pricelistMatch';

export const runtime = 'nodejs';
export const maxDuration = 60;

function corsHeaders(): HeadersInit {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type, x-extension-key',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

const MAX_BATCH = 200;

export async function POST(req: NextRequest) {
    const t0 = Date.now();
    const ctx = await verifyExtensionKey(req.headers.get('x-extension-key'));
    if (!ctx) return NextResponse.json({ error: 'invalid key' }, { status: 401, headers: corsHeaders() });

    const body = await req.json().catch(() => null);
    const syncRunId: string = body?.syncRunId;
    const leverancierId = Number(body?.leverancierId);
    const pageUrl: string | undefined = typeof body?.pageUrl === 'string' ? body.pageUrl : undefined;
    const pagesScanned = Number.isFinite(Number(body?.pagesScanned)) ? Number(body.pagesScanned) : 0;
    const productenRaw: any[] = Array.isArray(body?.producten) ? body.producten : [];

    if (!syncRunId || !Number.isInteger(leverancierId) || productenRaw.length === 0) {
        return NextResponse.json({ error: 'syncRunId + leverancierId + producten verplicht' }, { status: 400, headers: corsHeaders() });
    }
    if (productenRaw.length > MAX_BATCH) {
        return NextResponse.json({ error: `max ${MAX_BATCH} producten per batch` }, { status: 413, headers: corsHeaders() });
    }

    const sb = createServiceSupabase();

    /* Verify sync run en leverancier scope */
    const { data: run } = await sb
        .from('leverancier_sync_runs')
        .select('id, leverancier_id, organization_id, status')
        .eq('id', syncRunId)
        .eq('organization_id', ctx.organizationId)
        .eq('leverancier_id', leverancierId)
        .maybeSingle();
    if (!run) return NextResponse.json({ error: 'sync run niet gevonden' }, { status: 404, headers: corsHeaders() });
    if (run.status !== 'running') {
        return NextResponse.json({ error: `sync run status=${run.status}, geen batches geaccepteerd` }, { status: 409, headers: corsHeaders() });
    }

    const { data: lev } = await sb
        .from('leveranciers')
        .select('id, naam')
        .eq('id', leverancierId)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
    if (!lev) return NextResponse.json({ error: 'leverancier niet gevonden' }, { status: 404, headers: corsHeaders() });

    /* Sanitize input */
    const cleanProducten: ParsedProduct[] = [];
    for (const p of productenRaw) {
        if (!p || typeof p.naam !== 'string') continue;
        const naam = p.naam.trim();
        if (naam.length < 2) continue;
        const prijs = Number(p.prijs);
        if (!Number.isFinite(prijs) || prijs <= 0 || prijs > 99999) continue;
        const conf = typeof p.confidence === 'number' ? Math.max(0, Math.min(1, p.confidence)) : 1.0;
        if (conf < 0.5) continue;
        cleanProducten.push({
            naam,
            prijs,
            eenheid: typeof p.eenheid === 'string' ? p.eenheid.trim().slice(0, 50) : undefined,
            categorie: typeof p.categorie === 'string' ? p.categorie.trim().slice(0, 80) : undefined,
            confidence: conf,
        });
    }

    if (cleanProducten.length === 0) {
        return NextResponse.json({ ok: true, productsSeen: 0, productsInserted: 0, message: 'geen geldige producten in batch' }, { headers: corsHeaders() });
    }

    /* Match tegen masters + huidige prijzen + bestaande pending mutations (dedup-bron) */
    const [{ data: masters }, { data: prices }, { data: existingPending }] = await Promise.all([
        sb.from('master_products').select('id, naam, naam_normalized').eq('organization_id', ctx.organizationId),
        sb.from('supplier_prices').select('id, master_product_id, product_naam, eenheid, prijs, actief').eq('organization_id', ctx.organizationId).eq('leverancier', lev.naam),
        sb.from('org_price_mutations').select('id, parsed_naam, parsed_eenheid, parsed_prijs').eq('organization_id', ctx.organizationId).eq('leverancier_id', leverancierId).eq('status', 'pending'),
    ]);

    const matches = matchAgainstMasters(
        cleanProducten,
        (masters || []) as MasterRow[],
        (prices || []) as SupplierPriceSnapshot[],
    );

    /* DEDUP-set: alle (naam|eenheid) die al als pending bestaan voor deze leverancier */
    const dedupKey = (naam: string, eenheid: string | null | undefined): string =>
        `${dbNormalize(naam)}|${dbNormalize(eenheid || 'stuks')}`;
    const existingKeys = new Set<string>(
        (existingPending || []).map((m: any) => dedupKey(m.parsed_naam, m.parsed_eenheid))
    );

    /* Build mutation rows + filter dubbelen (binnen + tussen scans) */
    const seenInBatch = new Set<string>();
    const mutationRows: any[] = [];
    let skippedDuplicates = 0;
    for (const m of matches) {
        const key = dedupKey(m.parsed.naam, m.parsed.eenheid);
        if (existingKeys.has(key) || seenInBatch.has(key)) {
            skippedDuplicates++;
            continue;
        }
        seenInBatch.add(key);
        mutationRows.push({
            organization_id: ctx.organizationId,
            source: 'extension' as const,
            source_ref_id: syncRunId,
            leverancier: lev.naam,
            leverancier_id: leverancierId,
            parsed_naam: m.parsed.naam,
            parsed_eenheid: m.parsed.eenheid || 'stuks',
            parsed_categorie: m.parsed.categorie || null,
            parsed_prijs: m.parsed.prijs,
            confidence: m.parsed.confidence ?? 1.0,
            master_product_id: m.masterId,
            match_confidence: m.matchConfidence,
            current_prijs: m.currentPrice,
            status: 'pending' as const,
        });
    }

    /* Insert in chunks (DB max 1000 per insert) */
    let inserted = 0;
    for (let i = 0; i < mutationRows.length; i += 500) {
        const chunk = mutationRows.slice(i, i + 500);
        const { error } = await sb.from('org_price_mutations').insert(chunk);
        if (error) {
            console.error('[extension/batch] insert faal:', error.message);
            return NextResponse.json({ error: error.message, partialInserted: inserted }, { status: 500, headers: corsHeaders() });
        }
        inserted += chunk.length;
    }

    /* Tel matched/unmatched voor sync-run-update */
    const newCount = matches.filter(m => m.currentPrice == null).length;
    const updateCount = matches.filter(m => m.currentPrice != null && Math.abs((m.parsed.prijs - (m.currentPrice || 0))) > 0.001).length;

    /* Update sync-run counters via read-then-write.
       Geen atomic RPC nodig — race tussen batches is OK (eventual consistency
       op counters is acceptabel; final cijfer in UI komt uit COUNT op finish). */
    {
        const { data: cur } = await sb
            .from('leverancier_sync_runs')
            .select('products_seen, products_new, products_updated, pages_scanned')
            .eq('id', syncRunId)
            .maybeSingle();
        if (cur) {
            await sb.from('leverancier_sync_runs').update({
                products_seen: (cur.products_seen || 0) + cleanProducten.length,
                products_new: (cur.products_new || 0) + newCount,
                products_updated: (cur.products_updated || 0) + updateCount,
                pages_scanned: (cur.pages_scanned || 0) + (pagesScanned || 1),
            }).eq('id', syncRunId);
        }
    }

    return NextResponse.json({
        ok: true,
        productsSeen: cleanProducten.length,
        productsInserted: inserted,
        skippedDuplicates,
        new: newCount,
        updated: updateCount,
        pageUrl,
        elapsedMs: Date.now() - t0,
    }, { headers: corsHeaders() });
}
