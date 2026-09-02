/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/bonnen/extract — Bon-scanner v2
 * ────────────────────────────────────────
 * UNIFIED extract endpoint. Eén route, zes source_types:
 *   photo        — foto van bon (single image)
 *   pdf          — multi-page PDF (text-first → vision fallback)
 *   screenshot   — desktop screenshot
 *   clipboard    — Cmd+V paste (image)
 *   camera       — mobile camera capture
 *   ubl_xml      — UBL/Peppol e-factuur (XML, deterministisch, gratis)
 *   photo_multi  — N foto's van ÉÉN bon (lange kassabon)
 *
 * Bon-scanner v2 changes:
 *   - Auto-escalatie ladder Haiku → Sonnet → Opus bij lage confidence / mismatch
 *   - Reconciliation-laag: Σ items vs totaal_bedrag, vlag mismatches
 *   - Supplier-hints (Sligro/Hanos/Makro/...) in prompt voor pass-2+
 *   - Multi-image support voor lange kassabonnen (1 dedup-hash voor de bundel)
 *   - Per-pass cost-attribution + ai_passes metadata in response
 *
 * Hard rules:
 *   1. BTW NOOIT AI-derived — parseBonBtw + validateBtwPct server-side
 *   2. SHA-256 dedup VÓÓR AI-call. Hit → 409 met existing bon_id.
 *   3. UBL = gratis (geen ai_usage row).
 *   4. cap-check via checkAiCap(orgId, ...) blokkeert Opus pass-3 bij hard-cap.
 *   5. logAiUsageServer per pass (transparante kosten).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';
import { checkAiCap } from '@/lib/aiCostCap';
import { matchInventory } from '@/lib/inventoryDeduction';
import { matchLeverancier, findLeverancierCandidates } from '@/lib/bonProcessing';
import { isUsableText } from '@/lib/pdfTextExtract';
import { extractPdfPageLines, formatPageLinesForPrompt } from '@/lib/server/pdfTextLayer';
import { findSupplierHintInText } from '@/lib/bonSupplierHints';
import { parseUbl, isLikelyUbl } from '@/lib/ublIngress';
import {
    runBonExtractionLadder,
    summarizeFinalPass,
    type ExtractionMode,
    type ModelKey,
    type PassResult,
} from '@/lib/bonExtractionPasses';
import type { BonItemRow } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 90; // Multi-pass ladder kan langer duren dan single-pass

type SourceType = 'photo' | 'pdf' | 'screenshot' | 'clipboard' | 'ubl_xml' | 'camera' | 'email' | 'photo_multi';

interface ExtractRequest {
    source_type: SourceType;
    file_data_url?: string;
    file_data_urls?: string[];        // photo_multi pad
    filename?: string;
    datum_hint?: string;
    pdf_text?: string;
    client_hash?: string;
    /** UI kan handmatige escalatie forceren ("Probeer met krachtigere AI"). */
    force_model?: ModelKey;
}

interface ItemWithSuggestion extends BonItemRow {
    inventory_id: number | null;
    inventory_naam: string | null;
    match_confidence: 'high' | 'medium' | 'low' | 'none';
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
    const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
    if (!m) return null;
    return { mediaType: m[1].toLowerCase(), base64: m[2] };
}

function sha256(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex');
}

