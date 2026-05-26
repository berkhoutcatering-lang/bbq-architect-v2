/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/bonnen/extract — Bucket E P0-2
 * ────────────────────────────────────────
 * UNIFIED extract endpoint die de 3 oude flows vervangt:
 *   - /api/chat (image-uploads vanaf /inkoop)
 *   - /api/boekhouder/bon-extract (boekhouder-flow)
 *   - /api/bonnen/quick-upload (ScanFab field-mode)
 *
 * Eén route, vijf source_types:
 *   photo        — foto van bon (single image)        → Haiku vision
 *   pdf          — multi-page PDF                       → text-first / Files API
 *   screenshot   — desktop screenshot                   → Haiku vision
 *   clipboard    — Cmd+V paste (image)                  → Haiku vision
 *   ubl_xml      — UBL/Peppol e-factuur (XML)           → deterministisch parser
 *
 * Hard rules:
 *   1. BTW NOOIT AI-derived — validateBtwPct snapt naar 0/9/21.
 *   2. SHA-256 dedup VÓÓR AI-call. Hit → 409 met existing bon_id.
 *   3. UBL = gratis (geen ai_usage row).
 *   4. cap-check via checkAiCap(orgId, 0.05 PDF | 0.03 image).
 *   5. logAiUsageServer per call (ook bij Haiku-text-only).
 *
 * Body: {
 *   source_type: 'photo' | 'pdf' | 'screenshot' | 'clipboard' | 'ubl_xml',
 *   file_data_url: string,            // data:<mime>;base64,<payload>
 *   filename?: string,
 *   datum_hint?: string,              // YYYY-MM-DD
 *   pdf_text?: string,                // optioneel: client extracted PDF-text
 * }
 *
 * Response: {
 *   bon_preview: {...},
 *   items_with_suggestions: [...],
 *   source_type: '...',
 *   confidence_per_field: {...},
 *   processing_status: 'extracted'|'committed'|'duplicate',
 *   duplicate_bon_id?: string,
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';
import { checkAiCap } from '@/lib/aiCostCap';
import { matchInventory } from '@/lib/inventoryDeduction';
import { matchLeverancier, normalizeBonItem, parseBonBtw } from '@/lib/bonProcessing';
import { isUsableText } from '@/lib/pdfTextExtract';
import { parseUbl, isLikelyUbl } from '@/lib/ublIngress';
import type { BonItemRow } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60; // multi-page PDF kan iets langer duren dan single image

type SourceType = 'photo' | 'pdf' | 'screenshot' | 'clipboard' | 'ubl_xml' | 'camera' | 'email';

interface ExtractRequest {
    source_type: SourceType;
    file_data_url: string;
    filename?: string;
    datum_hint?: string;
    pdf_text?: string;
    /** Optioneel: client-computed SHA-256 (defense-in-depth — server hashes ook). */
    client_hash?: string;
}

interface BonPreview {
    leverancier_naam: string | null;
    leverancier_id: number | null;
    datum: string | null;
    totaal_bedrag: number;
    netto_bedrag: number;
    btw_laag_bedrag: number;
    btw_hoog_bedrag: number;
    invoice_id?: string | null;
}

interface ItemWithSuggestion extends BonItemRow {
    inventory_id: number | null;
    inventory_naam: string | null;
    match_confidence: 'high' | 'medium' | 'low' | 'none';
}

/* System prompts — strict JSON-output, BTW per regel. */
const VISION_PROMPT = `Je bent een NL-boekhouding-extractie-assistent voor een BBQ-catering.
Lees de bijgevoegde foto/screenshot/PDF van een aankoop-bon of factuur en extract de
gegevens in strict JSON (geen markdown, geen prose).

OUTPUT FORMAT:
{
  "leverancier": "Sligro" | null,
  "datum": "YYYY-MM-DD" | null,
  "totaal_bedrag": 234.50,
  "items": [
    {
      "naam": "Pulled pork rauw",
      "aantal": 5.0,
      "eenheid": "kg" | "stuks" | "L" | "ml" | "g",
      "prijs_per_eenheid": 14.95,
      "totaal": 74.75,
      "btw_pct": 9 | 21 | 0
    }
  ],
  "confidence": 0.95
}

REGELS:
- Geen velden verzinnen. Niet leesbaar = null.
- BTW per regel — kijk naar BTW-kolom op de bon, NIET zelf berekenen.
- Items: alleen tastbare producten/diensten, geen subtotaal- of korting-regels.
- Datum: YYYY-MM-DD; als alleen "16-04-2026" zichtbaar → "2026-04-16".
- Bij onleesbaar of geen bon: { "error": "korte reden" }.

GEEN andere tekst, geen markdown.`;

const PDF_TEXT_PROMPT = `Je krijgt de ge-OCR'de tekst van een aankoop-bon/factuur (PDF).
Extract dezelfde JSON-structuur als bij vision-input. De tekst kan kolom-volgorde
verloren hebben — gebruik prijs-patronen ("€ 14,95") en eenheden ("kg", "st") om
items te reconstrueren.

${VISION_PROMPT}`;

/* ── Helpers ────────────────────────────────────────────────────── */

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
    const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
    if (!m) return null;
    return { mediaType: m[1].toLowerCase(), base64: m[2] };
}

