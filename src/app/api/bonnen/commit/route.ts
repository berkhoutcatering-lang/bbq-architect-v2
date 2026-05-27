/**
 * POST /api/bonnen/commit
 *
 * Persistente save-laag tussen /api/bonnen/extract (AI-only, geen DB-writes)
 * en /archief (alleen reads).
 *
 * Voorheen ontbrak deze: "Bevestig in archief" was een dead <Link href="/archief">
 * waardoor scan-data alleen in client-state leefde en bij navigatie verloren ging.
 * Nu: ontvangt de ExtractResult uit /bonnen page, INSERT't in `bonnen`, returnt
 * de nieuwe id zodat de UI kan redirect naar /archief?bon=<id>.
 *
 * Veiligheid:
 *   - Re-auth in body (geen middleware-trust)
 *   - organization_id via session, nooit uit client-input
 *   - image_hash dedup zodat dezelfde bon niet 2× ge-committed kan
 *   - Zod-validated input
 *   - Tracks audit-trail via bestaande trg_audit_bonnen trigger
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 15;

const ItemSchema = z.object({
    naam: z.string().min(1).max(200),
    aantal: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
    prijs: z.number().nullable().optional(),
    btw_pct: z.number().nullable().optional(),
    totaal: z.number().nullable().optional(),
    inventory_id: z.number().nullable().optional(),
    inventory_naam: z.string().nullable().optional(),
    match_confidence: z.enum(['high', 'medium', 'low', 'none']).optional(),
});

const BodySchema = z.object({
    bon_preview: z.object({
        leverancier_naam: z.string().nullable(),
        leverancier_id: z.number().nullable(),
        datum: z.string().nullable(),
        totaal_bedrag: z.number(),
        netto_bedrag: z.number(),
        btw_laag_bedrag: z.number(),
        btw_hoog_bedrag: z.number(),
    }),
    items: z.array(ItemSchema).max(200),
    image_hash: z.string().max(64),
    mime_type: z.string().max(60),
    source_type: z.string().max(20),
    ocr_engine: z.string().max(40).optional(),
    confidence: z.number().min(0).max(1).optional(),
    ai_cost_eur_cents: z.number().nullable().optional(),
});

export async function POST(req: NextRequest) {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    }

    // Org resolve via session, never client.
    const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .single();
    const orgId = member?.organization_id;
    if (!orgId) {
        return NextResponse.json({ error: 'Geen actieve organisatie' }, { status: 403 });
    }

    let body: z.infer<typeof BodySchema>;
    try {
        const raw = await req.json();
        body = BodySchema.parse(raw);
    } catch (e) {
        return NextResponse.json(
            { error: 'Ongeldige body', detail: e instanceof Error ? e.message : 'parse error' },
            { status: 400 },
        );
    }

    // Server-side dedup op image_hash
    if (body.image_hash) {
        const { data: dup } = await supabase
            .from('bonnen')
            .select('id, winkel, datum, totaal_bedrag')
            .eq('organization_id', orgId)
            .eq('image_hash', body.image_hash)
            .limit(1)
            .maybeSingle();
        if (dup) {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'duplicate',
                    message: 'Deze bon staat al in je archief.',
                    bon_id: dup.id,
                    duplicate: dup,
                },
                { status: 409 },
            );
        }
    }

    // Build extracted_text uit items + leverancier + datum.
    // Voedt search_vec (Dutch tsvector) + pg_trgm voor "baktotaal"-search.
    const itemsText = body.items
        .map((i) => [i.naam, i.unit, i.prijs?.toString() ?? ''].filter(Boolean).join(' '))
        .join(' ');
    const datumNl = body.bon_preview.datum
        ? safeNlDate(body.bon_preview.datum)
        : '';
    const extractedText = [
        itemsText,
        body.bon_preview.leverancier_naam ?? '',
        body.bon_preview.datum ?? '',
        datumNl,
    ].filter(Boolean).join(' ').trim();

    // Welke source-flag op basis van source_type.
    const source: 'upload' | 'email' | 'scan' | 'api' = 'upload';

    // Determine PDF/image type voor file_mime
    const fileMime = body.mime_type || null;

    const payload = {
        organization_id: orgId,
        winkel: body.bon_preview.leverancier_naam,
        datum: body.bon_preview.datum,
        totaal_bedrag: body.bon_preview.totaal_bedrag,
        netto_bedrag: body.bon_preview.netto_bedrag,
        btw_laag_bedrag: body.bon_preview.btw_laag_bedrag,
        btw_hoog_bedrag: body.bon_preview.btw_hoog_bedrag,
        leverancier_id: body.bon_preview.leverancier_id,
        bon_items: body.items,
        raw_analysis: body.items,  // backwards-compat (search_vec backfill leest dit pad)
        extracted_text: extractedText,
        image_hash: body.image_hash,
        file_mime: fileMime,
        source,
        status: 'pending',
        // image_url + file_path blijven null in v1 — background-job kan later
        // de originele scan-file uit AI-extract-cache halen en naar Storage uploaden.
    };

    const { data: inserted, error } = await supabase
        .from('bonnen')
        .insert(payload)
        .select('id')
        .single();

    if (error) {
        console.error('[bonnen/commit] insert failed:', error);
        return NextResponse.json(
            {
                ok: false,
                error: 'insert_failed',
                detail: error.message,
                code: error.code,
            },
            { status: 500 },
        );
    }

    return NextResponse.json({
        ok: true,
        bon_id: inserted.id,
        redirect: `/archief?bon=${inserted.id}`,
    });
}

function safeNlDate(d: string): string {
    try {
        return new Date(d).toLocaleDateString('nl-NL', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
    } catch {
        return '';
    }
}