/* ── Route handler ──────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'Geen API key' }, { status: 500 });
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    }

    const { data: memberships } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1);
    const orgId = memberships?.[0]?.organization_id;
    if (!orgId) {
        return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });
    }

    let body: ExtractRequest;
    try {
        body = (await req.json()) as ExtractRequest;
    } catch {
        return NextResponse.json({ error: 'Ongeldige JSON body' }, { status: 400 });
    }

    if (!body.source_type) {
        return NextResponse.json({ error: 'source_type is verplicht' }, { status: 400 });
    }

    /* ────────────────────────────────────────────────────────────────
       PATH 1: photo_multi — N foto's van één bon.
       ──────────────────────────────────────────────────────────────── */
    if (body.source_type === 'photo_multi') {
        return handlePhotoMulti({ supabase, orgId, userId: user.id, body, apiKey });
    }

    /* Vanaf hier: single-file paden. file_data_url is verplicht. */
    if (!body.file_data_url) {
        return NextResponse.json(
            { error: 'file_data_url is verplicht' },
            { status: 400 },
        );
    }
    if (body.file_data_url.length > 14_000_000) {
        return NextResponse.json({ error: 'Bestand te groot (>10 MB)' }, { status: 413 });
    }

    const parsed = parseDataUrl(body.file_data_url);
    if (!parsed) {
        return NextResponse.json(
            { error: 'file_data_url moet beginnen met data:<mime>;base64,' },
            { status: 400 },
        );
    }

    /* ── SHA-256 dedup VÓÓR AI-call ───────────────────────────── */
    const rawBytes = Buffer.from(parsed.base64, 'base64');
    const imageHash = sha256(rawBytes);

    const { data: dup } = await supabase
        .from('bonnen')
        .select('id, processing_status, datum, winkel, totaal_bedrag')
        .eq('organization_id', orgId)
        .eq('image_hash', imageHash)
        .limit(1)
        .maybeSingle();

    if (dup) {
        return NextResponse.json(
            {
                error: 'duplicate',
                message: 'Deze bon staat al in je archief.',
                duplicate_bon_id: dup.id,
                duplicate_winkel: dup.winkel,
                duplicate_datum: dup.datum,
                duplicate_totaal: dup.totaal_bedrag,
                processing_status: 'duplicate',
            },
            { status: 409 },
        );
    }

    /* ── Inventory + leveranciers preload (gebruikt door alle paths) ─ */
    const [invRes, levRes] = await Promise.all([
        supabase.from('inventory').select('id, naam').eq('organization_id', orgId),
        supabase.from('leveranciers').select('id, naam, type').eq('organization_id', orgId),
    ]);
    const inventory = (invRes.data ?? []).map((i: any) => ({ id: i.id, naam: i.naam }));
    const leveranciers = (levRes.data ?? []).map((l: any) => ({
        id: l.id,
        naam: l.naam,
        type: l.type,
    }));

    /* ────────────────────────────────────────────────────────────────
       PATH 2: UBL XML — pure parse, no AI, no cost.
       ──────────────────────────────────────────────────────────────── */
    if (
        body.source_type === 'ubl_xml' ||
        isLikelyUbl({ mime: parsed.mediaType, filename: body.filename })
    ) {
        const xmlText = rawBytes.toString('utf-8');
        const ubl = parseUbl(xmlText, {
            leveranciers,
            inventory,
            datum_hint: body.datum_hint,
        });
        if (!ubl.is_ubl) {
            return NextResponse.json(
                {
                    error: 'invalid_ubl',
                    message: 'Bestand lijkt geen valide UBL-factuur. Probeer als PDF te uploaden.',
                    detail: ubl.error,
                },
                { status: 422 },
            );
        }

        return NextResponse.json({
            ok: true,
            source_type: 'ubl_xml',
            bon_preview: {
                leverancier_naam: ubl.leverancier_naam,
                leverancier_id: ubl.matched_leverancier?.id ?? null,
                datum: ubl.datum,
                totaal_bedrag: ubl.totaal_bedrag,
                netto_bedrag: ubl.netto_bedrag,
                btw_laag_bedrag: ubl.btw_laag_bedrag,
                btw_hoog_bedrag: ubl.btw_hoog_bedrag,
                invoice_id: ubl.invoice_id,
            },
            items_with_suggestions: ubl.items,
            confidence_per_field: { leverancier: 1, datum: ubl.datum ? 1 : 0, totaal_bedrag: 1, btw: 1 },
            processing_status: ubl.suggested_status,
            image_hash: imageHash,
            ocr_engine: 'ubl-parse',
            mime_type: parsed.mediaType,
            pages: null,
            ai_cost_eur_cents: 0,
            ai_classify_status: 'auto_accepted',
            confidence: 1,
            reconciliation: { status: 'ok', explanation: 'UBL-XML — deterministisch geparsed.' },
            ai_passes: [],
        });
    }

    /* ── Bouw extraction mode ──────────────────────────────────────── */
    const isPdf = body.source_type === 'pdf' || parsed.mediaType === 'application/pdf';
    let mode: ExtractionMode;
    let pdfBase64ForFallback: string | undefined;
    /* Ruwe bon-tekst, als we die hebben. Voedt twee dingen: de goedkope
       tekst-route én het herkennen van de leverancier vóór de eerste poging. */
    let bonText = '';

    if (isPdf) {
        if (body.pdf_text && isUsableText(body.pdf_text)) {
            bonText = body.pdf_text;
        } else {
            /* De browser probeert de tekstlaag ook te lezen, maar faalt daar
               stil (pdfjs-worker via CDN, catch → ''). Daardoor ging ELKE
               factuur via de dure vision-route terwijl de tekst er gewoon in
               zat: ~€0.05 per bon in plaats van ~€0.001, en een model dat een
               plaatje moet ontcijferen in plaats van kolommen te lezen.
               Server-side is er geen worker en geen netwerk nodig. */
            const pages = await extractPdfPageLines(rawBytes);
            if (pages) {
                /* Mét regelstructuur: een factuur is een tabel, en een
                   woordenbrij maakt kolommen onleesbaar. */
                const text = formatPageLinesForPrompt(pages);
                if (isUsableText(text)) bonText = text;
            }
        }

        if (bonText) {
            /* Pass-1: Haiku op tekst (€0.001). Bij escalatie → Sonnet/Opus document met de PDF base64. */
            mode = { kind: 'pdf_text', text: bonText };
            pdfBase64ForFallback = parsed.base64;
        } else {
            /* Echte scan zonder tekstlaag: meteen Sonnet document. */
            mode = { kind: 'pdf_document', base64: parsed.base64 };
        }
    } else {
        const allowedImageMimes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
        if (!allowedImageMimes.has(parsed.mediaType)) {
            return NextResponse.json(
                {
                    error: 'unsupported_mime',
                    message: `Format ${parsed.mediaType} niet ondersteund. Probeer JPEG, PNG, PDF of UBL-XML.`,
                },
                { status: 415 },
            );
        }
        mode = { kind: 'image', mediaType: parsed.mediaType, base64: parsed.base64 };
    }

    /* ── AI paths: cap-check ─────────────────────────────────────── */
    /* Schatting volgt de gekozen route: de tekst-route is ~50× goedkoper dan
       vision, en dat scheelt of iemand tegen z'n maandplafond aan loopt. */
    const estimatedCost = mode.kind === 'pdf_text' ? 0.005 : isPdf ? 0.05 : 0.03;
    const cap = await checkAiCap(orgId, estimatedCost);
    if (cap.status === 'hard_block') {
        return NextResponse.json(
            {
                error: 'ai_cap_exceeded',
                message: cap.message,
                used_eur: cap.used_eur,
                hard_eur: cap.hard_eur,
                tier: cap.tier,
            },
            { status: 429 },
        );
    }

    const client = new Anthropic({ apiKey });

    /* ── Layout-hint vóór de EERSTE poging ─────────────────────────
       Staat de leverancier herkenbaar in de bon-tekst (of anders in de
       bestandsnaam), dan gaat z'n layout-uitleg meteen mee. Hiervoor kwam die
       hint pas bij poging 2 — en poging 2 komt alleen als poging 1 twijfelt,
       wat bij deze facturen zelden gebeurt. */
    const initialHint = findSupplierHintInText(bonText || body.filename);

    /* ── Run ladder ────────────────────────────────────────────────── */
    const ladder = await runBonExtractionLadder({
        client,
        mode,
        cap_status: cap.status as 'ok' | 'soft_warn' | 'hard_block',
        organization_id: orgId,
        user_id: user.id,
        force_model: body.force_model,
        pdf_base64_for_vision_fallback: pdfBase64ForFallback,
        initial_supplier_hint: initialHint?.hint ?? null,
    });

    return buildLadderResponse({
        ladder_final: ladder.final,
        ladder_passes: ladder.passes,
        ladder_total_cost_cents: ladder.total_cost_eur_cents,
        source_type: body.source_type,
        mime_type: parsed.mediaType,
        image_hash: imageHash,
        inventory,
        leveranciers,
        datum_hint: body.datum_hint,
        pages: null,
    });
}

