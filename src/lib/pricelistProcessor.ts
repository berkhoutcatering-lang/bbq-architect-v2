/**
 * Gedeelde processor: AI-output → fuzzy match → cut-classify → write naar
 * org_price_mutations review queue.
 *
 * Wordt gebruikt door zowel realtime (1e PDF) als batch-poll (PDFs 2..25).
 * Geen duplicatie meer.
 */
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ParsedLine } from '@/lib/ai/pricelistPdfPrompt';
import { matchAgainstMasters, type MasterRow, type SupplierPriceSnapshot } from '@/lib/pricelistMatch';
import { classifyCutBatch } from '@/lib/meatTaxonomy';
import { markUploadStatus } from '@/lib/dal/pricelistUploads';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function admin(): SupabaseClient {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

export interface ProcessLinesArgs {
    organizationId: string;
    leverancierId: number | null;
    uploadId: string;
    lines: ParsedLine[];
    costCents: number;
    model: string;
}

export interface ProcessLinesResult {
    inserted: number;
    newCount: number;
    updatedCount: number;
}

export async function processLines(args: ProcessLinesArgs): Promise<ProcessLinesResult> {
    const sb = admin();

    /* 1. Master products voor fuzzy match */
    const { data: masters } = await sb
        .from('master_products')
        .select('id, naam, naam_normalized')
        .eq('organization_id', args.organizationId);

    /* 2. Huidige supplier_prices voor delta_pct snapshot */
    let prices: SupplierPriceSnapshot[] = [];
    if (args.leverancierId != null) {
        const { data: p } = await sb
            .from('supplier_prices')
            .select('id, master_product_id, product_naam, eenheid, prijs, actief')
            .eq('leverancier_id', args.leverancierId)
            .eq('actief', true);
        prices = (p || []) as SupplierPriceSnapshot[];
    }

    /* 3. Fuzzy match */
    const parsedForMatch = args.lines.map(l => ({
        naam: l.parsed_naam,
        eenheid: l.parsed_eenheid ?? undefined,
        prijs: l.parsed_prijs,
        categorie: l.parsed_categorie ?? undefined,
        confidence: l.confidence,
    }));
    const matches = matchAgainstMasters(
        parsedForMatch,
        (masters || []) as MasterRow[],
        prices,
    );

    /* 4. Cut-classify batch (1 DB-hit voor alle regels) */
    const cuts = await classifyCutBatch(
        args.lines.map(l => l.parsed_naam),
        args.organizationId,
    );

    /* 5. Build mutation rows */
    const rows = args.lines.map((l, i) => {
        const m = matches[i];
        const cut = cuts[i];
        const catLabel = cut.cutGroep
            ? `${cut.soort} · ${cut.cutGroep}`
            : (l.parsed_categorie ?? null);
        return {
            organization_id: args.organizationId,
            source: 'pdf_upload' as const,
            source_ref_id: args.uploadId,
            leverancier_id: args.leverancierId,
            leverancier: null,
            parsed_naam: l.parsed_naam,
            parsed_eenheid: l.parsed_eenheid ?? null,
            parsed_categorie: catLabel,
            parsed_prijs: l.parsed_prijs,
            confidence: l.confidence,
            master_product_id: m.masterId,
            match_confidence: m.matchConfidence,
            current_prijs: m.currentPrice,
            status: 'pending' as const,
            notes: cut.taxonomyId
                ? JSON.stringify({
                    cut_taxonomy_id: cut.taxonomyId,
                    soort: cut.soort,
                    cut_groep: cut.cutGroep,
                    bereiding: cut.bereiding,
                    color: cut.color,
                    matched_alias: cut.matchedAlias,
                    source: cut.source,
                    confidence: cut.matchConfidence,
                })
                : null,
        };
    });

    /* 6. Bulk insert (chunked) */
    let inserted = 0;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error, count } = await sb
            .from('org_price_mutations')
            .insert(chunk, { count: 'exact' });
        if (error) {
            console.warn(`[pricelistProcessor] insert chunk ${i} fail: ${error.message}`);
        } else {
            inserted += count ?? chunk.length;
        }
    }

    const newC = rows.filter(r => !r.master_product_id).length;
    const updC = rows.length - newC;

    /* 7. Update upload-row */
    await markUploadStatus(args.uploadId, {
        status: 'parsed',
        parse_finished_at: new Date().toISOString(),
        parsed_product_count: rows.length,
        new_count: newC,
        updated_count: updC,
        ai_cost_cents: args.costCents,
        ai_model: args.model,
    });

    return { inserted, newCount: newC, updatedCount: updC };
}