function sha256(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex');
}

function parseAiJson(raw: string): any {
    /* Models kunnen ondanks "geen markdown" toch ```json wrappers terugsturen. */
    const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        /* Probeer het eerste {...}-blok te vissen (soms staat er een prefix). */
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch {
                /* fall through */
            }
        }
        return null;
    }
}

/* ── Route handler ──────────────────────────────────────────────── */

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

    if (!body.source_type || !body.file_data_url) {
        return NextResponse.json(
            { error: 'source_type + file_data_url zijn verplicht' },
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

    /* Server-side dup-check, ook als client al hashte (defense-in-depth). */
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
       Path 1: UBL XML — pure parse, no AI, no cost.
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
            confidence_per_field: {
                leverancier: 1.0,
                datum: ubl.datum ? 1.0 : 0,
                totaal_bedrag: 1.0,
                btw: 1.0,
            },
            processing_status: ubl.suggested_status,
            image_hash: imageHash,
            ocr_engine: 'ubl-parse',
            mime_type: parsed.mediaType,
            pages: null,
            ai_cost_eur_cents: 0,
            ai_classify_status: 'auto_accepted',
        });
    }

    /* ── AI paths: cap-check vóór elke Anthropic-call ──────────────── */
    const isPdf = body.source_type === 'pdf' || parsed.mediaType === 'application/pdf';
    const estimatedCost = isPdf ? 0.05 : 0.03;
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

    /* ────────────────────────────────────────────────────────────────
       Path 2: PDF — text-first (Haiku), fallback to vision (Sonnet).
       ──────────────────────────────────────────────────────────────── */
    if (isPdf) {
        const usableText = body.pdf_text && isUsableText(body.pdf_text);

        if (usableText) {
            /* Goedkoop pad: Haiku op de geëxtraheerde tekst (~€0.001/bon). */
            const r = await client.messages.create({
                model: 'claude-haiku-4-5',
                max_tokens: 1800,
                system: [
                    {
                        type: 'text',
                        text: PDF_TEXT_PROMPT,
                        cache_control: { type: 'ephemeral' },
                    },
                ],
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text:
                                    'PDF-text:\n<document>\n' +
                                    body.pdf_text!.slice(0, 60_000) +
                                    '\n</document>',
                            },
                        ],
                    },
                ],
            });

            const costCents = estimateAiCostCents({
                model: 'claude-haiku-4-5',
                tokens_input: r.usage.input_tokens || 0,
                tokens_output: r.usage.output_tokens || 0,
                tokens_cache_read: r.usage.cache_read_input_tokens || 0,
                tokens_cache_creation: r.usage.cache_creation_input_tokens || 0,
            });
            void logAiUsageServer({
                organization_id: orgId,
                user_id: user.id,
                action_type: 'other',
                model: 'claude-haiku-4-5',
                tokens_input: r.usage.input_tokens || 0,
                tokens_output: r.usage.output_tokens || 0,
                tokens_cache_read: r.usage.cache_read_input_tokens || 0,
                tokens_cache_creation: r.usage.cache_creation_input_tokens || 0,
                cost_eur_cents: costCents,
                metadata: { route: 'bonnen-extract', source_type: 'pdf-text' },
            });

            const textBlock = r.content.find((c: any) => c.type === 'text') as any;
            return buildAiResponse({
                raw: textBlock?.text ?? '',
                source_type: 'pdf',
                ocr_engine: 'haiku-text',
                mime_type: parsed.mediaType,
                pages: null,
                image_hash: imageHash,
                inventory,
                leveranciers,
                datum_hint: body.datum_hint,
                cost_cents: costCents,
            });
        }

        /* Image-PDF: Sonnet 4.6 met native document-block (multi-page +
           citations support). Geen Files API-upload nodig voor single-shot;
           native base64-document werkt en kost geen extra round-trip. */
        const r = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 2500,
            system: [
                {
                    type: 'text',
                    text: VISION_PROMPT,
                    cache_control: { type: 'ephemeral' },
                },
            ],
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'document',
                            source: {
                                type: 'base64',
                                media_type: 'application/pdf' as any,
                                data: parsed.base64,
                            },
                            /* citations: laat het model regels uit het document letterlijk
                               citeren (voor confidence-display in UI). */
                            citations: { enabled: true },
                        } as any,
                        { type: 'text', text: 'Extract deze bon.' },
                    ],
                },
            ],
        });

        const costCents = estimateAiCostCents({
            model: 'claude-sonnet-4-6',
            tokens_input: r.usage.input_tokens || 0,
            tokens_output: r.usage.output_tokens || 0,
            tokens_cache_read: r.usage.cache_read_input_tokens || 0,
            tokens_cache_creation: r.usage.cache_creation_input_tokens || 0,
        });
        void logAiUsageServer({
            organization_id: orgId,
            user_id: user.id,
            action_type: 'other',
            model: 'claude-sonnet-4-6',
            tokens_input: r.usage.input_tokens || 0,
            tokens_output: r.usage.output_tokens || 0,
            tokens_cache_read: r.usage.cache_read_input_tokens || 0,
            tokens_cache_creation: r.usage.cache_creation_input_tokens || 0,
            cost_eur_cents: costCents,
            metadata: { route: 'bonnen-extract', source_type: 'pdf-document' },
        });

        const textBlock = r.content.find((c: any) => c.type === 'text') as any;
        return buildAiResponse({
            raw: textBlock?.text ?? '',
            source_type: 'pdf',
            ocr_engine: 'sonnet-files',
            mime_type: parsed.mediaType,
            pages: null,
            image_hash: imageHash,
            inventory,
            leveranciers,
            datum_hint: body.datum_hint,
            cost_cents: costCents,
        });
    }

    /* ────────────────────────────────────────────────────────────────
       Path 3: Image (photo/screenshot/clipboard/camera) — Haiku vision.
       ──────────────────────────────────────────────────────────────── */
    const allowedImageMimes = new Set([
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/gif',
    ]);
    if (!allowedImageMimes.has(parsed.mediaType)) {
        return NextResponse.json(
            {
                error: 'unsupported_mime',
                message: `Format ${parsed.mediaType} niet ondersteund. Probeer JPEG, PNG, PDF of UBL-XML.`,
            },
            { status: 415 },
        );
    }

    const r = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1800,
        system: [
            {
                type: 'text',
                text: VISION_PROMPT,
                cache_control: { type: 'ephemeral' },
            },
        ],
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: parsed.mediaType as any,
                            data: parsed.base64,
                        },
                    },
                    { type: 'text', text: 'Extract deze bon.' },
                ],
            },
        ],
    });

    const costCents = estimateAiCostCents({
        model: 'claude-haiku-4-5',
        tokens_input: r.usage.input_tokens || 0,
        tokens_output: r.usage.output_tokens || 0,
        tokens_cache_read: r.usage.cache_read_input_tokens || 0,
        tokens_cache_creation: r.usage.cache_creation_input_tokens || 0,
    });
    void logAiUsageServer({
        organization_id: orgId,
        user_id: user.id,
        action_type: 'other',
        model: 'claude-haiku-4-5',
        tokens_input: r.usage.input_tokens || 0,
        tokens_output: r.usage.output_tokens || 0,
        tokens_cache_read: r.usage.cache_read_input_tokens || 0,
        tokens_cache_creation: r.usage.cache_creation_input_tokens || 0,
        cost_eur_cents: costCents,
        metadata: { route: 'bonnen-extract', source_type: body.source_type },
    });

    const textBlock = r.content.find((c: any) => c.type === 'text') as any;
    return buildAiResponse({
        raw: textBlock?.text ?? '',
        source_type: body.source_type,
        ocr_engine: 'haiku-vision',
        mime_type: parsed.mediaType,
        pages: null,
        image_hash: imageHash,
        inventory,
        leveranciers,
        datum_hint: body.datum_hint,
        cost_cents: costCents,
    });
}