/* ── photo_multi pad ──────────────────────────────────────────────────
   N foto's van één lange kassabon. Geen Haiku — direct Sonnet 4.6 multi-image.
   Dedup-hash = SHA-256 van concat(image-bytes) zodat identieke bundel-uploads
   dezelfde dedup-key krijgen. */
async function handlePhotoMulti(args: {
    supabase: Awaited<ReturnType<typeof createServerSupabase>>;
    orgId: string;
    userId: string;
    body: ExtractRequest;
    apiKey: string;
}) {
    const { supabase, orgId, userId, body, apiKey } = args;
    if (!body.file_data_urls || body.file_data_urls.length < 2) {
        return NextResponse.json(
            { error: 'photo_multi vereist file_data_urls met minimaal 2 foto\'s' },
            { status: 400 },
        );
    }
    if (body.file_data_urls.length > 8) {
        return NextResponse.json(
            { error: 'photo_multi maximaal 8 foto\'s tegelijk (jouw bundel: ' + body.file_data_urls.length + ')' },
            { status: 400 },
        );
    }

    const parsedImages: Array<{ mediaType: string; base64: string; bytes: Buffer }> = [];
    for (const url of body.file_data_urls) {
        const p = parseDataUrl(url);
        if (!p) {
            return NextResponse.json({ error: 'foto data-URL ongeldig (verwacht data:image/...;base64,...)' }, { status: 400 });
        }
        if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'].includes(p.mediaType)) {
            return NextResponse.json({ error: `foto-format ${p.mediaType} niet ondersteund in photo_multi` }, { status: 415 });
        }
        parsedImages.push({ mediaType: p.mediaType, base64: p.base64, bytes: Buffer.from(p.base64, 'base64') });
    }

    /* Dedup-hash op concat-bytes. */
    const combinedHash = createHash('sha256');
    for (const img of parsedImages) combinedHash.update(img.bytes);
    const imageHash = combinedHash.digest('hex');

    const { data: dup } = await supabase
        .from('bonnen')
        .select('id, processing_status, datum, winkel, totaal_bedrag')
        .eq('organization_id', orgId)
        .eq('image_hash', imageHash)
        .limit(1)
        .maybeSingle();

    if (dup) {
        return NextResponse.json({
            error: 'duplicate',
            message: 'Deze bonnen-bundel staat al in je archief.',
            duplicate_bon_id: dup.id,
            duplicate_winkel: dup.winkel,
            duplicate_datum: dup.datum,
            duplicate_totaal: dup.totaal_bedrag,
            processing_status: 'duplicate',
        }, { status: 409 });
    }

    /* Cap-check — multi-image is duurder (~€0.04-0.10 per bundel). */
    const estimatedCost = 0.08;
    const cap = await checkAiCap(orgId, estimatedCost);
    if (cap.status === 'hard_block') {
        return NextResponse.json({
            error: 'ai_cap_exceeded',
            message: cap.message,
            used_eur: cap.used_eur,
            hard_eur: cap.hard_eur,
            tier: cap.tier,
        }, { status: 429 });
    }

    const [invRes, levRes] = await Promise.all([
        supabase.from('inventory').select('id, naam').eq('organization_id', orgId),
        supabase.from('leveranciers').select('id, naam, type').eq('organization_id', orgId),
    ]);
    const inventory = (invRes.data ?? []).map((i: any) => ({ id: i.id, naam: i.naam }));
    const leveranciers = (levRes.data ?? []).map((l: any) => ({ id: l.id, naam: l.naam, type: l.type }));

    const client = new Anthropic({ apiKey });
    const mode: ExtractionMode = {
        kind: 'multi_image',
        images: parsedImages.map(p => ({ mediaType: p.mediaType, base64: p.base64 })),
    };

    const ladder = await runBonExtractionLadder({
        client,
        mode,
        cap_status: cap.status as 'ok' | 'soft_warn' | 'hard_block',
        organization_id: orgId,
        user_id: userId,
        force_model: body.force_model,
    });

    return buildLadderResponse({
        ladder_final: ladder.final,
        ladder_passes: ladder.passes,
        ladder_total_cost_cents: ladder.total_cost_eur_cents,
        source_type: 'photo_multi',
        mime_type: parsedImages[0].mediaType,
        image_hash: imageHash,
        inventory,
        leveranciers,
        datum_hint: body.datum_hint,
        pages: parsedImages.length,
    });
}

/* ── Response-builder ─────────────────────────────────────────────────
   Gemeenschappelijk voor alle AI-paden. Bouwt items_with_suggestions,
   leverancier-state, confidence-per-field en de ai_passes audit-trail. */
interface BuildArgs {
    ladder_final: PassResult;
    ladder_passes: PassResult[];
    ladder_total_cost_cents: number;
    source_type: SourceType;
    mime_type: string;
    image_hash: string;
    inventory: Array<{ id: number; naam: string }>;
    leveranciers: Array<{ id: number; naam: string; type?: string | null }>;
    datum_hint?: string;
    pages: number | null;
}

function buildLadderResponse(args: BuildArgs): NextResponse {
    const f = args.ladder_final;

    if (f.error && f.items.length === 0) {
        return NextResponse.json({
            error: 'extract_failed',
            message: f.error.startsWith('extract_failed_json')
                ? 'AI kon de bon niet uitlezen. Probeer een scherpere foto.'
                : f.error,
            raw: f.raw_text.slice(0, 300),
            ai_passes: args.ladder_passes.map(summarizePass),
        }, { status: 422 });
    }

    /* Items met inventory-suggesties verrijken. */
    const items_with_suggestions: ItemWithSuggestion[] = f.items.map(it => {
        const matchedInv = matchInventory(it.naam, args.inventory);
        let confidence: ItemWithSuggestion['match_confidence'] = 'none';
        if (matchedInv) {
            const t = it.naam.toLowerCase().trim();
            const m = matchedInv.naam.toLowerCase().trim();
            if (t === m) confidence = 'high';
            else if (t.includes(m) || m.includes(t)) confidence = 'medium';
            else confidence = 'low';
        }
        return {
            ...it,
            inventory_id: matchedInv ? Number(matchedInv.id) : null,
            inventory_naam: matchedInv ? matchedInv.naam : null,
            match_confidence: confidence,
        };
    });

    /* Leverancier fuzzy-match. */
    const leverancier_naam = f.leverancier;
    const candidates = leverancier_naam
        ? findLeverancierCandidates(leverancier_naam, args.leveranciers, 3)
        : [];
    const autoMatchedLev = candidates.length > 0 && candidates[0].score >= 80 ? candidates[0] : null;
    const matchedLev = autoMatchedLev ?? (leverancier_naam ? matchLeverancier(leverancier_naam, args.leveranciers) : null);

    /* BTW + totaal uit final pass. */
    const totals = summarizeFinalPass(f);

    /* Datum: hint > AI > null. */
    const datum = args.datum_hint || f.datum;

    /* OCR-engine alias voor backwards-compat met /archief tab-rendering. */
    const ocr_engine = mapEngineToLegacy(f.engine);

    return NextResponse.json({
        ok: true,
        source_type: args.source_type,
        bon_preview: {
            leverancier_naam,
            leverancier_id: matchedLev?.id ?? null,
            datum,
            totaal_bedrag: totals.totaal_bedrag,
            netto_bedrag: totals.netto_bedrag,
            btw_laag_bedrag: totals.btw_laag_bedrag,
            btw_hoog_bedrag: totals.btw_hoog_bedrag,
        },
        items_with_suggestions,
        leverancier_state: !leverancier_naam
            ? 'no_leverancier'
            : autoMatchedLev
              ? 'auto_matched'
              : candidates.length > 0
                ? 'needs_approval'
                : 'new_suggested',
        leverancier_candidates: candidates.map(c => ({ id: c.id, naam: c.naam, score: c.score })),
        confidence_per_field: {
            leverancier: matchedLev ? f.confidence : f.confidence * 0.6,
            datum: datum ? f.confidence : 0,
            totaal_bedrag: f.confidence,
            btw: 0.9,
        },
        processing_status: 'extracted',
        image_hash: args.image_hash,
        ocr_engine,
        mime_type: args.mime_type,
        pages: args.pages,
        confidence: Math.round(f.confidence * 100) / 100,
        ai_cost_eur_cents: args.ladder_total_cost_cents,
        /* v2-fields: */
        reconciliation: {
            status: f.reconciliation.status,
            mismatch_eur: f.reconciliation.mismatch_eur,
            sum_items_eur: f.reconciliation.sum_items_eur,
            claimed_total_eur: f.reconciliation.claimed_total_eur,
            explanation: f.reconciliation.explanation,
            negative_items_count: f.reconciliation.negative_items_count,
        },
        ai_passes: args.ladder_passes.map(summarizePass),
        /* Of de UI nog 1 escalatie mag aanbieden (Opus retry-knop). */
        can_escalate: canEscalateFurther(args.ladder_passes),
    });
}