/* ── Shared response-builder voor alle AI-paths ──────────────────── */

interface BuildArgs {
    raw: string;
    source_type: SourceType;
    ocr_engine: 'haiku-vision' | 'haiku-text' | 'sonnet-files';
    mime_type: string;
    pages: number | null;
    image_hash: string;
    inventory: Array<{ id: number; naam: string }>;
    leveranciers: Array<{ id: number; naam: string; type?: string | null }>;
    datum_hint?: string;
    cost_cents: number;
}

function buildAiResponse(args: BuildArgs): NextResponse {
    const parsed = parseAiJson(args.raw);
    if (!parsed || parsed.error) {
        return NextResponse.json(
            {
                error: 'extract_failed',
                message:
                    parsed?.error || 'AI kon de bon niet uitlezen. Probeer een scherpere foto.',
                raw: args.raw.slice(0, 300),
            },
            { status: 422 },
        );
    }

    /* Normaliseer items via bonProcessing.normalizeBonItem (BTW gevalideerd). */
    const rawItems: any[] = Array.isArray(parsed.items) ? parsed.items : [];
    const normalized: BonItemRow[] = rawItems
        .map(it => {
            /* AI gebruikt prijs_per_eenheid; normalizeBonItem accepteert dat. */
            return normalizeBonItem({
                naam: it.naam,
                aantal: it.aantal,
                eenheid: it.eenheid,
                prijs: it.prijs_per_eenheid ?? it.prijs,
                totaal: it.totaal,
                btw_pct: it.btw_pct,
            });
        })
        .filter((x): x is BonItemRow => x != null);

    /* Items met inventory-suggestion verrijken. */
    const items_with_suggestions: ItemWithSuggestion[] = normalized.map(it => {
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

    /* Leverancier match via fuzzy lookup op de AI-string. */
    const leverancier_naam: string | null = parsed.leverancier
        ? String(parsed.leverancier).trim()
        : null;
    const matchedLev = leverancier_naam
        ? matchLeverancier(leverancier_naam, args.leveranciers)
        : null;

    /* BTW: niet vertrouwen op AI-totalen — herbereken uit gevalideerde regels. */
    const btw = parseBonBtw(normalized);
    const totaal_bedrag =
        typeof parsed.totaal_bedrag === 'number' && parsed.totaal_bedrag > 0
            ? parsed.totaal_bedrag
            : btw.bruto_bedrag;

    const datum = args.datum_hint || (parsed.datum && /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.datum)) ? parsed.datum : null);

    const aiConfidence =
        typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1
            ? parsed.confidence
            : 0.7;

    const preview: BonPreview = {
        leverancier_naam,
        leverancier_id: matchedLev?.id ?? null,
        datum,
        totaal_bedrag: Math.round(totaal_bedrag * 100) / 100,
        netto_bedrag: btw.netto_bedrag,
        btw_laag_bedrag: btw.btw_laag_bedrag,
        btw_hoog_bedrag: btw.btw_hoog_bedrag,
    };

    return NextResponse.json({
        ok: true,
        source_type: args.source_type,
        bon_preview: preview,
        items_with_suggestions,
        confidence_per_field: {
            leverancier: matchedLev ? aiConfidence : aiConfidence * 0.6,
            datum: datum ? aiConfidence : 0,
            totaal_bedrag: aiConfidence,
            btw: 0.9, // herberekend uit items
        },
        processing_status: aiConfidence < 0.6 ? 'extracted' : 'extracted',
        image_hash: args.image_hash,
        ocr_engine: args.ocr_engine,
        mime_type: args.mime_type,
        pages: args.pages,
        confidence: Math.round(aiConfidence * 100) / 100,
        ai_cost_eur_cents: args.cost_cents,
    });
}