function summarizePass(p: PassResult) {
    return {
        model: p.model,
        engine: p.engine,
        confidence: Math.round(p.confidence * 100) / 100,
        items_count: p.items.length,
        reconciliation_status: p.reconciliation.status,
        mismatch_eur: p.reconciliation.mismatch_eur,
        cost_eur_cents: p.cost_eur_cents,
        duration_ms: p.duration_ms,
        error: p.error,
    };
}

/** Heeft de ladder al Opus-pass-3 gedraaid? Zo nee, mag UI hem nog forceren. */
function canEscalateFurther(passes: PassResult[]): boolean {
    return !passes.some(p => p.model === 'claude-opus-4-7');
}

/** Map nieuwe engine-namen naar legacy aliases voor /archief UI. */
function mapEngineToLegacy(engine: PassResult['engine']): string {
    switch (engine) {
        case 'haiku-vision': return 'haiku-vision';
        case 'haiku-text': return 'haiku-text';
        case 'sonnet-vision': return 'sonnet-vision';
        case 'sonnet-document': return 'sonnet-files';
        case 'sonnet-multi': return 'sonnet-multi';
        case 'opus-vision': return 'opus-vision';
        case 'opus-document': return 'opus-document';
        case 'opus-multi': return 'opus-multi';
    }
}
